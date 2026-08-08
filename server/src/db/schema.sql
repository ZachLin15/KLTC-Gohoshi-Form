-- Role templates: reusable sets of roles per event type
-- (e.g. "Sesshin Day" -> Altar Cleaning, AV, Cleaning, ...)
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

CREATE INDEX IF NOT EXISTS idx_events_month ON events(year, month);
CREATE INDEX IF NOT EXISTS idx_event_roles_event ON event_roles(event_id);
CREATE INDEX IF NOT EXISTS idx_signups_role ON signups(event_role_id);
