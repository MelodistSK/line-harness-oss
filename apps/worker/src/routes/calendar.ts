import { Hono } from 'hono';
import {
  getCalendarSettings,
  upsertCalendarSettings,
  getCalendarConnections,
  getCalendarConnectionById,
  createCalendarConnection,
  deleteCalendarConnection,
  getCalendarBookings,
  getCalendarBookingById,
  createCalendarBooking,
  updateCalendarBookingStatus,
  updateCalendarBookingEventId,
  getBookingsInRange,
  getBookingsInDateRange,
  getCalendarBookingsFiltered,
  getCalendarServices,
  getActiveCalendarServices,
  getCalendarServiceById,
  createCalendarService,
  updateCalendarService,
  deleteCalendarService,
  getBookingReminders,
  getBookingReminderById,
  createBookingReminder,
  updateBookingReminder,
  deleteBookingReminder,
  getFriendById,
  toJstString,
} from '@line-crm/db';
import type { CalendarSettingsRow, CalendarServiceRow } from '@line-crm/db';
import { GoogleCalendarClient } from '../services/google-calendar.js';
import type { Env } from '../index.js';

const calendar = new Hono<Env>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createGCalClient(settings: CalendarSettingsRow): GoogleCalendarClient | null {
  if (!settings.google_client_email || !settings.google_private_key || !settings.google_calendar_id) return null;
  return new GoogleCalendarClient({
    calendarId: settings.google_calendar_id,
    serviceAccount: {
      clientEmail: settings.google_client_email,
      privateKey: settings.google_private_key,
    },
  });
}

function createGCalClientFromService(service: CalendarServiceRow): GoogleCalendarClient | null {
  if (!service.google_client_email || !service.google_private_key || !service.google_calendar_id) return null;
  return new GoogleCalendarClient({
    calendarId: service.google_calendar_id,
    serviceAccount: {
      clientEmail: service.google_client_email,
      privateKey: service.google_private_key,
    },
  });
}

/** Mask a private key for safe display: show first/last 10 chars */
function maskPrivateKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 24) return '***';
  return key.slice(0, 10) + '...' + key.slice(-10);
}

/** Normalize private key PEM format */
function normalizePrivateKey(key: string): string {
  let k = key.replace(/\\n/g, '\n').trim();
  if (!k.startsWith('-----BEGIN PRIVATE KEY-----')) {
    k = k.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/[\r\n\s]/g, '');
    k = `-----BEGIN PRIVATE KEY-----\n${k}\n-----END PRIVATE KEY-----`;
  }
  return k;
}

/** Map day-of-week index (0=Sun) to short name */
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// ========================================================================
// Calendar Services CRUD (auth required)
// ========================================================================

