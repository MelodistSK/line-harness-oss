import {
  getBroadcastById,
  updateBroadcastStatus,
  jstNow,
} from '@line-crm/db';
import type { Broadcast } from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';
import { calculateStaggerDelay, sleep, addMessageVariation } from './stealth.js';
import { buildSegmentQuery } from './segment-query.js';
import { buildMessage } from './step-delivery.js';
import { personalizeTrackingUrls } from './auto-track.js';
import type { SegmentCondition } from './segment-query.js';

const MULTICAST_BATCH_SIZE = 500;
const TEMPLATE_VAR_RE = /\{\{(name|score|uid)\}\}/;

interface FriendRow {
  id: string;
  line_user_id: string;
  display_name: string | null;
  score: number;
}

function expandVariables(text: string, friend: FriendRow): string {
  return text
    .replace(/\{\{name\}\}/g, friend.display_name ?? '')
    .replace(/\{\{score\}\}/g, String(friend.score ?? 0))
    .replace(/\{\{uid\}\}/g, friend.line_user_id);
}

function hasTemplateVariables(content: string): boolean {
  return TEMPLATE_VAR_RE.test(content);
}

export async function processSegmentSend(
  db: D1Database,
  lineClient: LineClient,
  broadcastId: string,
  condition: SegmentCondition,
): Promise<Broadcast> {
  // Mark as sending
  await updateBroadcastStatus(db, broadcastId, 'sending');

  const broadcast = await getBroadcastById(db, broadcastId);
  if (!broadcast) {
    throw new Error(`Broadcast ${broadcastId} not found`);
  }

  const message = buildMessage(broadcast.message_type, broadcast.message_content);
  const useVariables = hasTemplateVariables(broadcast.message_content);

  let totalCount = 0;
  let successCount = 0;

  try {
    // Build and execute segment query to get matching friends
    const { sql, bindings } = buildSegmentQuery(condition);
    const queryResult = await db
      .prepare(sql)
      .bind(...bindings)
      .all<FriendRow>();

    const friends = queryResult.results ?? [];
    totalCount = friends.length;

    const now = jstNow();

    if (useVariables) {
      console.log(`[segment-send] Variable expansion ON — sending individually to ${friends.length} friends`);
      for (let i = 0; i < friends.length; i++) {
        const friend = friends[i];
        const expandedContent = expandVariables(broadcast.message_content, friend);
        const personalizedContent = personalizeTrackingUrls(expandedContent, friend.line_user_id);
        const personalMessage = buildMessage(broadcast.message_type, personalizedContent);

        if (i > 0 && i % MULTICAST_BATCH_SIZE === 0) {
          const batchIndex = Math.floor(i / MULTICAST_BATCH_SIZE);
          const delay = calculateStaggerDelay(friends.length, batchIndex);
          await sleep(delay);
        }

        try {
          await lineClient.pushMessage(friend.line_user_id, [personalMessage]);
          successCount++;

          const logId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, ?, NULL, ?)`,
            )
            .bind(logId, friend.id, broadcast.message_type, expandedContent, broadcastId, now)
            .run();
        } catch (err) {
          console.error(`Segment push to ${friend.line_user_id} failed:`, err);
        }
      }
    } else {
      const totalBatches = Math.ceil(friends.length / MULTICAST_BATCH_SIZE);

      for (let i = 0; i < friends.length; i += MULTICAST_BATCH_SIZE) {
        const batchIndex = Math.floor(i / MULTICAST_BATCH_SIZE);
        const batch = friends.slice(i, i + MULTICAST_BATCH_SIZE);
        const lineUserIds = batch.map((f) => f.line_user_id);

        // Stealth: stagger delays between batches
        if (batchIndex > 0) {
          const delay = calculateStaggerDelay(friends.length, batchIndex);
          await sleep(delay);
        }

        // Stealth: add slight variation to text messages
        let batchMessage = message;
        if (message.type === 'text' && totalBatches > 1) {
          batchMessage = { ...message, text: addMessageVariation(message.text, batchIndex) };
        }

        try {
          await lineClient.multicast(lineUserIds, [batchMessage]);
          successCount += batch.length;

          // Log successfully sent messages
          for (const friend of batch) {
            const logId = crypto.randomUUID();
            await db
              .prepare(
                `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
                 VALUES (?, ?, 'outgoing', ?, ?, ?, NULL, ?)`,
              )
              .bind(logId, friend.id, broadcast.message_type, broadcast.message_content, broadcastId, now)
              .run();
          }
        } catch (err) {
          console.error(`Segment multicast batch ${batchIndex} failed:`, err);
        }
      }
    }

    await updateBroadcastStatus(db, broadcastId, 'sent', { totalCount, successCount });
  } catch (err) {
    // On failure, reset to draft so it can be retried
    await updateBroadcastStatus(db, broadcastId, 'draft');
    throw err;
  }

  return (await getBroadcastById(db, broadcastId))!;
}

