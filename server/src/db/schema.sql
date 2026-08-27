-- Calendars: separate, independently-scoped event collections (e.g. "Main
-- Calendar", "Youth Program"). Admin can create any number of these; the
-- public switches between them via tabs. Every event belongs to exactly
-- one calendar.
CREATE TABLE IF NOT EXISTS calendars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en TEXT NOT NULL,
  name_zh TEXT DEFAULT '',
  name_ja TEXT DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0, -- the original "Main Calendar" — cannot be deleted
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Role templates: reusable sets of roles per event type
-- (e.g. "Sesshin Day" -> Altar Cleaning, AV, Cleaning, ...)
-- Shared across all calendars — no strong reason to duplicate these per
-- calendar, since they're just name+limit presets an admin can apply
-- anywhere.
CREATE TABLE IF NOT EXISTS role_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en TEXT NOT NULL,
  name_zh TEXT DEFAULT '',
  name_ja TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS template_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_zh TEXT DEFAULT '',
  name_ja TEXT DEFAULT '',
  limit_count INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Events: one per calendar entry for a given month/year/date
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL DEFAULT 1 REFERENCES calendars(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,     -- 1-12
  day INTEGER NOT NULL,       -- day of month
  time TEXT DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  name_zh TEXT DEFAULT '',
  name_ja TEXT DEFAULT '',
  color TEXT DEFAULT 'yellow',
  template_id INTEGER REFERENCES role_templates(id),
  needs_signup INTEGER NOT NULL DEFAULT 1, -- 0/1: does this event have roles at all?
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Roles actually attached to a specific event (copied from a template at
-- creation time, then independently editable per event)
CREATE TABLE IF NOT EXISTS event_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_zh TEXT DEFAULT '',
  name_ja TEXT DEFAULT '',
  limit_count INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_role_id INTEGER NOT NULL REFERENCES event_roles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- one signup per person per event (any role), enforced at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_signups_one_per_event
  ON signups(event_id, name_normalized);

CREATE INDEX IF NOT EXISTS idx_event_roles_event ON event_roles(event_id);
CREATE INDEX IF NOT EXISTS idx_signups_role ON signups(event_role_id);