/** GET /api/calendar/services — list all services */
calendar.get('/api/calendar/services', async (c) => {
  try {
    const items = await getCalendarServices(c.env.DB);
    return c.json({
      success: true,
      data: items.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        duration: s.duration,
        googleClientEmail: s.google_client_email,
        googlePrivateKeySet: !!s.google_private_key,
        googleCalendarId: s.google_calendar_id,
        businessHoursStart: s.business_hours_start,
        businessHoursEnd: s.business_hours_end,
        closedDays: JSON.parse(s.closed_days || '[]'),
        closedDates: JSON.parse(s.closed_dates || '[]'),
        bookingFields: JSON.parse(s.booking_fields || '[]'),
        bookingReplyEnabled: !!s.booking_reply_enabled,
        bookingReplyContent: s.booking_reply_content,
        maxAdvanceDays: s.max_advance_days,
        isActive: !!s.is_active,
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/calendar/services error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/** POST /api/calendar/services — create a service */
calendar.post('/api/calendar/services', async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);

    const input: Record<string, unknown> = { name: body.name };
    const allowedFields = [
      'description', 'duration', 'google_client_email', 'google_private_key', 'google_calendar_id',
      'business_hours_start', 'business_hours_end', 'closed_days', 'closed_dates',
      'booking_fields', 'booking_reply_enabled', 'booking_reply_content', 'max_advance_days', 'is_active',
    ];
    for (const f of allowedFields) {
      if (body[f] !== undefined) input[f] = body[f];
    }
    if (typeof input.google_private_key === 'string' && input.google_private_key) {
      input.google_private_key = normalizePrivateKey(input.google_private_key as string);
    }

    const service = await createCalendarService(c.env.DB, input as Parameters<typeof createCalendarService>[1]);
    return c.json({ success: true, data: { id: service.id, name: service.name } }, 201);
  } catch (err) {
    console.error('POST /api/calendar/services error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/** PUT /api/calendar/services/:id — update a service */
calendar.put('/api/calendar/services/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getCalendarServiceById(c.env.DB, id);
    if (!existing) return c.json({ success: false, error: 'Service not found' }, 404);

    const body = await c.req.json<Record<string, unknown>>();
    if (typeof body.google_private_key === 'string' && body.google_private_key) {
      body.google_private_key = normalizePrivateKey(body.google_private_key as string);
    }

    const updated = await updateCalendarService(c.env.DB, id, body as Parameters<typeof updateCalendarService>[2]);
    return c.json({
      success: true,
      data: updated ? { id: updated.id, name: updated.name } : null,
    });
  } catch (err) {
    console.error('PUT /api/calendar/services/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/** DELETE /api/calendar/services/:id — delete a service */
calendar.delete('/api/calendar/services/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteCalendarService(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/calendar/services/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/** POST /api/calendar/services/:id/test-connection — test connection for a specific service */
calendar.post('/api/calendar/services/:id/test-connection', async (c) => {
  try {
    const id = c.req.param('id');
    const service = await getCalendarServiceById(c.env.DB, id);
    if (!service) return c.json({ success: false, error: 'Service not found' }, 404);

    const gcal = createGCalClientFromService(service);
    if (!gcal) {
      return c.json({ success: false, error: 'Missing Google credentials: client_email, private_key, or calendar_id is empty' }, 400);
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeMin = `${todayStr}T00:00:00+09:00`;
    const timeMax = `${todayStr}T23:59:59+09:00`;

    let busy: { start: string; end: string }[];
    try {
      busy = await gcal.getFreeBusy(timeMin, timeMax);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: msg }, 400);
    }

    return c.json({
      success: true,
      data: {
        message: 'Connection successful',
        calendarId: service.google_calendar_id,
        busyIntervalsToday: busy.length,
      },
    });
  } catch (err) {
    console.error('POST /api/calendar/services/:id/test-connection error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========================================================================
// Legacy Settings endpoints (auth required) — still work for backward compat
// ========================================================================

calendar.get('/api/calendar/settings', async (c) => {
  try {
    const settings = await getCalendarSettings(c.env.DB);
    if (!settings) return c.json({ success: true, data: null });
    return c.json({
      success: true,
      data: {
        googleClientEmail: settings.google_client_email,
        googlePrivateKeySet: !!settings.google_private_key,
        googleCalendarId: settings.google_calendar_id,
        businessHoursStart: settings.business_hours_start,
        businessHoursEnd: settings.business_hours_end,
        slotDuration: settings.slot_duration,
        closedDays: JSON.parse(settings.closed_days || '[]'),
        closedDates: JSON.parse(settings.closed_dates || '[]'),
        bookingFields: JSON.parse(settings.booking_fields || '[]'),
        bookingReplyEnabled: !!settings.booking_reply_enabled,
        bookingReplyContent: settings.booking_reply_content,
        maxAdvanceDays: settings.max_advance_days,
      },
    });
  } catch (err) {
    console.error('GET /api/calendar/settings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.put('/api/calendar/settings', async (c) => {
  try {
    const body = await c.req.json<Partial<Omit<CalendarSettingsRow, 'id' | 'created_at' | 'updated_at'>>>();
    if (body.google_private_key) {
      body.google_private_key = normalizePrivateKey(body.google_private_key);
    }
    const updated = await upsertCalendarSettings(c.env.DB, body);
    return c.json({
      success: true,
      data: { ...updated, google_private_key: maskPrivateKey(updated.google_private_key) },
    });
  } catch (err) {
    console.error('PUT /api/calendar/settings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.post('/api/calendar/test-connection', async (c) => {
  try {
    const settings = await getCalendarSettings(c.env.DB);
    if (!settings) return c.json({ success: false, error: 'Calendar settings not configured' }, 400);
    const gcal = createGCalClient(settings);
    if (!gcal) return c.json({ success: false, error: 'Missing Google credentials' }, 400);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeMin = `${todayStr}T00:00:00+09:00`;
    const timeMax = `${todayStr}T23:59:59+09:00`;

    let busy: { start: string; end: string }[];
    try {
      busy = await gcal.getFreeBusy(timeMin, timeMax);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: msg }, 400);
    }
    return c.json({
      success: true,
      data: { message: 'Connection successful', calendarId: settings.google_calendar_id, busyIntervalsToday: busy.length },
    });
  } catch (err) {
    console.error('POST /api/calendar/test-connection error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========================================================================
// Public endpoints (no auth)
// ========================================================================

/**
 * GET /api/calendar/settings-public
 * Return public booking settings — now returns all active services
 */
calendar.get('/api/calendar/settings-public', async (c) => {
  try {
    const services = await getActiveCalendarServices(c.env.DB);

    // If services exist, return service-based config
    if (services.length > 0) {
      return c.json({
        success: true,
        data: {
          services: services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            duration: s.duration,
            businessHoursStart: s.business_hours_start,
            businessHoursEnd: s.business_hours_end,
            closedDays: JSON.parse(s.closed_days || '[]'),
            maxAdvanceDays: s.max_advance_days,
            bookingFields: JSON.parse(s.booking_fields || '[]'),
          })),
          // Legacy fields from first service for backward compat
          businessHoursStart: services[0].business_hours_start,
          businessHoursEnd: services[0].business_hours_end,
          slotDuration: services[0].duration,
          closedDays: JSON.parse(services[0].closed_days || '[]'),
          maxAdvanceDays: services[0].max_advance_days,
          bookingFields: JSON.parse(services[0].booking_fields || '[]'),
        },
      });
    }

    // Fallback to legacy calendar_settings
    const settings = await getCalendarSettings(c.env.DB);
    if (!settings) return c.json({ success: true, data: null });
    return c.json({
      success: true,
      data: {
        services: [],
        businessHoursStart: settings.business_hours_start,
        businessHoursEnd: settings.business_hours_end,
        slotDuration: settings.slot_duration,
        closedDays: JSON.parse(settings.closed_days || '[]'),
        maxAdvanceDays: settings.max_advance_days,
        bookingFields: JSON.parse(settings.booking_fields || '[]'),
      },
    });
  } catch (err) {
    console.error('GET /api/calendar/settings-public error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/calendar/available?date=YYYY-MM-DD&serviceId=xxx
 * Return available booking slots for the given date.
 * If serviceId is provided, uses that service's config. Otherwise falls back to legacy settings.
 */
calendar.get('/api/calendar/available', async (c) => {
  try {
    const date = c.req.query('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ success: false, error: 'date query parameter is required (YYYY-MM-DD)' }, 400);
    }

    const serviceId = c.req.query('serviceId');

    // Resolve config: service-based or legacy
    let hoursStart: string, hoursEnd: string, slotDuration: number, closedDaysArr: string[], closedDatesArr: string[], maxAdvanceDays: number;
    let gcal: GoogleCalendarClient | null = null;

    if (serviceId) {
      const service = await getCalendarServiceById(c.env.DB, serviceId);
      if (!service) return c.json({ success: false, error: 'Service not found' }, 404);
      hoursStart = service.business_hours_start;
      hoursEnd = service.business_hours_end;
      slotDuration = service.duration;
      try { closedDaysArr = JSON.parse(service.closed_days); } catch { closedDaysArr = []; }
      try { closedDatesArr = JSON.parse(service.closed_dates); } catch { closedDatesArr = []; }
      maxAdvanceDays = service.max_advance_days;
      gcal = createGCalClientFromService(service);
    } else {
      const settings = await getCalendarSettings(c.env.DB);
      if (!settings) return c.json({ success: false, error: 'Calendar settings not configured' }, 400);
      hoursStart = settings.business_hours_start;
      hoursEnd = settings.business_hours_end;
      slotDuration = settings.slot_duration;
      try { closedDaysArr = JSON.parse(settings.closed_days); } catch { closedDaysArr = []; }
      try { closedDatesArr = JSON.parse(settings.closed_dates); } catch { closedDatesArr = []; }
      maxAdvanceDays = settings.max_advance_days;
      gcal = createGCalClient(settings);
    }

    // Check closed dates
    if (closedDatesArr.includes(date)) {
      return c.json({ success: true, data: { date, closed: true, reason: 'closed_date', slots: [] } });
    }

    // Check closed days
    const requestedDate = new Date(`${date}T12:00:00+09:00`);
    const jstDay = new Date(requestedDate.getTime()).getDay();
    const dayName = DAY_NAMES[jstDay];
    if (closedDaysArr.includes(dayName)) {
      return c.json({ success: true, data: { date, closed: true, reason: `closed_day_${dayName}`, slots: [] } });
    }

    // Check date range
    const today = new Date();
    const todayStr = toJstString(today).slice(0, 10);
    const diffDays = Math.floor((requestedDate.getTime() - new Date(`${todayStr}T12:00:00+09:00`).getTime()) / 86400000);
    if (diffDays < 0) return c.json({ success: true, data: { date, closed: true, reason: 'past_date', slots: [] } });
    if (diffDays > maxAdvanceDays) return c.json({ success: true, data: { date, closed: true, reason: 'too_far_in_advance', slots: [] } });

    // Generate time slots
    const startHour = parseInt(hoursStart.split(':')[0], 10);
    const startMinute = parseInt(hoursStart.split(':')[1] ?? '0', 10);
    const endHour = parseInt(hoursEnd.split(':')[0], 10);
    const endMinute = parseInt(hoursEnd.split(':')[1] ?? '0', 10);

    const dayStartStr = `${date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00+09:00`;
    const dayEndStr = `${date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00+09:00`;

    // Get D1 bookings — filter by serviceId if provided
    const bookings = await getBookingsInDateRange(c.env.DB, dayStartStr, dayEndStr, serviceId || undefined);

    // Get Google Calendar busy intervals
    let googleBusyIntervals: { start: string; end: string }[] = [];
    if (gcal) {
      try {
        googleBusyIntervals = await gcal.getFreeBusy(dayStartStr, dayEndStr);
      } catch (err) {
        console.warn('Google FreeBusy API error (falling back to D1 only):', err);
      }
    }

    // Build slots
    const slots: { startTime: string; endTime: string; startAt: string; endAt: string; available: boolean }[] = [];
    const baseTime = new Date(dayStartStr).getTime();
    const endTime = new Date(dayEndStr).getTime();
    const slotMs = slotDuration * 60 * 1000;

    for (let t = baseTime; t + slotMs <= endTime; t += slotMs) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + slotMs);
      const startAtStr = toJstString(slotStart);
      const endAtStr = toJstString(slotEnd);
      const startTimeHHMM = startAtStr.slice(11, 16);
      const endTimeHHMM = endAtStr.slice(11, 16);

      const isBookedInD1 = bookings.some((b) => {
        const bStart = new Date(b.start_at).getTime();
        const bEnd = new Date(b.end_at).getTime();
        return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
      });

      const isBookedInGoogle = googleBusyIntervals.some((interval) => {
        const gStart = new Date(interval.start).getTime();
        const gEnd = new Date(interval.end).getTime();
        return slotStart.getTime() < gEnd && slotEnd.getTime() > gStart;
      });

      const isPast = slotStart.getTime() < Date.now();

      slots.push({
        startTime: startTimeHHMM,
        endTime: endTimeHHMM,
        startAt: startAtStr,
        endAt: endAtStr,
        available: !isBookedInD1 && !isBookedInGoogle && !isPast,
      });
    }

    return c.json({
      success: true,
      data: {
        date,
        closed: false,
        businessHours: { start: hoursStart, end: hoursEnd },
        slotDuration,
        slots,
      },
    });
  } catch (err) {
    console.error('GET /api/calendar/available error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/calendar/book
 * Create a new booking (public, no auth)
 * Now supports serviceId in body
 */
calendar.post('/api/calendar/book', async (c) => {
  try {
    const body = await c.req.json<{
      date: string;
      startTime: string;
      endTime: string;
      friendId?: string;
      serviceId?: string;
      bookingData: Record<string, unknown>;
    }>();

    if (!body.date || !body.startTime || !body.endTime || !body.bookingData) {
      return c.json({ success: false, error: 'date, startTime, endTime, and bookingData are required' }, 400);
    }

    // Resolve service or legacy settings
    let service: CalendarServiceRow | null = null;
    let settings: CalendarSettingsRow | null = null;
    let gcal: GoogleCalendarClient | null = null;
    let replyEnabled = false;
    let replyContent: string | null = null;

    if (body.serviceId) {
      service = await getCalendarServiceById(c.env.DB, body.serviceId);
      if (!service) return c.json({ success: false, error: 'Service not found' }, 404);
      gcal = createGCalClientFromService(service);
      replyEnabled = !!service.booking_reply_enabled;
      replyContent = service.booking_reply_content;
    } else {
      settings = await getCalendarSettings(c.env.DB);
      if (!settings) return c.json({ success: false, error: 'Calendar settings not configured' }, 400);
      gcal = createGCalClient(settings);
      replyEnabled = !!settings.booking_reply_enabled;
      replyContent = settings.booking_reply_content;
    }

    // Normalize times
    const startAt = body.startTime.includes('T') ? body.startTime : `${body.date}T${body.startTime}:00+09:00`;
    const endAt = body.endTime.includes('T') ? body.endTime : `${body.date}T${body.endTime}:00+09:00`;

    // Re-check availability
    const existingBookings = await getBookingsInDateRange(c.env.DB, startAt, endAt, body.serviceId || undefined);
    const slotStart = new Date(startAt).getTime();
    const slotEnd = new Date(endAt).getTime();
    const hasConflict = existingBookings.some((b) => {
      const bStart = new Date(b.start_at).getTime();
      const bEnd = new Date(b.end_at).getTime();
      return slotStart < bEnd && slotEnd > bStart;
    });
    if (hasConflict) return c.json({ success: false, error: 'This time slot is no longer available' }, 409);

    // Google Calendar conflict check
    if (gcal) {
      try {
        const busy = await gcal.getFreeBusy(startAt, endAt);
        const googleConflict = busy.some((interval) => {
          const gStart = new Date(interval.start).getTime();
          const gEnd = new Date(interval.end).getTime();
          return slotStart < gEnd && slotEnd > gStart;
        });
        if (googleConflict) return c.json({ success: false, error: 'This time slot is no longer available' }, 409);
      } catch (err) {
        console.warn('Google FreeBusy check during booking (proceeding):', err);
      }
    }

    // Build title
    const name = String(body.bookingData.name ?? '予約');
    const serviceName = service?.name;
    const title = serviceName ? `LINE予約: ${name} (${serviceName})` : `LINE予約: ${name}`;

    // Build description
    const descriptionLines = Object.entries(body.bookingData)
      .map(([key, val]) => `${key}: ${String(val ?? '')}`)
      .join('\n');
    const description = serviceName
      ? `サービス: ${serviceName}\n予約情報:\n${descriptionLines}`
      : `予約情報:\n${descriptionLines}`;

    // Create Google Calendar event
    let eventId: string | null = null;
    if (gcal) {
      try {
        const result = await gcal.createEvent({ summary: title, start: startAt, end: endAt, description });
        eventId = result.eventId;
      } catch (err) {
        console.warn('Google Calendar createEvent error (booking still created in D1):', err);
      }
    }

    // Ensure placeholder connection record
    const SETTINGS_CONN_ID = body.serviceId ? `service-${body.serviceId}` : 'settings-default';
    const calendarId = service?.google_calendar_id || settings?.google_calendar_id || 'default';
    try {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO google_calendar_connections (id, calendar_id, auth_type, is_active, created_at, updated_at)
         VALUES (?, ?, 'service_account', 1, datetime('now'), datetime('now'))`
      ).bind(SETTINGS_CONN_ID, calendarId).run();
    } catch { /* already exists */ }

    const booking = await createCalendarBooking(c.env.DB, {
      connectionId: SETTINGS_CONN_ID,
      friendId: body.friendId,
      eventId: eventId ?? undefined,
      title,
      startAt,
      endAt,
      bookingData: JSON.stringify(body.bookingData),
      serviceId: body.serviceId,
    });

    // Send LINE reply
    if (replyEnabled && body.friendId) {
      try {
        const friend = await getFriendById(c.env.DB, body.friendId);
        if (friend?.line_user_id) {
          const { LineClient } = await import('@line-crm/line-sdk');
          const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
          const defaultReply = serviceName
            ? `ご予約ありがとうございます。\n\nサービス: ${serviceName}\n日時: ${body.date} ${body.startTime}〜${body.endTime}\nお名前: ${name}\n\n確認後、改めてご連絡いたします。`
            : `ご予約ありがとうございます。\n\n日時: ${body.date} ${body.startTime}〜${body.endTime}\nお名前: ${name}\n\n確認後、改めてご連絡いたします。`;
          await lineClient.pushTextMessage(friend.line_user_id, replyContent ?? defaultReply);
        }
      } catch (err) {
        console.warn('LINE booking reply failed (booking still created):', err);
      }
    }

    // Fire booking_created event with service info
    try {
      const { fireEvent } = await import('../services/event-bus.js');
      await fireEvent(c.env.DB, 'booking_created', {
        friendId: body.friendId,
        eventData: {
          bookingId: booking.id,
          title,
          date: body.date,
          startTime: body.startTime,
          endTime: body.endTime,
          bookingData: body.bookingData,
          serviceId: body.serviceId || null,
          serviceName: serviceName || null,
          calendarId: calendarId,
        },
      });
    } catch (err) {
      console.warn('booking_created fireEvent failed:', err);
    }

    return c.json({
      success: true,
      data: {
        id: booking.id,
        title: booking.title,
        startAt: booking.start_at,
        endAt: booking.end_at,
        eventId: booking.event_id,
        friendId: booking.friend_id,
        serviceId: booking.service_id,
        status: booking.status,
        bookingData: body.bookingData,
        createdAt: booking.created_at,
      },
    }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error('POST /api/calendar/book error:', msg, stack);
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * DELETE /api/calendar/book/:id
 * Cancel a booking (public)
 */
calendar.delete('/api/calendar/book/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const booking = await getCalendarBookingById(c.env.DB, id);
    if (!booking) return c.json({ success: false, error: 'Booking not found' }, 404);

    // Delete Google Calendar event — try service first, then legacy settings
    if (booking.event_id) {
      let gcal: GoogleCalendarClient | null = null;
      if (booking.service_id) {
        const service = await getCalendarServiceById(c.env.DB, booking.service_id);
        if (service) gcal = createGCalClientFromService(service);
      }
      if (!gcal) {
        const settings = await getCalendarSettings(c.env.DB);
        if (settings) gcal = createGCalClient(settings);
      }
      if (gcal) {
        try { await gcal.deleteEvent(booking.event_id); } catch (err) {
          console.warn('Google Calendar deleteEvent error:', err);
        }
      }
    }

    await updateCalendarBookingStatus(c.env.DB, id, 'cancelled');
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/calendar/book/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---------- Booking detail (public, for cancel page) ----------

calendar.get('/api/calendar/book/:id/detail', async (c) => {
  try {
    const id = c.req.param('id');
    const booking = await getCalendarBookingById(c.env.DB, id);
    if (!booking) return c.json({ success: false, error: 'Booking not found' }, 404);

    let serviceName: string | null = null;
    if (booking.service_id) {
      const svc = await getCalendarServiceById(c.env.DB, booking.service_id);
      if (svc) serviceName = svc.name;
    }

    return c.json({
      success: true,
      data: {
        id: booking.id,
        title: booking.title,
        startAt: booking.start_at,
        endAt: booking.end_at,
        status: booking.status,
        serviceId: booking.service_id,
        serviceName,
        bookingData: booking.booking_data ? JSON.parse(booking.booking_data) : null,
      },
    });
  } catch (err) {
    console.error('GET /api/calendar/book/:id/detail error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---------- Booking cancel (public, from LIFF cancel page) ----------

calendar.post('/api/calendar/book/:id/cancel', async (c) => {
  try {
    const id = c.req.param('id');
    const booking = await getCalendarBookingById(c.env.DB, id);
    if (!booking) return c.json({ success: false, error: 'Booking not found' }, 404);
    if (booking.status === 'cancelled') return c.json({ success: true, data: null });

    // Delete Google Calendar event
    if (booking.event_id) {
      let gcal: GoogleCalendarClient | null = null;
      if (booking.service_id) {
        const service = await getCalendarServiceById(c.env.DB, booking.service_id);
        if (service) gcal = createGCalClientFromService(service);
      }
      if (!gcal) {
        const settings = await getCalendarSettings(c.env.DB);
        if (settings) gcal = createGCalClient(settings);
      }
      if (gcal) {
        try { await gcal.deleteEvent(booking.event_id); } catch (err) {
          console.warn('Google Calendar deleteEvent on cancel:', err);
        }
      }
    }

    await updateCalendarBookingStatus(c.env.DB, id, 'cancelled');

    // Fire booking_cancelled event
    try {
      const { fireEvent } = await import('../services/event-bus.js');
      let serviceName: string | null = null;
      if (booking.service_id) {
        const svc = await getCalendarServiceById(c.env.DB, booking.service_id);
        if (svc) serviceName = svc.name;
      }
      await fireEvent(c.env.DB, 'booking_cancelled', {
        friendId: booking.friend_id ?? undefined,
        eventData: {
          bookingId: booking.id,
          title: booking.title,
          startAt: booking.start_at,
          endAt: booking.end_at,
          serviceId: booking.service_id,
          serviceName,
          bookingData: booking.booking_data ? JSON.parse(booking.booking_data) : null,
        },
      }, c.env.LINE_CHANNEL_ACCESS_TOKEN);
    } catch (err) {
      console.warn('booking_cancelled fireEvent failed:', err);
    }

    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('POST /api/calendar/book/:id/cancel error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---------- Booking Reminders CRUD (auth required) ----------

calendar.get('/api/calendar/reminders', async (c) => {
  try {
    const serviceId = c.req.query('serviceId') ?? undefined;
    const items = await getBookingReminders(c.env.DB, serviceId);
    return c.json({
      success: true,
      data: items.map((r) => ({
        id: r.id,
        serviceId: r.service_id,
        timingValue: r.timing_value,
        timingUnit: r.timing_unit,
        messageType: r.message_type,
        messageContent: r.message_content,
        includeCancelButton: Boolean(r.include_cancel_button),
        isActive: Boolean(r.is_active),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/calendar/reminders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.post('/api/calendar/reminders', async (c) => {
  try {
    const body = await c.req.json<{
      serviceId?: string | null;
      timingValue: number;
      timingUnit: string;
      messageType?: string;
      messageContent?: string;
      includeCancelButton?: boolean;
      isActive?: boolean;
    }>();
    if (!body.timingValue || !body.timingUnit) {
      return c.json({ success: false, error: 'timingValue and timingUnit are required' }, 400);
    }
    const item = await createBookingReminder(c.env.DB, {
      serviceId: body.serviceId,
      timingValue: body.timingValue,
      timingUnit: body.timingUnit,
      messageType: body.messageType,
      messageContent: body.messageContent ?? '',
      includeCancelButton: body.includeCancelButton === false ? 0 : 1,
      isActive: body.isActive === false ? 0 : 1,
    });
    return c.json({
      success: true,
      data: {
        id: item.id,
        serviceId: item.service_id,
        timingValue: item.timing_value,
        timingUnit: item.timing_unit,
        messageType: item.message_type,
        messageContent: item.message_content,
        includeCancelButton: Boolean(item.include_cancel_button),
        isActive: Boolean(item.is_active),
      },
    }, 201);
  } catch (err) {
    console.error('POST /api/calendar/reminders error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.put('/api/calendar/reminders/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      serviceId?: string | null;
      timingValue?: number;
      timingUnit?: string;
      messageType?: string;
      messageContent?: string;
      includeCancelButton?: boolean;
      isActive?: boolean;
    }>();
    const updated = await updateBookingReminder(c.env.DB, id, {
      serviceId: body.serviceId,
      timingValue: body.timingValue,
      timingUnit: body.timingUnit,
      messageType: body.messageType,
      messageContent: body.messageContent,
      includeCancelButton: body.includeCancelButton !== undefined ? (body.includeCancelButton ? 1 : 0) : undefined,
      isActive: body.isActive !== undefined ? (body.isActive ? 1 : 0) : undefined,
    });
    if (!updated) return c.json({ success: false, error: 'Not found' }, 404);
    return c.json({
      success: true,
      data: {
        id: updated.id,
        serviceId: updated.service_id,
        timingValue: updated.timing_value,
        timingUnit: updated.timing_unit,
        messageType: updated.message_type,
        messageContent: updated.message_content,
        includeCancelButton: Boolean(updated.include_cancel_button),
        isActive: Boolean(updated.is_active),
      },
    });
  } catch (err) {
    console.error('PUT /api/calendar/reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.delete('/api/calendar/reminders/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const item = await getBookingReminderById(c.env.DB, id);
    if (!item) return c.json({ success: false, error: 'Not found' }, 404);
    await deleteBookingReminder(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/calendar/reminders/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---------- Auth-required booking management ----------

calendar.get('/api/calendar/bookings', async (c) => {
  try {
    const startDate = c.req.query('startDate') ?? undefined;
    const endDate = c.req.query('endDate') ?? undefined;
    const status = c.req.query('status') ?? undefined;
    const serviceId = c.req.query('serviceId') ?? undefined;

    const items = await getCalendarBookingsFiltered(c.env.DB, { startDate, endDate, status, serviceId });

    // Resolve service names
    const serviceIds = [...new Set(items.map((b) => b.service_id).filter(Boolean))] as string[];
    const serviceMap: Record<string, string> = {};
    for (const sid of serviceIds) {
      const svc = await getCalendarServiceById(c.env.DB, sid);
      if (svc) serviceMap[sid] = svc.name;
    }

    return c.json({
      success: true,
      data: items.map((b) => ({
        id: b.id,
        connectionId: b.connection_id,
        friendId: b.friend_id,
        eventId: b.event_id,
        title: b.title,
        startAt: b.start_at,
        endAt: b.end_at,
        status: b.status,
        serviceId: b.service_id,
        serviceName: b.service_id ? serviceMap[b.service_id] ?? null : null,
        bookingData: b.booking_data ? JSON.parse(b.booking_data) : null,
        metadata: b.metadata ? JSON.parse(b.metadata) : null,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/calendar/bookings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.put('/api/calendar/bookings/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json<{ status: string }>();
    if (!status || !['confirmed', 'cancelled', 'completed'].includes(status)) {
      return c.json({ success: false, error: 'status must be one of: confirmed, cancelled, completed' }, 400);
    }

    const booking = await getCalendarBookingById(c.env.DB, id);
    if (!booking) return c.json({ success: false, error: 'Booking not found' }, 404);

    if (status === 'cancelled' && booking.event_id) {
      let gcal: GoogleCalendarClient | null = null;
      if (booking.service_id) {
        const service = await getCalendarServiceById(c.env.DB, booking.service_id);
        if (service) gcal = createGCalClientFromService(service);
      }
      if (!gcal) {
        const settings = await getCalendarSettings(c.env.DB);
        if (settings) gcal = createGCalClient(settings);
      }
      if (gcal) {
        try { await gcal.deleteEvent(booking.event_id); } catch (err) {
          console.warn('Google Calendar deleteEvent error:', err);
        }
      }
    }

    await updateCalendarBookingStatus(c.env.DB, id, status);
    return c.json({ success: true, data: { id, status } });
  } catch (err) {
    console.error('PUT /api/calendar/bookings/:id/status error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========================================================================
// LEGACY /api/integrations/google-calendar/* routes
// ========================================================================

calendar.get('/api/integrations/google-calendar', async (c) => {
  try {
    const items = await getCalendarConnections(c.env.DB);
    return c.json({
      success: true,
      data: items.map((conn) => ({
        id: conn.id,
        calendarId: conn.calendar_id,
        authType: conn.auth_type,
        isActive: Boolean(conn.is_active),
        createdAt: conn.created_at,
        updatedAt: conn.updated_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/integrations/google-calendar error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.post('/api/integrations/google-calendar/connect', async (c) => {
  try {
    const body = await c.req.json<{ calendarId: string; authType: string; accessToken?: string; refreshToken?: string; apiKey?: string }>();
    if (!body.calendarId) return c.json({ success: false, error: 'calendarId is required' }, 400);
    const conn = await createCalendarConnection(c.env.DB, body);
    return c.json({
      success: true,
      data: { id: conn.id, calendarId: conn.calendar_id, authType: conn.auth_type, isActive: Boolean(conn.is_active), createdAt: conn.created_at },
    }, 201);
  } catch (err) {
    console.error('POST /api/integrations/google-calendar/connect error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.delete('/api/integrations/google-calendar/:id', async (c) => {
  try {
    await deleteCalendarConnection(c.env.DB, c.req.param('id'));
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/integrations/google-calendar/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.get('/api/integrations/google-calendar/slots', async (c) => {
  try {
    const connectionId = c.req.query('connectionId');
    const date = c.req.query('date');
    const slotMinutes = Number(c.req.query('slotMinutes') ?? '60');
    const startHour = Number(c.req.query('startHour') ?? '9');
    const endHour = Number(c.req.query('endHour') ?? '18');

    if (!connectionId || !date) {
      return c.json({ success: false, error: 'connectionId and date are required' }, 400);
    }

    const conn = await getCalendarConnectionById(c.env.DB, connectionId);
    if (!conn) return c.json({ success: false, error: 'Calendar connection not found' }, 404);

    const dayStart = `${date}T${String(startHour).padStart(2, '0')}:00:00`;
    const dayEnd = `${date}T${String(endHour).padStart(2, '0')}:00:00`;

    const bookings = await getBookingsInRange(c.env.DB, connectionId, dayStart, dayEnd);

    let googleBusyIntervals: { start: string; end: string }[] = [];
    if (conn.access_token) {
      try {
        const gcal = new GoogleCalendarClient({ calendarId: conn.calendar_id, accessToken: conn.access_token });
        const timeMin = `${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`;
        const timeMax = `${date}T${String(endHour).padStart(2, '0')}:00:00+09:00`;
        googleBusyIntervals = await gcal.getFreeBusy(timeMin, timeMax);
      } catch (err) {
        console.warn('Google FreeBusy API error (falling back to D1 only):', err);
      }
    }

    const slots: { startAt: string; endAt: string; available: boolean }[] = [];
    const baseDate = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00+09:00`);

    for (let h = startHour; h < endHour; h += slotMinutes / 60) {
      const slotStart = new Date(baseDate);
      slotStart.setMinutes(slotStart.getMinutes() + (h - startHour) * 60);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + slotMinutes);

      const startStr = toJstString(slotStart);
      const endStr = toJstString(slotEnd);

      const isBookedInD1 = bookings.some((b) => {
        const bStart = new Date(b.start_at).getTime();
        const bEnd = new Date(b.end_at).getTime();
        return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
      });

      const isBookedInGoogle = googleBusyIntervals.some((interval) => {
        const gStart = new Date(interval.start).getTime();
        const gEnd = new Date(interval.end).getTime();
        return slotStart.getTime() < gEnd && slotEnd.getTime() > gStart;
      });

      slots.push({ startAt: startStr, endAt: endStr, available: !isBookedInD1 && !isBookedInGoogle });
    }

    return c.json({ success: true, data: slots });
  } catch (err) {
    console.error('GET /api/integrations/google-calendar/slots error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.get('/api/integrations/google-calendar/bookings', async (c) => {
  try {
    const connectionId = c.req.query('connectionId');
    const friendId = c.req.query('friendId');
    const items = await getCalendarBookings(c.env.DB, { connectionId: connectionId ?? undefined, friendId: friendId ?? undefined });
    return c.json({
      success: true,
      data: items.map((b) => ({
        id: b.id,
        connectionId: b.connection_id,
        friendId: b.friend_id,
        eventId: b.event_id,
        title: b.title,
        startAt: b.start_at,
        endAt: b.end_at,
        status: b.status,
        metadata: b.metadata ? JSON.parse(b.metadata) : null,
        createdAt: b.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/integrations/google-calendar/bookings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.post('/api/integrations/google-calendar/book', async (c) => {
  try {
    const body = await c.req.json<{ connectionId: string; friendId?: string; title: string; startAt: string; endAt: string; description?: string; metadata?: Record<string, unknown> }>();
    if (!body.connectionId || !body.title || !body.startAt || !body.endAt) {
      return c.json({ success: false, error: 'connectionId, title, startAt, endAt are required' }, 400);
    }

    const booking = await createCalendarBooking(c.env.DB, {
      ...body,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
    });

    const conn = await getCalendarConnectionById(c.env.DB, body.connectionId);
    if (conn?.access_token) {
      try {
        const gcal = new GoogleCalendarClient({ calendarId: conn.calendar_id, accessToken: conn.access_token });
        const { eventId } = await gcal.createEvent({ summary: body.title, start: body.startAt, end: body.endAt, description: body.description });
        await updateCalendarBookingEventId(c.env.DB, booking.id, eventId);
        booking.event_id = eventId;
      } catch (err) {
        console.warn('Google Calendar createEvent error (booking still created in D1):', err);
      }
    }

    return c.json({
      success: true,
      data: {
        id: booking.id,
        connectionId: booking.connection_id,
        friendId: booking.friend_id,
        eventId: booking.event_id,
        title: booking.title,
        startAt: booking.start_at,
        endAt: booking.end_at,
        status: booking.status,
        createdAt: booking.created_at,
      },
    }, 201);
  } catch (err) {
    console.error('POST /api/integrations/google-calendar/book error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

calendar.put('/api/integrations/google-calendar/bookings/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json<{ status: string }>();

    if (status === 'cancelled') {
      const booking = await getCalendarBookingById(c.env.DB, id);
      if (booking?.event_id && booking.connection_id) {
        const conn = await getCalendarConnectionById(c.env.DB, booking.connection_id);
        if (conn?.access_token) {
          try {
            const gcal = new GoogleCalendarClient({ calendarId: conn.calendar_id, accessToken: conn.access_token });
            await gcal.deleteEvent(booking.event_id);
          } catch (err) {
            console.warn('Google Calendar deleteEvent error (status still updated in D1):', err);
          }
        }
      }
    }

    await updateCalendarBookingStatus(c.env.DB, id, status);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('PUT /api/integrations/google-calendar/bookings/:id/status error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { calendar };
