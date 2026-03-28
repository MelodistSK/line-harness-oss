-- Calendar settings (service account auth, business hours, booking config)
CREATE TABLE IF NOT EXISTS calendar_settings (
  id TEXT PRIMARY KEY,
  google_client_email TEXT,
  google_private_key TEXT,
  google_calendar_id TEXT,
  business_hours_start TEXT NOT NULL DEFAULT '09:00',
  business_hours_end TEXT NOT NULL DEFAULT '18:00',
  slot_duration INTEGER NOT NULL DEFAULT 30,
  closed_days TEXT NOT NULL DEFAULT '["sun"]',
  closed_dates TEXT NOT NULL DEFAULT '[]',
  booking_fields TEXT NOT NULL DEFAULT '[{"name":"name","label":"お名前","required":true},{"name":"phone","label":"電話番号","required":true},{"name":"email","label":"メール","required":false},{"name":"note","label":"備考","required":false}]',
  booking_reply_enabled INTEGER NOT NULL DEFAULT 1,
  booking_reply_content TEXT,
  max_advance_days INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

-- Add booking_data column to calendar_bookings for storing form field values
ALTER TABLE calendar_bookings ADD COLUMN booking_data TEXT;
