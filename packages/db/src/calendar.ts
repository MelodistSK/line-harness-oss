import { jstNow } from './utils.js';
// Google Calendar 連携クエリヘルパー

export interface GoogleCalendarConnectionRow {
  id: string;
  calendar_id: string;
  access_token: string | null;
  refresh_token: string | null;
  api_key: string | null;
  auth_type: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CalendarBookingRow {
  id: string;
  connection_id: string;
  friend_id: string | null;
  event_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  metadata: string | null;
  booking_data: string | null;
  service_id: string | null;
  created_at: string;
  updated_at: string;
}

// --- Calendar Services (multi-service support) ---

export interface CalendarServiceRow {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  google_client_email: string | null;
  google_private_key: string | null;
  google_calendar_id: string | null;
  business_hours_start: string;
  business_hours_end: string;
  closed_days: string;
  closed_dates: string;
  booking_fields: string;
  booking_reply_enabled: number;
  booking_reply_content: string | null;
  max_advance_days: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export async function getCalendarServices(db: D1Database): Promise<CalendarServiceRow[]> {
  const result = await db.prepare('SELECT * FROM calendar_services ORDER BY created_at ASC').all<CalendarServiceRow>();
  return result.results;
}

export async function getActiveCalendarServices(db: D1Database): Promise<CalendarServiceRow[]> {
  const result = await db.prepare('SELECT * FROM calendar_services WHERE is_active = 1 ORDER BY created_at ASC').all<CalendarServiceRow>();
  return result.results;
}

export async function getCalendarServiceById(db: D1Database, id: string): Promise<CalendarServiceRow | null> {
  return db.prepare('SELECT * FROM calendar_services WHERE id = ?').bind(id).first<CalendarServiceRow>();
}

export async function createCalendarService(
  db: D1Database,
  input: Partial<Omit<CalendarServiceRow, 'id' | 'created_at' | 'updated_at'>> & { name: string },
): Promise<CalendarServiceRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const cols = ['id', 'name', 'created_at', 'updated_at'];
  const vals: unknown[] = [id, input.name, now, now];
  for (const [key, val] of Object.entries(input)) {
    if (key === 'name' || val === undefined) continue;
    cols.push(key);
    vals.push(val);
  }
  const placeholders = cols.map(() => '?').join(', ');
  await db.prepare(`INSERT INTO calendar_services (${cols.join(', ')}) VALUES (${placeholders})`).bind(...vals).run();
  return (await getCalendarServiceById(db, id))!;
}

export async function updateCalendarService(
  db: D1Database,
  id: string,
  data: Partial<Omit<CalendarServiceRow, 'id' | 'created_at' | 'updated_at'>>,
): Promise<CalendarServiceRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return getCalendarServiceById(db, id);
  sets.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);
  await db.prepare(`UPDATE calendar_services SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return getCalendarServiceById(db, id);
}

export async function deleteCalendarService(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM calendar_services WHERE id = ?').bind(id).run();
}

// --- 接続管理 ---

export async function getCalendarConnections(db: D1Database): Promise<GoogleCalendarConnectionRow[]> {
  const result = await db.prepare(`SELECT * FROM google_calendar_connections ORDER BY created_at DESC`).all<GoogleCalendarConnectionRow>();
  return result.results;
}

export async function getCalendarConnectionById(db: D1Database, id: string): Promise<GoogleCalendarConnectionRow | null> {
  return db.prepare(`SELECT * FROM google_calendar_connections WHERE id = ?`).bind(id).first<GoogleCalendarConnectionRow>();
}

export async function createCalendarConnection(
  db: D1Database,
  input: { calendarId: string; authType: string; accessToken?: string; refreshToken?: string; apiKey?: string },
): Promise<GoogleCalendarConnectionRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(`INSERT INTO google_calendar_connections (id, calendar_id, auth_type, access_token, refresh_token, api_key, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.calendarId, input.authType, input.accessToken ?? null, input.refreshToken ?? null, input.apiKey ?? null, now, now)
    .run();
  return (await getCalendarConnectionById(db, id))!;
}

