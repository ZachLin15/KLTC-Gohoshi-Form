const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { client } = require("../db");
const { attachRoles } = require("../services/roles");
const cache = require("../services/cache");
const { checkPassword, requireAdmin } = require("../middleware/adminAuth");
const { parsePdf } = require("../services/pdfParser");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });

// small helper so async route handlers don't need try/catch boilerplate
function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

// ---------- auth ----------
router.post("/login", (req, res) => {
  const { password } = req.body || {};
  if (checkPassword(password)) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Incorrect password" });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// everything below requires admin session
router.use(requireAdmin);

// ---------- PDF upload & parse (does NOT save to DB yet) ----------
router.post(
  "/upload-pdf",
  upload.single("pdf"),
  h(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    try {
      const parsed = await parsePdf(req.file.path);
      res.json(parsed);
    } finally {
      fs.unlink(req.file.path, () => {});
    }
  })
);

// ---------- role templates ----------
async function getTemplateWithRoles(id) {
  const tRes = await client.execute({ sql: "SELECT * FROM role_templates WHERE id = ?", args: [id] });
  const template = tRes.rows[0];
  if (!template) return null;
  const rRes = await client.execute({
    sql: "SELECT * FROM template_roles WHERE template_id = ? ORDER BY sort_order",
    args: [id],
  });
  template.roles = rRes.rows;
  return template;
}

router.get(
  "/templates",
  h(async (req, res) => {
    const tRes = await client.execute("SELECT * FROM role_templates ORDER BY name_en");
    const templates = tRes.rows;
    for (const t of templates) {
      const rRes = await client.execute({
        sql: "SELECT * FROM template_roles WHERE template_id = ? ORDER BY sort_order",
        args: [t.id],
      });
      t.roles = rRes.rows;
    }
    res.json(templates);
  })
);

router.post(
  "/templates",
  h(async (req, res) => {
    const { name_en, name_zh = "", name_ja = "", roles = [] } = req.body || {};
    if (!name_en) return res.status(400).json({ error: "name_en is required" });

    const tx = await client.transaction("write");
    let templateId;
    try {
      const info = await tx.execute({
        sql: "INSERT INTO role_templates (name_en, name_zh, name_ja) VALUES (?, ?, ?)",
        args: [name_en, name_zh, name_ja],
      });
      templateId = Number(info.lastInsertRowid);
      for (let i = 0; i < roles.length; i++) {
        const r = roles[i];
        await tx.execute({
          sql: `INSERT INTO template_roles (template_id, name_en, name_zh, name_ja, limit_count, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [templateId, r.name_en, r.name_zh || "", r.name_ja || "", r.limit_count || 1, i],
        });
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    res.json(await getTemplateWithRoles(templateId));
  })
);

router.put(
  "/templates/:id",
  h(async (req, res) => {
    const { id } = req.params;
    const { name_en, name_zh = "", name_ja = "", roles = [] } = req.body || {};
    const existing = await client.execute({ sql: "SELECT id FROM role_templates WHERE id = ?", args: [id] });
    if (!existing.rows[0]) return res.status(404).json({ error: "Template not found" });

    const tx = await client.transaction("write");
    try {
      await tx.execute({
        sql: "UPDATE role_templates SET name_en=?, name_zh=?, name_ja=? WHERE id=?",
        args: [name_en, name_zh, name_ja, id],
      });
      await tx.execute({ sql: "DELETE FROM template_roles WHERE template_id = ?", args: [id] });
      for (let i = 0; i < roles.length; i++) {
        const r = roles[i];
        await tx.execute({
          sql: `INSERT INTO template_roles (template_id, name_en, name_zh, name_ja, limit_count, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [id, r.name_en, r.name_zh || "", r.name_ja || "", r.limit_count || 1, i],
        });
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    res.json(await getTemplateWithRoles(id));
  })
);

router.delete(
  "/templates/:id",
  h(async (req, res) => {
    const { id } = req.params;
    const tx = await client.transaction("write");
    try {
      await tx.execute({ sql: "DELETE FROM template_roles WHERE template_id = ?", args: [id] });
      await tx.execute({ sql: "DELETE FROM role_templates WHERE id = ?", args: [id] });
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    res.json({ ok: true });
  })
);

// ---------- events ----------
router.get(
  "/events",
  h(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });
    const eRes = await client.execute({
      sql: "SELECT * FROM events WHERE year = ? AND month = ? ORDER BY day, time",
      args: [year, month],
    });
    res.json(await attachRoles(eRes.rows));
  })
);

router.get(
  "/events/:id",
  h(async (req, res) => {
    const eRes = await client.execute({ sql: "SELECT * FROM events WHERE id = ?", args: [req.params.id] });
    const event = eRes.rows[0];
    if (!event) return res.status(404).json({ error: "Event not found" });
    await attachRoles([event]);
    res.json(event);
  })
);

// Bulk-create events after the admin has reviewed the parsed PDF.
router.post(
  "/events/bulk",
  h(async (req, res) => {
    const { year, month, replace = false, events = [] } = req.body || {};
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });

    const tx = await client.transaction("write");
    const ids = [];
    try {
      if (replace) {
        // explicit cascade (don't rely on ON DELETE CASCADE / FK pragma,
        // which can behave inconsistently over Turso's remote connection)
        const oldEvents = await tx.execute({
          sql: "SELECT id FROM events WHERE year = ? AND month = ?",
          args: [year, month],
        });
        for (const row of oldEvents.rows) {
          await tx.execute({
            sql: "DELETE FROM signups WHERE event_id = ?",
            args: [row.id],
          });
          await tx.execute({ sql: "DELETE FROM event_roles WHERE event_id = ?", args: [row.id] });
        }
        await tx.execute({ sql: "DELETE FROM events WHERE year = ? AND month = ?", args: [year, month] });
      }

      for (const e of events) {
        const info = await tx.execute({
          sql: `INSERT INTO events (year, month, day, time, name_en, name_zh, name_ja, color, template_id, needs_signup)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            year,
            month,
            e.day,
            e.time || "",
            e.name_en || "",
            e.name_zh || "",
            e.name_ja || "",
            e.color || "yellow",
            e.template_id || null,
            e.needs_signup === false ? 0 : 1,
          ],
        });
        const eventId = Number(info.lastInsertRowid);
        const roles = e.roles || [];
        for (let i = 0; i < roles.length; i++) {
          const r = roles[i];
          await tx.execute({
            sql: `INSERT INTO event_roles (event_id, name_en, name_zh, name_ja, limit_count, sort_order)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [eventId, r.name_en, r.name_zh || "", r.name_ja || "", r.limit_count || 1, i],
          });
        }
        ids.push(eventId);
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    cache.clear();
    res.json({ ok: true, ids });
  })
);

router.put(
  "/events/:id",
  h(async (req, res) => {
    const { id } = req.params;
    const existing = await client.execute({ sql: "SELECT id FROM events WHERE id = ?", args: [id] });
    if (!existing.rows[0]) return res.status(404).json({ error: "Event not found" });

    const { day, time, name_en, name_zh, name_ja, color, needs_signup, template_id, roles = [] } =
      req.body || {};

    const tx = await client.transaction("write");
    try {
      await tx.execute({
        sql: `UPDATE events SET day=?, time=?, name_en=?, name_zh=?, name_ja=?, color=?, needs_signup=?, template_id=?
              WHERE id=?`,
        args: [
          day,
          time || "",
          name_en || "",
          name_zh || "",
          name_ja || "",
          color || "yellow",
          needs_signup === false ? 0 : 1,
          template_id || null,
          id,
        ],
      });

      // roles are being fully replaced — explicitly clear out sign-ups tied
      // to the old roles first (see note above about not relying on cascade)
      const oldRoles = await tx.execute({ sql: "SELECT id FROM event_roles WHERE event_id = ?", args: [id] });
      for (const r of oldRoles.rows) {
        await tx.execute({ sql: "DELETE FROM signups WHERE event_role_id = ?", args: [r.id] });
      }
      await tx.execute({ sql: "DELETE FROM event_roles WHERE event_id = ?", args: [id] });

      for (let i = 0; i < roles.length; i++) {
        const r = roles[i];
        await tx.execute({
          sql: `INSERT INTO event_roles (event_id, name_en, name_zh, name_ja, limit_count, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [id, r.name_en, r.name_zh || "", r.name_ja || "", r.limit_count || 1, i],
        });
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    const eRes = await client.execute({ sql: "SELECT * FROM events WHERE id = ?", args: [id] });
    const event = eRes.rows[0];
    await attachRoles([event]);
    cache.clear();
    res.json(event);
  })
);

router.delete(
  "/events/:id",
  h(async (req, res) => {
    const { id } = req.params;
    const tx = await client.transaction("write");
    try {
      await tx.execute({ sql: "DELETE FROM signups WHERE event_id = ?", args: [id] });
      await tx.execute({ sql: "DELETE FROM event_roles WHERE event_id = ?", args: [id] });
      await tx.execute({ sql: "DELETE FROM events WHERE id = ?", args: [id] });
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    cache.clear();
    res.json({ ok: true });
  })
);

// remove a single signup (admin override, e.g. someone asked to be removed)
router.delete(
  "/signups/:id",
  h(async (req, res) => {
    await client.execute({ sql: "DELETE FROM signups WHERE id = ?", args: [req.params.id] });
    cache.clear();
    res.json({ ok: true });
  })
);

// ---------- reports ----------
async function getMonthReport(year, month) {
  const eRes = await client.execute({
    sql: "SELECT * FROM events WHERE year = ? AND month = ? ORDER BY day, time",
    args: [year, month],
  });
  const events = eRes.rows;
  await attachRoles(events);
  return events;
}

router.get(
  "/reports/signups",
  h(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });
    res.json(await getMonthReport(year, month));
  })
);

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get(
  "/reports/signups.csv",
  h(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });
    const events = await getMonthReport(year, month);

    const rows = [["Date", "Time", "Event (EN)", "Event (ZH)", "Role (EN)", "Role (ZH)", "Signed up by", "Signed up at"]];
    for (const e of events) {
      for (const r of e.roles) {
        if (r.signups.length === 0) {
          rows.push([e.day, e.time, e.name_en, e.name_zh, r.name_en, r.name_zh, "", ""]);
        } else {
          for (const s of r.signups) {
            rows.push([e.day, e.time, e.name_en, e.name_zh, r.name_en, r.name_zh, s.name, s.created_at]);
          }
        }
      }
    }

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="kltc-signups-${year}-${String(month).padStart(2, "0")}.csv"`
    );
    res.send("\uFEFF" + csv); // BOM so Excel opens UTF-8 (Chinese names) correctly
  })
);

module.exports = router;
