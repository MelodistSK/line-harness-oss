/**
 * 予約リマインダー配信処理 — cronトリガーで5分毎に実行
 *
 * 1. アクティブなリマインダー設定を取得
 * 2. 今後の確認済み予約を取得
 * 3. 各予約×リマインダーで送信タイミングを照合
 * 4. 未送信のものをLINE配信 + ログ記録
 */

import {
  getActiveBookingReminders,
  getBookingReminderLog,
  createBookingReminderLog,
  updateBookingReminderLogStatus,
  getCalendarServiceById,
  getFriendById,
  jstNow,
} from '@line-crm/db';
import type { CalendarBookingRow, BookingReminderRow } from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';
import { fireEvent } from './event-bus.js';

/** Convert timing to milliseconds */
function timingToMs(value: number, unit: string): number {
  switch (unit) {
    case 'days': return value * 24 * 60 * 60_000;
    case 'hours': return value * 60 * 60_000;
    case 'minutes': return value * 60_000;
    default: return value * 60_000;
  }
}

/** Format timing for display */
function formatTiming(value: number, unit: string): string {
  switch (unit) {
    case 'days': return `${value}日前`;
    case 'hours': return `${value}時間前`;
    case 'minutes': return `${value}分前`;
    default: return `${value}${unit}前`;
  }
}

/** Replace template variables in message content */
function expandBookingVariables(
  content: string,
  booking: CalendarBookingRow,
  friendName: string,
  serviceName: string | null,
  cancelUrl: string | null,
): string {
  const startDate = new Date(booking.start_at);
  const dateStr = `${startDate.getFullYear()}/${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}`;
  const timeStr = booking.start_at.slice(11, 16);
  const endTimeStr = booking.end_at.slice(11, 16);

  let result = content
    .replace(/\{\{name\}\}/g, friendName)
    .replace(/\{\{date\}\}/g, dateStr)
    .replace(/\{\{time\}\}/g, timeStr)
    .replace(/\{\{endTime\}\}/g, endTimeStr)
    .replace(/\{\{serviceName\}\}/g, serviceName ?? '')
    .replace(/\{\{bookingId\}\}/g, booking.id);

  // Replace {{bookingData.xxx}} with actual booking data
  if (booking.booking_data) {
    try {
      const data = JSON.parse(booking.booking_data) as Record<string, unknown>;
      result = result.replace(/\{\{bookingData\.(\w+)\}\}/g, (_, key) => String(data[key] ?? ''));
    } catch { /* ignore parse errors */ }
  }

  if (cancelUrl) {
    result = result.replace(/\{\{cancelUrl\}\}/g, cancelUrl);
  }

  return result;
}

/** Build default reminder Flex message */
function buildDefaultReminderFlex(
  booking: CalendarBookingRow,
  friendName: string,
  serviceName: string | null,
  timingLabel: string,
  cancelUrl: string | null,
  includeCancelButton: boolean,
): string {
  const startDate = new Date(booking.start_at);
  const dateStr = `${startDate.getFullYear()}/${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}`;
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeek = dayNames[startDate.getDay()];
  const timeStr = booking.start_at.slice(11, 16);
  const endTimeStr = booking.end_at.slice(11, 16);

  const bodyContents: unknown[] = [
    { type: 'text', text: `${friendName} 様`, size: 'lg', weight: 'bold', color: '#1a1a2e' },
    { type: 'text', text: `ご予約${timingLabel}のリマインダーです`, size: 'sm', color: '#666666', margin: 'md', wrap: true },
    { type: 'separator', margin: 'lg' },
    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [
      ...(serviceName ? [{ type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: 'サービス', size: 'sm', color: '#888888', flex: 3 },
        { type: 'text', text: serviceName, size: 'sm', color: '#333333', flex: 5, wrap: true },
      ] }] : []),
      { type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: '日付', size: 'sm', color: '#888888', flex: 3 },
        { type: 'text', text: `${dateStr}（${dayOfWeek}）`, size: 'sm', color: '#333333', flex: 5 },
      ] },
      { type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: '時間', size: 'sm', color: '#888888', flex: 3 },
        { type: 'text', text: `${timeStr} 〜 ${endTimeStr}`, size: 'sm', color: '#333333', flex: 5 },
      ] },
    ] },
  ];

  const footerContents: unknown[] = [];
  if (includeCancelButton && cancelUrl) {
    footerContents.push({
      type: 'button',
      action: { type: 'uri', label: 'キャンセルする', uri: cancelUrl },
      style: 'secondary',
      color: '#dddddd',
      height: 'sm',
    });
  }

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#1a1a2e', paddingAll: '16px',
      contents: [{ type: 'text', text: '予約リマインダー', color: '#ffffff', size: 'md', weight: 'bold' }],
    },
    body: { type: 'box', layout: 'vertical', contents: bodyContents, paddingAll: '16px' },
  };

  if (footerContents.length > 0) {
    bubble.footer = { type: 'box', layout: 'vertical', contents: footerContents, paddingAll: '12px' };
  }

  return JSON.stringify(bubble);
}

