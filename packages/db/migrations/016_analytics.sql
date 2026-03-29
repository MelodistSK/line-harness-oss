-- QR Codes for source tracking
CREATE TABLE IF NOT EXISTS qr_codes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ref_code TEXT UNIQUE NOT NULL,
  scan_count INTEGER NOT NULL DEFAULT 0,
  friend_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_ref ON qr_codes (ref_code);
