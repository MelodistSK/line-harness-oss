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
  getFriendById,
  toJstString,
} from '@line-crm/db';
import type { CalendarSettingsRow } from '@line-crm/db';
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

/** Mask a private key for safe display: show first/last 10 chars */
function maskPrivateKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 24) return '***';
  return key.slice(0, 10) + '...' + key.slice(-10);
}

/** Map day-of-week index (0=Sun) to short name */
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// ========================================================================
// NEW /api/calendar/* routes (settings-based, service account support)
// ========================================================================

// ---------- Settings endpoints (auth required) ----------

/**
 * GET /api/calendar/settings
 * Return calendar settings (private key masked)
 */
calendar.get('/api/calendar/settings', async (c) => {
  try {
    const settings = await getCalendarSettings(c.env.DB);
    if (!settings) {
      return c.json({ success: true, data: null });
    }
    return c.json({
      success: true,
      data: {
        ...settings,
        google_private_key: maskPrivateKey(settings.google_private_key),
      },
    });
  } catch (err) {
    console.error('GET /api/calendar/settings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * PUT /api/calendar/settings
 * Update calendar settings
 */
calendar.put('/api/calendar/settings', async (c) => {
  try {
    const body = await c.req.json<Partial<Omit<CalendarSettingsRow, 'id' | 'created_at' | 'updated_at'>>>();
    // Normalize private key: convert literal \n to newlines, wrap with PEM headers if missing
    if (body.google_private_key) {
      let key = body.google_private_key.replace(/\\n/g, '\n').trim();
      if (!key.startsWith('-----BEGIN PRIVATE KEY-----')) {
        // Strip any accidental headers/whitespace user may have partially included
        key = key.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/[\r\n\s]/g, '');
        key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
      }
      body.google_private_key = key;
    }
    const updated = await upsertCalendarSettings(c.env.DB, body);
    return c.json({
      success: true,
      data: {
        ...updated,
        google_private_key: maskPrivateKey(updated.google_private_key),
      },
    });
  } catch (err) {
    console.error('PUT /api/calendar/settings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/calendar/test-connection
 * Test Google Calendar connection using service account credentials from DB settings
 */
calendar.post('/api/calendar/test-connection', async (c) => {
  try {
    const settings = await getCalendarSettings(c.env.DB);
    if (!settings) {
      return c.json({ success: false, error: 'Calendar settings not configured' }, 400);
    }

    const gcal = createGCalClient(settings);
    if (!gcal) {
      return c.json({
        success: false,
        error: 'Missing Google credentials: client_email, private_key, or calendar_id is empty',
      }, 400);
    }

    // Test by calling getFreeBusy for today
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeMin = `${todayStr}T00:00:00+09:00`;
    const timeMax = `${todayStr}T23:59:59+09:00`;

    const busy = await gcal.getFreeBusy(timeMin, timeMax);

    return c.json({
      success: true,
      data: {
        message: 'Connection successful',
        calendarId: settings.google_calendar_id,
        busyIntervalsToday: busy.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/calendar/test-connection error:', err);
    return c.json({
      success: false,
      error: `Connection test failed: ${message}`,
    }, 500);
  }
});

// ---------- Public endpoints (no auth) ----------

/**
 * GET /api/calendar/settings-public
 * Return public booking settings (fields, hours) — no credentials exposed
 */
calendar.get('/api/calendar/settings-public', async (c) => {
  try {
    const settings = await getCalendarSettings(c.env.DB);
    if (!settings) return c.json({ success: true, data: null });
    return c.json({
      success: true,
      data: {
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
 * GET /api/calendar/available?date=YYYY-MM-DD
 * Return available booking slots for the given date
 */
calendar.get('/api/calendar/available', async (c) => {
  try {
    const date = c.req.query('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ success: false, error: 'date query parameter is required (YYYY-MM-DD)' }, 400);
    }

    const settings = await getCalendarSettings(c.env.DB);
    if (!settings) {
      return c.json({ success: false, error: 'Calendar settings not configured' }, 400);
    }

    // Parse settings
    const startHour = parseInt(settings.business_hours_start.split(':')[0], 10);
    const startMinute = parseInt(settings.business_hours_start.split(':')[1] ?? '0', 10);
    const endHour = parseInt(settings.business_hours_end.split(':')[0], 10);
    const endMinute = parseInt(settings.business_hours_end.split(':')[1] ?? '0', 10);
    const slotDuration = settings.slot_duration; // minutes

    // Check closed days
    let closedDays: string[] = [];
    try { closedDays = JSON.parse(settings.closed_days); } catch { /* empty */ }

    let closedDates: string[] = [];
    try { closedDates = JSON.parse(settings.closed_dates); } catch { /* empty */ }

    // Check if the requested date is a closed date
    if (closedDates.includes(date)) {
      return c.json({ success: true, data: { date, closed: true, reason: 'closed_date', slots: [] } });
    }

    // Check if the requested day-of-week is a closed day
    const requestedDate = new Date(`${date}T12:00:00+09:00`);
    const dayOfWeek = requestedDate.getUTCDay(); // UTC day, but since we added +09:00 at noon it's correct for JST
    // Adjust for JST: the Date is parsed in JST so getDay() after conversion
    const jstDay = new Date(requestedDate.getTime()).getDay();
    const dayName = DAY_NAMES[jstDay];
    if (closedDays.includes(dayName)) {
      return c.json({ success: true, data: { date, closed: true, reason: `closed_day_${dayName}`, slots: [] } });
    }

    // Check max advance days
    const today = new Date();
    const todayStr = toJstString(today).slice(0, 10);
    const diffDays = Math.floor((requestedDate.getTime() - new Date(`${todayStr}T12:00:00+09:00`).getTime()) / 86400000);
    if (diffDays < 0) {
      return c.json({ success: true, data: { date, closed: true, reason: 'past_date', slots: [] } });
    }
    if (diffDays > settings.max_advance_days) {
      return c.json({ success: true, data: { date, closed: true, reason: 'too_far_in_advance', slots: [] } });
    }

    // Generate time slots
    const dayStartStr = `${date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00+09:00`;
    const dayEndStr = `${date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00+09:00`;

    // Get D1 bookings in range
    const bookings = await getBookingsInDateRange(c.env.DB, dayStartStr, dayEndStr);

    // Get Google Calendar busy intervals (best effort)
    let googleBusyIntervals: { start: string; end: string }[] = [];
    const gcal = createGCalClient(settings);
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

      // Friendly HH:mm format
      const startTimeHHMM = startAtStr.slice(11, 16);
      const endTimeHHMM = endAtStr.slice(11, 16);

      // D1 booking overlap check
      const isBookedInD1 = bookings.some((b) => {
        const bStart = new Date(b.start_at).getTime();
        const bEnd = new Date(b.end_at).getTime();
        return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
      });

      // Google busy overlap check
      const isBookedInGoogle = googleBusyIntervals.some((interval) => {
        const gStart = new Date(interval.start).getTime();
        const gEnd = new Date(interval.end).getTime();
        return slotStart.getTime() < gEnd && slotEnd.getTime() > gStart;
      });

      // Check if slot is in the past
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
        businessHours: { start: settings.business_hours_start, end: settings.business_hours_end },
        slotDuration: settings.slot_duration,
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
 */
calendar.post('/api/calendar/book', async (c) => {
  try {
    const body = await c.req.json<{
      date: string;
      startTime: string;      // HH:mm or ISO string
      endTime: string;         // HH:mm or ISO string
      friendId?: string;
      bookingData: Record<string, unknown>;
    }>();

    if (!body.date || !body.startTime || !body.endTime || !body.bookingData) {
      return c.json({ success: false, error: 'date, startTime, endTime, and bookingData are required' }, 400);
    }

    const settings = await getCalendarSettings(c.env.DB);
    if (!settings) {
      return c.json({ success: false, error: 'Calendar settings not configured' }, 400);
    }

    // Normalize times: accept either HH:mm or full ISO
    const startAt = body.startTime.includes('T')
      ? body.startTime
      : `${body.date}T${body.startTime}:00+09:00`;
    const endAt = body.endTime.includes('T')
      ? body.endTime
      : `${body.date}T${body.endTime}:00+09:00`;

    // Re-check availability to prevent double booking
    const existingBookings = await getBookingsInDateRange(c.env.DB, startAt, endAt);
    const slotStart = new Date(startAt).getTime();
    const slotEnd = new Date(endAt).getTime();
    const hasConflict = existingBookings.some((b) => {
      const bStart = new Date(b.start_at).getTime();
      const bEnd = new Date(b.end_at).getTime();
      return slotStart < bEnd && slotEnd > bStart;
    });

    if (hasConflict) {
      return c.json({ success: false, error: 'This time slot is no longer available' }, 409);
    }

    // Also check Google Calendar for conflicts
    const gcal = createGCalClient(settings);
    if (gcal) {
      try {
        const busy = await gcal.getFreeBusy(startAt, endAt);
        const googleConflict = busy.some((interval) => {
          const gStart = new Date(interval.start).getTime();
          const gEnd = new Date(interval.end).getTime();
          return slotStart < gEnd && slotEnd > gStart;
        });
        if (googleConflict) {
          return c.json({ success: false, error: 'This time slot is no longer available' }, 409);
        }
      } catch (err) {
        console.warn('Google FreeBusy check during booking (proceeding):', err);
      }
    }

    // Build title from booking data
    const name = String(body.bookingData.name ?? '予約');
    const title = `LINE予約: ${name}`;

    // Build description from booking data
    const descriptionLines = Object.entries(body.bookingData)
      .map(([key, val]) => `${key}: ${String(val ?? '')}`)
      .join('\n');
    const description = `予約情報:\n${descriptionLines}`;

    // Create Google Calendar event (best effort)
    let eventId: string | null = null;
    if (gcal) {
      try {
        const result = await gcal.createEvent({
          summary: title,
          start: startAt,
          end: endAt,
          description,
        });
        eventId = result.eventId;
      } catch (err) {
        console.warn('Google Calendar createEvent error (booking still created in D1):', err);
      }
    }

    // Save to D1
    // Use 'settings' as connection_id for settings-based bookings
    const booking = await createCalendarBooking(c.env.DB, {
      connectionId: 'settings',
      friendId: body.friendId,
      eventId: eventId ?? undefined,
      title,
      startAt,
      endAt,
      bookingData: JSON.stringify(body.bookingData),
    });

    // Send LINE reply if enabled and friendId is provided
    if (settings.booking_reply_enabled && body.friendId) {
      try {
        const friend = await getFriendById(c.env.DB, body.friendId);
        if (friend?.line_user_id) {
          const { LineClient } = await import('@line-crm/line-sdk');
          const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
          const replyContent = settings.booking_reply_content
            ?? `ご予約ありがとうございます。\n\n日時: ${body.date} ${body.startTime}〜${body.endTime}\nお名前: ${name}\n\n確認後、改めてご連絡いたします。`;
          await lineClient.pushTextMessage(friend.line_user_id, replyContent);
        }
      } catch (err) {
        console.warn('LINE booking reply failed (booking still created):', err);
      }
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
        status: booking.status,
        bookingData: body.bookingData,
        createdAt: booking.created_at,
      },
    }, 201);
  } catch (err) {
    console.error('POST /api/calendar/book error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

/**
 * DELETE /api/calendar/book/:id
 * Cancel a booking (public — uses booking ID as proof of access)
 */
calendar.delete('/api/calendar/book/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const booking = await getCalendarBookingById(c.env.DB, id);
    if (!booking) {
      return c.json({ success: false, error: 'Booking not found' }, 404);
    }

    // Delete Google Calendar event if exists
    if (booking.event_id) {
      const settings = await getCalendarSettings(c.env.DB);
      if (settings) {
        const gcal = createGCalClient(settings);
        if (gcal) {
          try {
            await gcal.deleteEvent(booking.event_id);
          } catch (err) {
            console.warn('Google Calendar deleteEvent error (status still updated in D1):', err);
          }
        }
      }
    }

    // Update status to cancelled
    await updateCalendarBookingStatus(c.env.DB, id, 'cancelled');
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/calendar/book/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ---------- Auth-required endpoints ----------

/**
 * GET /api/calendar/bookings
 * List bookings with optional filters (date range, status)
 */
calendar.get('/api/calendar/bookings', async (c) => {
  try {
    const startDate = c.req.query('startDate') ?? undefined;
    const endDate = c.req.query('endDate') ?? undefined;
    const status = c.req.query('status') ?? undefined;

    const items = await getCalendarBookingsFiltered(c.env.DB, { startDate, endDate, status });
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

/**
 * PUT /api/calendar/bookings/:id/status
 * Update booking status (confirmed, cancelled, completed)
 */
calendar.put('/api/calendar/bookings/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json<{ status: string }>();
    if (!status || !['confirmed', 'cancelled', 'completed'].includes(status)) {
      return c.json({ success: false, error: 'status must be one of: confirmed, cancelled, completed' }, 400);
    }

    const booking = await getCalendarBookingById(c.env.DB, id);
    if (!booking) {
      return c.json({ success: false, error: 'Booking not found' }, 404);
    }

    // If cancelling, delete Google Calendar event
    if (status === 'cancelled' && booking.event_id) {
      const settings = await getCalendarSettings(c.env.DB);
      if (settings) {
        const gcal = createGCalClient(settings);
        if (gcal) {
          try {
            await gcal.deleteEvent(booking.event_id);
          } catch (err) {
            console.warn('Google Calendar deleteEvent error (status still updated in D1):', err);
          }
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
// LEGACY /api/integrations/google-calendar/* routes (backward compatibility)
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
    const date = c.req.query('date'); // YYYY-MM-DD
    const slotMinutes = Number(c.req.query('slotMinutes') ?? '60');
    const startHour = Number(c.req.query('startHour') ?? '9');
    const endHour = Number(c.req.query('endHour') ?? '18');

    if (!connectionId || !date) {
      return c.json({ success: false, error: 'connectionId and date are required' }, 400);
    }

    const conn = await getCalendarConnectionById(c.env.DB, connectionId);
    if (!conn) {
      return c.json({ success: false, error: 'Calendar connection not found' }, 404);
    }

    const dayStart = `${date}T${String(startHour).padStart(2, '0')}:00:00`;
    const dayEnd = `${date}T${String(endHour).padStart(2, '0')}:00:00`;

    const bookings = await getBookingsInRange(c.env.DB, connectionId, dayStart, dayEnd);

    let googleBusyIntervals: { start: string; end: string }[] = [];
    if (conn.access_token) {
      try {
        const gcal = new GoogleCalendarClient({
          calendarId: conn.calendar_id,
          accessToken: conn.access_token,
        });
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
        const gcal = new GoogleCalendarClient({
          calendarId: conn.calendar_id,
          accessToken: conn.access_token,
        });
        const { eventId } = await gcal.createEvent({
          summary: body.title,
          start: body.startAt,
          end: body.endAt,
          description: body.description,
        });
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
            const gcal = new GoogleCalendarClient({
              calendarId: conn.calendar_id,
              accessToken: conn.access_token,
            });
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
