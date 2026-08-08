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
}

module.exports = { client, init };
