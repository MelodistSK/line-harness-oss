-- Pending ref scan records: links QR scan to friend-add via IP matching
CREATE TABLE IF NOT EXISTS ref_scans (
  id TEXT PRIMARY KEY,
  ref_code TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  friend_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_ref_scans_ref ON ref_scans (ref_code);
CREATE INDEX IF NOT EXISTS idx_ref_scans_ip ON ref_scans (ip_address, created_at);
