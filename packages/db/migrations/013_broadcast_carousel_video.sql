-- Migration 013: Allow 'carousel' and 'video' message_type in broadcasts and scenario_steps
-- SQLite does not support ALTER CHECK constraint, so we recreate the tables.

-- ── broadcasts ──────────────────────────────────────────────────────
CREATE TABLE broadcasts_new (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  line_account_id TEXT,
  message_type    TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'flex', 'carousel', 'video')),
  message_content TEXT NOT NULL,
  target_type     TEXT NOT NULL CHECK (target_type IN ('all', 'tag')) DEFAULT 'all',
  target_tag_id   TEXT REFERENCES tags (id) ON DELETE SET NULL,
  status          TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'sending', 'sent')) DEFAULT 'draft',
  scheduled_at    TEXT,
  sent_at         TEXT,
  total_count     INTEGER NOT NULL DEFAULT 0,
  success_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

INSERT INTO broadcasts_new SELECT * FROM broadcasts;
DROP TABLE broadcasts;
ALTER TABLE broadcasts_new RENAME TO broadcasts;

CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts (status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_line_account_id ON broadcasts (line_account_id);

-- ── scenario_steps ──────────────────────────────────────────────────
CREATE TABLE scenario_steps_new (
  id                TEXT PRIMARY KEY,
  scenario_id       TEXT NOT NULL REFERENCES scenarios (id) ON DELETE CASCADE,
  step_order        INTEGER NOT NULL,
  delay_minutes     INTEGER NOT NULL DEFAULT 0,
  message_type      TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'flex', 'carousel', 'video', 'rich_menu')),
  message_content   TEXT NOT NULL,
  condition_type    TEXT,
  condition_value   TEXT,
  next_step_on_false INTEGER,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

INSERT INTO scenario_steps_new SELECT * FROM scenario_steps;
DROP TABLE scenario_steps;
ALTER TABLE scenario_steps_new RENAME TO scenario_steps;

CREATE INDEX IF NOT EXISTS idx_scenario_steps_scenario ON scenario_steps (scenario_id);

-- ── reminder_steps ──────────────────────────────────────────────────
CREATE TABLE reminder_steps_new (
  id              TEXT PRIMARY KEY,
  reminder_id     TEXT NOT NULL REFERENCES reminders (id) ON DELETE CASCADE,
  offset_minutes  INTEGER NOT NULL,
  message_type    TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'flex', 'carousel', 'video')),
  message_content TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

INSERT INTO reminder_steps_new SELECT * FROM reminder_steps;
DROP TABLE reminder_steps;
ALTER TABLE reminder_steps_new RENAME TO reminder_steps;

CREATE INDEX IF NOT EXISTS idx_reminder_steps_reminder ON reminder_steps (reminder_id);
