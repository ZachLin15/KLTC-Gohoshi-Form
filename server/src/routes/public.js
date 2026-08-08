const express = require("express");
const { client } = require("../db");

const router = express.Router();

function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// GET /api/events?year=2026&month=8
router.get(
  "/events",
  h(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });
    const result = await client.execute({
      sql: `SELECT id, year, month, day, time, name_en, name_zh, name_ja, color, needs_signup
            FROM events WHERE year = ? AND month = ? ORDER BY day, time`,
      args: [year, month],
    });
    res.json(result.rows);
  })
);

// GET /api/events/:id  (detail + roles + live counts)
router.get(
  "/events/:id",
  h(async (req, res) => {
    const eRes = await client.execute({ sql: "SELECT * FROM events WHERE id = ?", args: [req.params.id] });
    const event = eRes.rows[0];
    if (!event) return res.status(404).json({ error: "Event not found" });

    const rRes = await client.execute({
      sql: "SELECT id, name_en, name_zh, name_ja, limit_count FROM event_roles WHERE event_id = ? ORDER BY sort_order",
      args: [event.id],
    });
    event.roles = rRes.rows;
    for (const r of event.roles) {
      const cRes = await client.execute({
        sql: "SELECT COUNT(*) AS c FROM signups WHERE event_role_id = ?",
        args: [r.id],
      });
      r.signup_count = Number(cRes.rows[0].c);
    }
    res.json(event);
  })
);

// POST /api/events/:id/signup  { role_id, name }
router.post(
  "/events/:id/signup",
  h(async (req, res) => {
    const eventId = Number(req.params.id);
    const { role_id, name } = req.body || {};
    const trimmedName = String(name || "").trim();

    if (!role_id || !trimmedName) {
      return res.status(400).json({ error: "role_id and name are required" });
    }
    if (trimmedName.length > 80) {
      return res.status(400).json({ error: "Name is too long" });
    }

    const eRes = await client.execute({ sql: "SELECT * FROM events WHERE id = ?", args: [eventId] });
    const event = eRes.rows[0];
    if (!event) return res.status(404).json({ error: "Event not found" });

    const rRes = await client.execute({
      sql: "SELECT * FROM event_roles WHERE id = ? AND event_id = ?",
      args: [role_id, eventId],
    });
    const role = rRes.rows[0];
    if (!role) return res.status(404).json({ error: "Role not found for this event" });

    const nameNorm = normalizeName(trimmedName);

    // interactive transaction: check-then-insert must be atomic so two
    // people can't both grab the last spot in the same role
    const tx = await client.transaction("write");
    try {
      const already = await tx.execute({
        sql: "SELECT id FROM signups WHERE event_id = ? AND name_normalized = ?",
        args: [eventId, nameNorm],
      });
      if (already.rows[0]) {
        await tx.rollback();
        return res.status(409).json({
          error: "You've already signed up for a role on this date.",
          code: "DUPLICATE",
        });
      }

      const countRes = await tx.execute({
        sql: "SELECT COUNT(*) AS c FROM signups WHERE event_role_id = ?",
        args: [role_id],
      });
      const count = Number(countRes.rows[0].c);
      if (count >= role.limit_count) {
        await tx.rollback();
        return res.status(409).json({ error: "This role is full. Please pick another role.", code: "FULL" });
      }

      await tx.execute({
        sql: "INSERT INTO signups (event_id, event_role_id, name, name_normalized) VALUES (?, ?, ?, ?)",
        args: [eventId, role_id, trimmedName, nameNorm],
      });
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    const rolesRes = await client.execute({
      sql: "SELECT id, name_en, name_zh, name_ja, limit_count FROM event_roles WHERE event_id = ? ORDER BY sort_order",
      args: [eventId],
    });
    const roles = rolesRes.rows;
    for (const r of roles) {
      const cRes = await client.execute({
        sql: "SELECT COUNT(*) AS c FROM signups WHERE event_role_id = ?",
        args: [r.id],
      });
      r.signup_count = Number(cRes.rows[0].c);
    }
    res.json({ ok: true, roles });
  })
);

module.exports = router;
