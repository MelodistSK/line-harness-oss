-- Calendar Services: multi-service/multi-calendar booking support
-- Each service has its own Google Calendar connection, business hours, and booking config

CREATE TABLE IF NOT EXISTS calendar_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL DEFAULT 30,
  google_client_email TEXT,
  google_private_key TEXT,
  google_calendar_id TEXT,
  business_hours_start TEXT NOT NULL DEFAULT '09:00',
  business_hours_end TEXT NOT NULL DEFAULT '18:00',
  closed_days TEXT NOT NULL DEFAULT '["sun"]',
  closed_dates TEXT NOT NULL DEFAULT '[]',
  booking_fields TEXT NOT NULL DEFAULT '[{"name":"name","label":"お名前","required":true},{"name":"phone","label":"電話番号","required":true}]',
  booking_reply_enabled INTEGER NOT NULL DEFAULT 1,
  booking_reply_content TEXT,
  max_advance_days INTEGER NOT NULL DEFAULT 30,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

-- Add service_id column to calendar_bookings
ALTER TABLE calendar_bookings ADD COLUMN service_id TEXT REFERENCES calendar_services(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_bookings_service ON calendar_bookings (service_id);

-- Migrate existing calendar_settings into calendar_services as the default service
INSERT OR IGNORE INTO calendar_services (
  id, name, description, duration,
  google_client_email, google_private_key, google_calendar_id,
  business_hours_start, business_hours_end,
  closed_days, closed_dates,
  booking_fields, booking_reply_enabled, booking_reply_content,
  max_advance_days, is_active, created_at, updated_at
)
SELECT
  'default',
  'デフォルト',
  '既存設定から移行されたサービス',
  slot_duration,
  google_client_email, google_private_key, google_calendar_id,
  business_hours_start, business_hours_end,
  closed_days, closed_dates,
  booking_fields, booking_reply_enabled, booking_reply_content,
  max_advance_days, 1, created_at, updated_at
FROM calendar_settings
WHERE id = 'default';

-- Link existing bookings to the default service
UPDATE calendar_bookings SET service_id = 'default' WHERE service_id IS NULL;