export async function deleteCalendarConnection(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM google_calendar_connections WHERE id = ?`).bind(id).run();
}

// --- 予約管理 ---

export async function getCalendarBookings(db: D1Database, opts: { connectionId?: string; friendId?: string } = {}): Promise<CalendarBookingRow[]> {
  if (opts.friendId) {
    const result = await db.prepare(`SELECT * FROM calendar_bookings WHERE friend_id = ? ORDER BY start_at ASC`).bind(opts.friendId).all<CalendarBookingRow>();
    return result.results;
  }
  if (opts.connectionId) {
    const result = await db.prepare(`SELECT * FROM calendar_bookings WHERE connection_id = ? ORDER BY start_at ASC`).bind(opts.connectionId).all<CalendarBookingRow>();
    return result.results;
  }
  const result = await db.prepare(`SELECT * FROM calendar_bookings ORDER BY start_at ASC`).all<CalendarBookingRow>();
  return result.results;
}

export async function getCalendarBookingById(db: D1Database, id: string): Promise<CalendarBookingRow | null> {
  return db.prepare(`SELECT * FROM calendar_bookings WHERE id = ?`).bind(id).first<CalendarBookingRow>();
}

export async function createCalendarBooking(
  db: D1Database,
  input: { connectionId: string; friendId?: string; eventId?: string; title: string; startAt: string; endAt: string; metadata?: string; bookingData?: string; serviceId?: string },
): Promise<CalendarBookingRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(`INSERT INTO calendar_bookings (id, connection_id, friend_id, event_id, title, start_at, end_at, metadata, booking_data, service_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.connectionId, input.friendId ?? null, input.eventId ?? null, input.title, input.startAt, input.endAt, input.metadata ?? null, input.bookingData ?? null, input.serviceId ?? null, now, now)
    .run();
  return (await getCalendarBookingById(db, id))!;
}