/** Append cancel button to existing Flex JSON */
function appendCancelButton(flexJson: string, cancelUrl: string): string {
  try {
    const flex = JSON.parse(flexJson);
    const cancelButton = {
      type: 'button',
      action: { type: 'uri', label: 'キャンセルする', uri: cancelUrl },
      style: 'secondary',
      color: '#dddddd',
      height: 'sm',
      margin: 'sm',
    };
    if (flex.footer?.contents) {
      flex.footer.contents.push(cancelButton);
    } else {
      flex.footer = { type: 'box', layout: 'vertical', contents: [cancelButton], paddingAll: '12px' };
    }
    return JSON.stringify(flex);
  } catch {
    return flexJson;
  }
}

export async function processBookingReminders(
  db: D1Database,
  lineClient: LineClient,
  workerUrl: string,
  lineAccessToken: string,
): Promise<void> {
  const reminders = await getActiveBookingReminders(db);
  if (reminders.length === 0) return;

  // Find the maximum look-ahead window (largest timing)
  const maxMs = Math.max(...reminders.map((r) => timingToMs(r.timing_value, r.timing_unit)));
  const nowMs = Date.now();
  const jstOffset = 9 * 60 * 60_000;
  const lookAheadTime = new Date(nowMs + jstOffset + maxMs + 10 * 60_000); // +10min buffer
  const lookAheadStr = lookAheadTime.toISOString().replace('Z', '+09:00');

  // Get upcoming confirmed bookings within the look-ahead window
  const bookings = await db.prepare(
    `SELECT * FROM calendar_bookings WHERE status = 'confirmed' AND start_at > ? AND start_at <= ? ORDER BY start_at ASC`
  ).bind(jstNow(), lookAheadStr).all<CalendarBookingRow>();

  const upcomingBookings = bookings.results;
  if (upcomingBookings.length === 0) return;

  for (const booking of upcomingBookings) {
    const bookingStartMs = new Date(booking.start_at).getTime();

    for (const reminder of reminders) {
      // Check service match: reminder applies if service_id is null (global) or matches booking
      if (reminder.service_id && reminder.service_id !== booking.service_id) continue;

      const triggerMs = bookingStartMs - timingToMs(reminder.timing_value, reminder.timing_unit);
      const nowJstMs = nowMs + jstOffset;

      // Should fire: trigger time is in the past, but not more than 30min ago (prevent sending very old ones)
      if (nowJstMs < triggerMs || nowJstMs > triggerMs + 30 * 60_000) continue;

      // Check if already sent
      const existing = await getBookingReminderLog(db, booking.id, reminder.id);
      if (existing) continue;

      // Reserve log entry (prevents duplicate in concurrent runs)
      await createBookingReminderLog(db, booking.id, reminder.id, 'pending');

      // Resolve friend
      if (!booking.friend_id) continue;
      const friend = await getFriendById(db, booking.friend_id);
      if (!friend?.line_user_id) continue;

      // Resolve service name
      let serviceName: string | null = null;
      if (booking.service_id) {
        const svc = await getCalendarServiceById(db, booking.service_id);
        if (svc) serviceName = svc.name;
      }

      const cancelUrl = `${workerUrl}/liff/booking/cancel?id=${booking.id}`;
      const timingLabel = formatTiming(reminder.timing_value, reminder.timing_unit);

      try {
        let messageContent: string;
        let messageType = reminder.message_type;

        if (reminder.message_content && reminder.message_content.trim()) {
          // Custom content — expand variables
          messageContent = expandBookingVariables(
            reminder.message_content, booking, friend.display_name ?? '', serviceName, cancelUrl,
          );
          // Append cancel button if Flex and enabled
          if (messageType === 'flex' && reminder.include_cancel_button && cancelUrl) {
            messageContent = appendCancelButton(messageContent, cancelUrl);
          }
        } else {
          // Default Flex template
          messageType = 'flex';
          messageContent = buildDefaultReminderFlex(
            booking, friend.display_name ?? '', serviceName, timingLabel, cancelUrl, !!reminder.include_cancel_button,
          );
        }

        // Build and send LINE message
        const { buildMessage } = await import('./step-delivery.js');
        const message = buildMessage(messageType, messageContent);
        await lineClient.pushMessage(friend.line_user_id, [message]);

        await updateBookingReminderLogStatus(db, booking.id, reminder.id, 'sent');

        // Fire webhook event (include lineUserId)
        await fireEvent(db, 'booking_reminder_sent', {
          friendId: booking.friend_id,
          eventData: {
            bookingId: booking.id,
            reminderId: reminder.id,
            timing: `${reminder.timing_value} ${reminder.timing_unit}`,
            serviceName,
            lineUserId: friend.line_user_id,
          },
        }, lineAccessToken);

      } catch (err) {
        console.error(`[booking-reminder] Failed to send reminder ${reminder.id} for booking ${booking.id}:`, err);
        await updateBookingReminderLogStatus(db, booking.id, reminder.id, 'failed');
      }
    }
  }
}
