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

// `time` is stored as free text (e.g. "7:00", "13:30", or occasionally "~"
// for an ongoing/unspecified slot) and every list view sorts with plain
// "ORDER BY time" — which is a TEXT sort, so unpadded hours sort wrong
// ("13:30" comes before "7:00" alphabetically, since '1' < '7'). Zero-
// padding here at write-time makes plain text sort match chronological
// order everywhere, without needing every query to reimplement time parsing.
function normalizeTime(t) {
  const s = String(t || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s; // non-standard values (e.g. "~") pass through unchanged
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// Validates and normalizes an event payload before it ever reaches a DB
// bind call. The DB driver throws an opaque, hard-crashing "Unsupported
// type of value" error if any bind parameter is `undefined` (e.g. a
// missing/unparseable `day`) — this catches that up front with a clear,
// specific 400 error instead, and coerces optional fields to safe defaults
// so a single bad row can't take down an entire batch save.
function validateEventInput(e, index) {
  const day = Number(e.day);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return {
      error: `Event #${index + 1}${e.name_en ? ` ("${e.name_en}")` : ""} has an invalid or missing day (${JSON.stringify(
        e.day
      )}). Please set a valid date (1-31) before saving.`,
    };
  }
  return {
    value: {
      day,
      time: normalizeTime(e.time),
      name_en: e.name_en || "",
      name_zh: e.name_zh || "",
      name_ja: e.name_ja || "",
      color: e.color || "yellow",
      template_id: e.template_id || null,
      needs_signup: e.needs_signup === false ? 0 : 1,
      roles: (e.roles || []).map((r) => ({
        name_en: r.name_en || "",
        name_zh: r.name_zh || "",
        name_ja: r.name_ja || "",
        limit_count: Number.isFinite(Number(r.limit_count)) && Number(r.limit_count) > 0 ? Number(r.limit_count) : 1,
      })),
    },
  };
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

// ---------- calendars ----------
router.get(
  "/calendars",
  h(async (req, res) => {
    const result = await client.execute("SELECT * FROM calendars ORDER BY sort_order, id");
    res.json(result.rows);
  })
);

router.post(
  "/calendars",
  h(async (req, res) => {
    const { name_en, name_zh = "", name_ja = "" } = req.body || {};
    if (!name_en || !name_en.trim()) return res.status(400).json({ error: "name_en is required" });

    const countRes = await client.execute("SELECT COUNT(*) AS c FROM calendars");
    const info = await client.execute({
      sql: "INSERT INTO calendars (name_en, name_zh, name_ja, is_default, sort_order) VALUES (?, ?, ?, 0, ?)",
      args: [name_en.trim(), name_zh || "", name_ja || "", Number(countRes.rows[0].c)],
    });
    cache.clear();
    const created = await client.execute({
      sql: "SELECT * FROM calendars WHERE id = ?",
      args: [Number(info.lastInsertRowid)],
    });
    res.json(created.rows[0]);
  })
);

router.put(
  "/calendars/:id",
  h(async (req, res) => {
    const { id } = req.params;
    const { name_en, name_zh = "", name_ja = "" } = req.body || {};
    if (!name_en || !name_en.trim()) return res.status(400).json({ error: "name_en is required" });

    const existing = await client.execute({ sql: "SELECT id FROM calendars WHERE id = ?", args: [id] });
    if (!existing.rows[0]) return res.status(404).json({ error: "Calendar not found" });

    await client.execute({
      sql: "UPDATE calendars SET name_en=?, name_zh=?, name_ja=? WHERE id=?",
      args: [name_en.trim(), name_zh || "", name_ja || "", id],
    });
    cache.clear();
    const updated = await client.execute({ sql: "SELECT * FROM calendars WHERE id = ?", args: [id] });
    res.json(updated.rows[0]);
  })
);

router.delete(
  "/calendars/:id",
  h(async (req, res) => {
    const { id } = req.params;
    const existing = await client.execute({ sql: "SELECT * FROM calendars WHERE id = ?", args: [id] });
    if (!existing.rows[0]) return res.status(404).json({ error: "Calendar not found" });
    if (existing.rows[0].is_default) {
      return res.status(400).json({ error: "The main calendar can't be deleted." });
    }

    const tx = await client.transaction("write");
    try {
      const evRes = await tx.execute({ sql: "SELECT id FROM events WHERE calendar_id = ?", args: [id] });
      for (const row of evRes.rows) {
        await tx.execute({ sql: "DELETE FROM signups WHERE event_id = ?", args: [row.id] });
        await tx.execute({ sql: "DELETE FROM event_roles WHERE event_id = ?", args: [row.id] });
      }
      await tx.execute({ sql: "DELETE FROM events WHERE calendar_id = ?", args: [id] });
      await tx.execute({ sql: "DELETE FROM calendars WHERE id = ?", args: [id] });
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    cache.clear();
    res.json({ ok: true });
  })
);

// ---------- events ----------
router.get(
  "/events",
  h(async (req, res) => {
    const { year, month, calendar_id = 1 } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });
    const eRes = await client.execute({
      sql: "SELECT * FROM events WHERE calendar_id = ? AND year = ? AND month = ? ORDER BY day, time",
      args: [calendar_id, year, month],
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
    const { year, month, calendar_id = 1, replace = false, events = [] } = req.body || {};
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });

    // validate every row up front — reject with a clear message naming the
    // bad row, rather than crashing mid-transaction on a DB type error
    const validated = [];
    for (let i = 0; i < events.length; i++) {
      const result = validateEventInput(events[i], i);
      if (result.error) return res.status(400).json({ error: result.error });
      validated.push(result.value);
    }

    const tx = await client.transaction("write");
    const ids = [];
    try {
      if (replace) {
        // explicit cascade (don't rely on ON DELETE CASCADE / FK pragma,
        // which can behave inconsistently over Turso's remote connection)
        // — scoped to this calendar only, so replacing this month doesn't
        // touch other calendars' events in the same month.
        const oldEvents = await tx.execute({
          sql: "SELECT id FROM events WHERE calendar_id = ? AND year = ? AND month = ?",
          args: [calendar_id, year, month],
        });
        for (const row of oldEvents.rows) {
          await tx.execute({
            sql: "DELETE FROM signups WHERE event_id = ?",
            args: [row.id],
          });
          await tx.execute({ sql: "DELETE FROM event_roles WHERE event_id = ?", args: [row.id] });
        }
        await tx.execute({
          sql: "DELETE FROM events WHERE calendar_id = ? AND year = ? AND month = ?",
          args: [calendar_id, year, month],
        });
      }

      for (const e of validated) {
        const info = await tx.execute({
          sql: `INSERT INTO events (calendar_id, year, month, day, time, name_en, name_zh, name_ja, color, template_id, needs_signup)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            calendar_id,
            year,
            month,
            e.day,
            e.time,
            e.name_en,
            e.name_zh,
            e.name_ja,
            e.color,
            e.template_id,
            e.needs_signup,
          ],
        });
        const eventId = Number(info.lastInsertRowid);
        for (let i = 0; i < e.roles.length; i++) {
          const r = e.roles[i];
          await tx.execute({
            sql: `INSERT INTO event_roles (event_id, name_en, name_zh, name_ja, limit_count, sort_order)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [eventId, r.name_en, r.name_zh, r.name_ja, r.limit_count, i],
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

// Lightweight reschedule — updates ONLY day/time/name/color, and never
// touches event_roles or signups at all. This exists specifically so an
// admin can move an event to a different date/time without the full
// PUT /events/:id below wiping every sign-up in the process (that endpoint
// always deletes and recreates all roles, which cascades to delete their
// sign-ups, even when the roles themselves didn't change).
router.put(
  "/events/:id/schedule",
  h(async (req, res) => {
    const { id } = req.params;
    const existing = await client.execute({ sql: "SELECT id FROM events WHERE id = ?", args: [id] });
    if (!existing.rows[0]) return res.status(404).json({ error: "Event not found" });

    const { day, time, name_en, name_zh, name_ja, color } = req.body || {};
    const dayNum = Number(day);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
      return res.status(400).json({ error: `Invalid day (${JSON.stringify(day)}). Please set a valid date (1-31).` });
    }

    await client.execute({
      sql: `UPDATE events SET day=?, time=?, name_en=?, name_zh=?, name_ja=?, color=? WHERE id=?`,
      args: [
        dayNum,
        normalizeTime(time),
        name_en || "",
        name_zh || "",
        name_ja || "",
        color || "yellow",
        id,
      ],
    });

    const eRes = await client.execute({ sql: "SELECT * FROM events WHERE id = ?", args: [id] });
    const event = eRes.rows[0];
    await attachRoles([event]); // roles + their existing signups, untouched
    cache.clear();
    res.json(event);
  })
);

router.put(
  "/events/:id",
  h(async (req, res) => {
    const { id } = req.params;
    const existing = await client.execute({ sql: "SELECT id FROM events WHERE id = ?", args: [id] });
    if (!existing.rows[0]) return res.status(404).json({ error: "Event not found" });

    const result = validateEventInput(req.body || {}, 0);
    if (result.error) return res.status(400).json({ error: result.error });
    const e = result.value;

    const tx = await client.transaction("write");
    try {
      await tx.execute({
        sql: `UPDATE events SET day=?, time=?, name_en=?, name_zh=?, name_ja=?, color=?, needs_signup=?, template_id=?
              WHERE id=?`,
        args: [e.day, e.time, e.name_en, e.name_zh, e.name_ja, e.color, e.needs_signup, e.template_id, id],
      });

      // roles are being fully replaced — explicitly clear out sign-ups tied
      // to the old roles first (see note above about not relying on cascade)
      const oldRoles = await tx.execute({ sql: "SELECT id FROM event_roles WHERE event_id = ?", args: [id] });
      for (const r of oldRoles.rows) {
        await tx.execute({ sql: "DELETE FROM signups WHERE event_role_id = ?", args: [r.id] });
      }
      await tx.execute({ sql: "DELETE FROM event_roles WHERE event_id = ?", args: [id] });

      for (let i = 0; i < e.roles.length; i++) {
        const r = e.roles[i];
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

// batch delete — body: { ids: number[] }
router.post(
  "/events/bulk-delete",
  h(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) return res.status(400).json({ error: "ids is required" });

    const tx = await client.transaction("write");
    try {
      for (const id of ids) {
        await tx.execute({ sql: "DELETE FROM signups WHERE event_id = ?", args: [id] });
        await tx.execute({ sql: "DELETE FROM event_roles WHERE event_id = ?", args: [id] });
        await tx.execute({ sql: "DELETE FROM events WHERE id = ?", args: [id] });
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    cache.clear();
    res.json({ ok: true, deleted: ids.length });
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
async function getMonthReport(year, month, calendarId = 1) {
  const eRes = await client.execute({
    sql: "SELECT * FROM events WHERE calendar_id = ? AND year = ? AND month = ? ORDER BY day, time",
    args: [calendarId, year, month],
  });
  const events = eRes.rows;
  await attachRoles(events);
  return events;
}

router.get(
  "/reports/signups",
  h(async (req, res) => {
    const { year, month, calendar_id = 1 } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });
    res.json(await getMonthReport(year, month, calendar_id));
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
    const { year, month, calendar_id = 1 } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });
    const events = await getMonthReport(year, month, calendar_id);

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