export async function updateCalendarBookingStatus(db: D1Database, id: string, status: string): Promise<void> {
  await db.prepare(`UPDATE calendar_bookings SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, jstNow(), id).run();
}

export async function updateCalendarBookingEventId(db: D1Database, id: string, eventId: string): Promise<void> {
  await db.prepare(`UPDATE calendar_bookings SET event_id = ?, updated_at = ? WHERE id = ?`)
    .bind(eventId, jstNow(), id).run();
}

/** 空きスロット計算用: 指定日範囲の予約一覧を取得 */
export async function getBookingsInRange(db: D1Database, connectionId: string, startAt: string, endAt: string): Promise<CalendarBookingRow[]> {
  const result = await db
    .prepare(`SELECT * FROM calendar_bookings WHERE connection_id = ? AND start_at >= ? AND end_at <= ? AND status != 'cancelled' ORDER BY start_at ASC`)
    .bind(connectionId, startAt, endAt)
    .all<CalendarBookingRow>();
  return result.results;
}

/** 空きスロット計算用: 指定日範囲の予約一覧を取得（connection_id なし） */
export async function getBookingsInDateRange(db: D1Database, startAt: string, endAt: string, serviceId?: string): Promise<CalendarBookingRow[]> {
  if (serviceId) {
    const result = await db
      .prepare(`SELECT * FROM calendar_bookings WHERE start_at < ? AND end_at > ? AND status != 'cancelled' AND service_id = ? ORDER BY start_at ASC`)
      .bind(endAt, startAt, serviceId)
      .all<CalendarBookingRow>();
    return result.results;
  }
  const result = await db
    .prepare(`SELECT * FROM calendar_bookings WHERE start_at < ? AND end_at > ? AND status != 'cancelled' ORDER BY start_at ASC`)
    .bind(endAt, startAt)
    .all<CalendarBookingRow>();
  return result.results;
}

/** Filter bookings by date range and optional status */
export async function getCalendarBookingsFiltered(
  db: D1Database,
  opts: { startDate?: string; endDate?: string; status?: string; serviceId?: string } = {},
): Promise<CalendarBookingRow[]> {
  let sql = `SELECT * FROM calendar_bookings WHERE 1=1`;
  const params: unknown[] = [];
  if (opts.startDate) {
    sql += ` AND start_at >= ?`;
    params.push(opts.startDate);
  }
  if (opts.endDate) {
    sql += ` AND start_at <= ?`;
    params.push(opts.endDate);
  }
  if (opts.status) {
    sql += ` AND status = ?`;
    params.push(opts.status);
  }
  if (opts.serviceId) {
    sql += ` AND service_id = ?`;
    params.push(opts.serviceId);
  }
  sql += ` ORDER BY start_at ASC`;
  const result = await db.prepare(sql).bind(...params).all<CalendarBookingRow>();
  return result.results;
}

// --- Booking Reminders ---

export interface BookingReminderRow {
  id: string;
  service_id: string | null;
  timing_value: number;
  timing_unit: string;
  message_type: string;
  message_content: string;
  include_cancel_button: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface BookingReminderLogRow {
  id: string;
  booking_id: string;
  reminder_id: string;
  sent_at: string | null;
  status: string;
}

export async function getBookingReminders(db: D1Database, serviceId?: string | null): Promise<BookingReminderRow[]> {
  if (serviceId) {
    const result = await db.prepare(
      `SELECT * FROM booking_reminders WHERE service_id = ? OR service_id IS NULL ORDER BY timing_value DESC`
    ).bind(serviceId).all<BookingReminderRow>();
    return result.results;
  }
  const result = await db.prepare('SELECT * FROM booking_reminders ORDER BY timing_value DESC').all<BookingReminderRow>();
  return result.results;
}

export async function getActiveBookingReminders(db: D1Database): Promise<BookingReminderRow[]> {
  const result = await db.prepare('SELECT * FROM booking_reminders WHERE is_active = 1 ORDER BY timing_value DESC').all<BookingReminderRow>();
  return result.results;
}

export async function getBookingReminderById(db: D1Database, id: string): Promise<BookingReminderRow | null> {
  return db.prepare('SELECT * FROM booking_reminders WHERE id = ?').bind(id).first<BookingReminderRow>();
}

export async function createBookingReminder(
  db: D1Database,
  input: { serviceId?: string | null; timingValue: number; timingUnit: string; messageType?: string; messageContent: string; includeCancelButton?: number; isActive?: number },
): Promise<BookingReminderRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(
    `INSERT INTO booking_reminders (id, service_id, timing_value, timing_unit, message_type, message_content, include_cancel_button, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.serviceId ?? null, input.timingValue, input.timingUnit, input.messageType ?? 'flex', input.messageContent, input.includeCancelButton ?? 1, input.isActive ?? 1, now, now).run();
  return (await getBookingReminderById(db, id))!;
}

export async function updateBookingReminder(
  db: D1Database,
  id: string,
  data: Partial<{ serviceId: string | null; timingValue: number; timingUnit: string; messageType: string; messageContent: string; includeCancelButton: number; isActive: number }>,
): Promise<BookingReminderRow | null> {
  const map: Record<string, string> = {
    serviceId: 'service_id', timingValue: 'timing_value', timingUnit: 'timing_unit',
    messageType: 'message_type', messageContent: 'message_content',
    includeCancelButton: 'include_cancel_button', isActive: 'is_active',
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && map[key]) {
      sets.push(`${map[key]} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return getBookingReminderById(db, id);
  sets.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);
  await db.prepare(`UPDATE booking_reminders SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return getBookingReminderById(db, id);
}

export async function deleteBookingReminder(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM booking_reminders WHERE id = ?').bind(id).run();
}

export async function getBookingReminderLog(db: D1Database, bookingId: string, reminderId: string): Promise<BookingReminderLogRow | null> {
  return db.prepare('SELECT * FROM booking_reminder_logs WHERE booking_id = ? AND reminder_id = ?').bind(bookingId, reminderId).first<BookingReminderLogRow>();
}

export async function createBookingReminderLog(
  db: D1Database,
  bookingId: string,
  reminderId: string,
  status: string,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = status === 'sent' ? jstNow() : null;
  await db.prepare(
    `INSERT OR IGNORE INTO booking_reminder_logs (id, booking_id, reminder_id, sent_at, status) VALUES (?, ?, ?, ?, ?)`
  ).bind(id, bookingId, reminderId, now, status).run();
}

export async function updateBookingReminderLogStatus(db: D1Database, bookingId: string, reminderId: string, status: string): Promise<void> {
  const now = status === 'sent' ? jstNow() : null;
  await db.prepare(
    `UPDATE booking_reminder_logs SET status = ?, sent_at = COALESCE(?, sent_at) WHERE booking_id = ? AND reminder_id = ?`
  ).bind(status, now, bookingId, reminderId).run();
}

/** Get upcoming confirmed bookings (for cron processing) */
export async function getUpcomingBookings(db: D1Database, beforeTime: string): Promise<CalendarBookingRow[]> {
  const result = await db.prepare(
    `SELECT * FROM calendar_bookings WHERE status = 'confirmed' AND start_at > ? AND start_at <= ? ORDER BY start_at ASC`
  ).bind(jstNow(), beforeTime).all<CalendarBookingRow>();
  return result.results;
}

// --- Calendar Settings ---

export interface CalendarSettingsRow {
  id: string;
  google_client_email: string | null;
  google_private_key: string | null;
  google_calendar_id: string | null;
  business_hours_start: string;
  business_hours_end: string;
  slot_duration: number;
  closed_days: string;
  closed_dates: string;
  booking_fields: string;
  booking_reply_enabled: number;
  booking_reply_content: string | null;
  max_advance_days: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS_ID = 'default';

export async function getCalendarSettings(db: D1Database): Promise<CalendarSettingsRow | null> {
  return db.prepare('SELECT * FROM calendar_settings WHERE id = ?').bind(DEFAULT_SETTINGS_ID).first<CalendarSettingsRow>();
}

export async function upsertCalendarSettings(
  db: D1Database,
  data: Partial<Omit<CalendarSettingsRow, 'id' | 'created_at' | 'updated_at'>>,
): Promise<CalendarSettingsRow> {
  const existing = await getCalendarSettings(db);
  const now = jstNow();

  if (existing) {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?');
      values.push(now);
      values.push(DEFAULT_SETTINGS_ID);
      await db.prepare(`UPDATE calendar_settings SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
    }
  } else {
    const cols = ['id', 'created_at', 'updated_at'];
    const vals: unknown[] = [DEFAULT_SETTINGS_ID, now, now];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        cols.push(key);
        vals.push(val);
      }
    }
    const placeholders = cols.map(() => '?').join(', ');
    await db.prepare(`INSERT INTO calendar_settings (${cols.join(', ')}) VALUES (${placeholders})`).bind(...vals).run();
  }
  return (await getCalendarSettings(db))!;
}
