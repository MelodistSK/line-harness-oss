-- 010: Rich menu ↔ tag mappings for segment-based menu switching
CREATE TABLE IF NOT EXISTS rich_menu_tag_mappings (
  id            TEXT PRIMARY KEY,
  tag_id        TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  rich_menu_id  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  UNIQUE(tag_id)
);

CREATE INDEX IF NOT EXISTS idx_rmtm_tag_id ON rich_menu_tag_mappings (tag_id);
