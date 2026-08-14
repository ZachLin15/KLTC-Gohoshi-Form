// Tiny in-memory TTL cache for public GET responses (calendar list, event
// detail). This only works correctly on a single server instance — fine
// here since Render's free tier runs one instance and there's no
// horizontal scaling — if that ever changes, this needs to move to a
// shared store (e.g. Redis) instead.
const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data;
}

function set(key, data, ttlMs) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Called after any write (signup, admin edits) so nobody sees stale data
// for longer than it takes the next request to hit the DB fresh.
function clear() {
  store.clear();
}

module.exports = { get, set, clear };
