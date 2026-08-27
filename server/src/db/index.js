const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");

// Local dev (and any self-hosted deploy that doesn't want Turso): a plain
// SQLite file on disk, no account needed.
//   DB_URL=file:./data.sqlite
// Free hosted deploy (e.g. Render's free web service, which has no
// persistent disk): point at a free Turso database instead —
//   TURSO_DATABASE_URL=libsql://your-db-xxxx.turso.io
//   TURSO_AUTH_TOKEN=...
const url = process.env.TURSO_DATABASE_URL || process.env.DB_URL || `file:${path.join(__dirname, "..", "..", "data.sqlite")}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await client.executeMultiple(schema);

  // Migration for deployments that existed before multi-calendar support:
  // CREATE TABLE IF NOT EXISTS above won't retroactively add calendar_id to
  // an events table that already existed, so check and add it explicitly.
  // This MUST run before the calendar_id-dependent index below — that
  // index is deliberately kept out of schema.sql itself, since the
  // multi-statement batch above would otherwise fail outright on an old
  // table (with no calendar_id column yet) before ever reaching this
  // migration step, aborting the whole boot.
  try {
    const cols = await client.execute("PRAGMA table_info(events)");
    const hasCalendarId = cols.rows.some((r) => r.name === "calendar_id");
    if (!hasCalendarId) {
      await client.execute("ALTER TABLE events ADD COLUMN calendar_id INTEGER NOT NULL DEFAULT 1");
      console.log("Migrated: added calendar_id column to events table.");
    }
  } catch (e) {
    console.error("calendar_id migration check failed:", e.message);
  }

  await client.execute("CREATE INDEX IF NOT EXISTS idx_events_month ON events(calendar_id, year, month)");

  // Seed the default "Main Calendar" (id=1) if no calendars exist yet —
  // every pre-existing event implicitly belongs to this one via the
  // DEFAULT 1 above.
  const countRes = await client.execute("SELECT COUNT(*) AS c FROM calendars");
  if (Number(countRes.rows[0].c) === 0) {
    await client.execute({
      sql: `INSERT INTO calendars (id, name_en, name_zh, name_ja, is_default, sort_order)
            VALUES (1, 'Main Calendar', '主日历', 'メインカレンダー', 1, 0)`,
    });
    console.log("Seeded default 'Main Calendar'.");
  }
}

module.exports = { client, init };
