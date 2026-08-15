const express = require("express");
const { client } = require("../db");
const { getRolesByEventId } = require("../services/roles");
const cache = require("../services/cache");

const EVENTS_LIST_TTL_MS = 20_000; // calendar list rarely needs to be second-fresh
const EVENT_DETAIL_TTL_MS = 8_000; // shorter, since this is where signup counts matter most

const router = express.Router();

function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// strip other people's names before sending to the public — only counts
function publicRoles(roles) {
  return roles.map(({ id, name_en, name_zh, name_ja, limit_count, signup_count }) => ({
    id,
    name_en,
    name_zh,
    name_ja,
    limit_count,
    signup_count,
  }));
}

// GET /api/events?year=2026&month=8
// Includes roles + live counts (no names) inline, so opening the detail
// modal for any event on this list needs zero extra network round-trips —
// that's what was making the modal feel slow to open before.
router.get(
  "/events",
  h(async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: "year and month are required" });

    const cacheKey = `events:${year}:${month}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await client.execute({
      sql: `SELECT id, year, month, day, time, name_en, name_zh, name_ja, color, needs_signup
            FROM events WHERE year = ? AND month = ? ORDER BY day, time`,
      args: [year, month],
    });
    const events = result.rows;

    const rolesByEvent = await getRolesByEventId(events.map((e) => e.id));
    for (const e of events) {
      e.roles = publicRoles(rolesByEvent[e.id] || []);
    }

    cache.set(cacheKey, events, EVENTS_LIST_TTL_MS);
    res.json(events);
  })
);

// GET /api/events/:id  (detail + roles + live counts)
router.get(
  "/events/:id",
  h(async (req, res) => {
    const cacheKey = `event:${req.params.id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const eRes = await client.execute({ sql: "SELECT * FROM events WHERE id = ?", args: [req.params.id] });
    const event = eRes.rows[0];
    if (!event) return res.status(404).json({ error: "Event not found" });

    const rolesByEvent = await getRolesByEventId([event.id]);
    event.roles = publicRoles(rolesByEvent[event.id] || []);
    cache.set(cacheKey, event, EVENT_DETAIL_TTL_MS);
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
      cache.clear(); // this event's counts (and its month's list) just changed
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    const rolesByEvent = await getRolesByEventId([eventId]);
    const roles = publicRoles(rolesByEvent[eventId] || []);
    res.json({ ok: true, roles });
  })
);

// GET /api/signups/lookup?name=Alice Tan
// Lets a person check what they signed up for from any device — no
// login exists in this app, so this is name-based, same as signing up.
router.get(
  "/signups/lookup",
  h(async (req, res) => {
    const name = String(req.query.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const nameNorm = normalizeName(name);
    const result = await client.execute({
      sql: `SELECT s.id AS signup_id, s.name, s.created_at,
                   e.id AS event_id, e.year, e.month, e.day, e.time, e.color,
                   e.name_en AS event_name_en, e.name_zh AS event_name_zh, e.name_ja AS event_name_ja,
                   er.name_en AS role_name_en, er.name_zh AS role_name_zh, er.name_ja AS role_name_ja
            FROM signups s
            JOIN events e ON e.id = s.event_id
            JOIN event_roles er ON er.id = s.event_role_id
            WHERE s.name_normalized = ?
            ORDER BY e.year, e.month, e.day, e.time`,
      args: [nameNorm],
    });
    res.json(result.rows);
  })
);

module.exports = router;
