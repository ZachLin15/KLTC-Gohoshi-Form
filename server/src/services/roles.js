const { client } = require("../db");

/**
 * Fetches roles (with signups + signup_count) for a set of events in a
 * FIXED number of queries (2), no matter how many events or roles there
 * are — instead of one query per event plus one query per role.
 *
 * This matters a lot here specifically because the DB (Turso) is remote:
 * each query is a network round trip, so N+1 query patterns that felt fine
 * against a local SQLite file become genuinely slow (dozens of sequential
 * round trips to load one page) once the DB is remote.
 *
 * Returns: { [eventId]: RoleRow[] }, where each RoleRow has .signups
 * (array) and .signup_count attached.
 */
async function getRolesByEventId(eventIds) {
  const ids = eventIds.filter((id) => id != null);
  if (ids.length === 0) return {};

  const placeholders = ids.map(() => "?").join(",");
  const rolesRes = await client.execute({
    sql: `SELECT * FROM event_roles WHERE event_id IN (${placeholders}) ORDER BY event_id, sort_order`,
    args: ids,
  });
  const roles = rolesRes.rows;

  const roleIds = roles.map((r) => r.id);
  let signupsByRole = {};
  if (roleIds.length > 0) {
    const rolePlaceholders = roleIds.map(() => "?").join(",");
    const signupsRes = await client.execute({
      sql: `SELECT * FROM signups WHERE event_role_id IN (${rolePlaceholders}) ORDER BY event_role_id, created_at`,
      args: roleIds,
    });
    for (const s of signupsRes.rows) {
      (signupsByRole[s.event_role_id] = signupsByRole[s.event_role_id] || []).push(s);
    }
  }

  const rolesByEvent = {};
  for (const r of roles) {
    r.signups = signupsByRole[r.id] || [];
    r.signup_count = r.signups.length;
    (rolesByEvent[r.event_id] = rolesByEvent[r.event_id] || []).push(r);
  }
  return rolesByEvent;
}

/** Mutates `events` in place, attaching `.roles` (each with `.signups` and `.signup_count`). */
async function attachRoles(events) {
  const map = await getRolesByEventId(events.map((e) => e.id));
  for (const e of events) {
    e.roles = map[e.id] || [];
  }
  return events;
}

module.exports = { getRolesByEventId, attachRoles };
