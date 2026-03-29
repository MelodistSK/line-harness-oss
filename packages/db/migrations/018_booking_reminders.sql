-- 018: Booking Reminders — 予約リマインダー自動配信
-- booking_reminders: リマインダー設定（サービス別 or 全体共通）
-- booking_reminder_logs: 送信ログ（二重送信防止）

CREATE TABLE IF NOT EXISTS booking_reminders (
  id                    TEXT PRIMARY KEY,
  service_id            TEXT REFERENCES calendar_services (id) ON DELETE CASCADE,
  timing_value          INTEGER NOT NULL,
  timing_unit           TEXT NOT NULL CHECK (timing_unit IN ('days', 'hours', 'minutes')),
  message_type          TEXT NOT NULL DEFAULT 'flex' CHECK (message_type IN ('text', 'flex')),
  message_content       TEXT NOT NULL DEFAULT '',
  include_cancel_button INTEGER NOT NULL DEFAULT 1,
  is_active             INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_booking_reminders_service ON booking_reminders (service_id);

CREATE TABLE IF NOT EXISTS booking_reminder_logs (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL REFERENCES calendar_bookings (id) ON DELETE CASCADE,
  reminder_id TEXT NOT NULL REFERENCES booking_reminders (id) ON DELETE CASCADE,
  sent_at     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  UNIQUE (booking_id, reminder_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_reminder_logs_booking ON booking_reminder_logs (booking_id);
