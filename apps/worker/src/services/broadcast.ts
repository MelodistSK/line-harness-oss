import {
  getBroadcastById,
  getBroadcasts,
  updateBroadcastStatus,
  getFriendsByTag,
  jstNow,
} from '@line-crm/db';
import type { Broadcast } from '@line-crm/db';
import type { LineClient } from '@line-crm/line-sdk';
import type { Message } from '@line-crm/line-sdk';
import { calculateStaggerDelay, sleep, addMessageVariation } from './stealth.js';
import { buildMessage } from './step-delivery.js';
import { personalizeTrackingUrls } from './auto-track.js';
import type { Friend } from '@line-crm/db';

const MULTICAST_BATCH_SIZE = 500;
const TEMPLATE_VAR_RE = /\{\{(name|score|uid)\}\}/;

function expandVariables(text: string, friend: Friend): string {
  return text
    .replace(/\{\{name\}\}/g, friend.display_name ?? '')
    .replace(/\{\{score\}\}/g, String(friend.score ?? 0))
    .replace(/\{\{uid\}\}/g, friend.line_user_id);
}

function hasTemplateVariables(content: string): boolean {
  return TEMPLATE_VAR_RE.test(content);
}

export async function processBroadcastSend(
  db: D1Database,
  lineClient: LineClient,
  broadcastId: string,
  workerUrl?: string,
): Promise<Broadcast> {
  // Mark as sending
  await updateBroadcastStatus(db, broadcastId, 'sending');

  const broadcast = await getBroadcastById(db, broadcastId);
  if (!broadcast) {
    throw new Error(`Broadcast ${broadcastId} not found`);
  }

  // Auto-wrap URLs with tracking links (text with URLs → Flex with button)
  let finalType: string = broadcast.message_type;
  let finalContent = broadcast.message_content;
  if (workerUrl) {
    const { autoTrackContent } = await import('./auto-track.js');
    const tracked = await autoTrackContent(db, broadcast.message_type, broadcast.message_content, workerUrl);
    finalType = tracked.messageType;
    finalContent = tracked.content;
  }

  const containsVars = hasTemplateVariables(finalContent);
  console.log(`[broadcast] id=${broadcastId} type=${broadcast.target_type} msgType=${finalType} hasVars=${containsVars} content=${finalContent.slice(0, 120)}`);

  const message = buildMessage(finalType, finalContent);
  let totalCount = 0;
  let successCount = 0;

  try {
    if (broadcast.target_type === 'all' && !containsVars) {
      // No variables — use efficient LINE broadcast API
      await lineClient.broadcast([message]);
      totalCount = 0;
      successCount = 0;
    } else if (broadcast.target_type === 'all' && containsVars) {
      // Variables present — must fetch all friends and send individually
      const allFriends = await db
        .prepare(`SELECT * FROM friends WHERE is_following = 1 ORDER BY created_at DESC`)
        .all<Friend>();
      const followingFriends = allFriends.results ?? [];
      totalCount = followingFriends.length;
      console.log(`[broadcast] target_type=all with variables — sending individually to ${followingFriends.length} friends`);

      const now = jstNow();
      for (let i = 0; i < followingFriends.length; i++) {
        const friend = followingFriends[i];
        const expandedContent = expandVariables(finalContent, friend);
        const personalizedContent = personalizeTrackingUrls(expandedContent, friend.line_user_id);
        console.log(`[broadcast] friend=${friend.display_name} expanded=${personalizedContent.slice(0, 100)}`);
        const personalMessage = buildMessage(finalType, personalizedContent);

        if (i > 0 && i % MULTICAST_BATCH_SIZE === 0) {
          const batchIndex = Math.floor(i / MULTICAST_BATCH_SIZE);
          const delay = calculateStaggerDelay(followingFriends.length, batchIndex);
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
          console.error(`Push to ${friend.line_user_id} failed:`, err);
        }
      }
    } else if (broadcast.target_type === 'tag') {
      if (!broadcast.target_tag_id) {
        throw new Error('target_tag_id is required for tag-targeted broadcasts');
      }

      const friends = await getFriendsByTag(db, broadcast.target_tag_id);
      const followingFriends = friends.filter((f) => f.is_following);
      totalCount = followingFriends.length;

      const now = jstNow();
      const useVariables = hasTemplateVariables(finalContent);

      if (useVariables) {
        console.log(`[broadcast] Variable expansion ON — sending individually to ${followingFriends.length} friends`);
        // Per-friend send with variable expansion
        for (let i = 0; i < followingFriends.length; i++) {
          const friend = followingFriends[i];
          const expandedContent = expandVariables(finalContent, friend);
          const personalizedContent = personalizeTrackingUrls(expandedContent, friend.line_user_id);
          console.log(`[broadcast] friend=${friend.display_name} uid=${friend.line_user_id} expanded=${personalizedContent.slice(0, 100)}`);
          const personalMessage = buildMessage(finalType, personalizedContent);

          // Stealth: stagger every 500 messages
          if (i > 0 && i % MULTICAST_BATCH_SIZE === 0) {
            const batchIndex = Math.floor(i / MULTICAST_BATCH_SIZE);
            const delay = calculateStaggerDelay(followingFriends.length, batchIndex);
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
            console.error(`Push to ${friend.line_user_id} failed:`, err);
          }
        }
      } else {
        // No variables — use efficient multicast batching
        const totalBatches = Math.ceil(followingFriends.length / MULTICAST_BATCH_SIZE);
        for (let i = 0; i < followingFriends.length; i += MULTICAST_BATCH_SIZE) {
          const batchIndex = Math.floor(i / MULTICAST_BATCH_SIZE);
          const batch = followingFriends.slice(i, i + MULTICAST_BATCH_SIZE);
          const lineUserIds = batch.map((f) => f.line_user_id);

          // Stealth: add staggered delay between batches
          if (batchIndex > 0) {
            const delay = calculateStaggerDelay(followingFriends.length, batchIndex);
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

            // Log only successfully sent messages
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
            console.error(`Multicast batch ${i / MULTICAST_BATCH_SIZE} failed:`, err);
          }
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

export async function processScheduledBroadcasts(
  db: D1Database,
  lineClient: LineClient,
  workerUrl?: string,
): Promise<void> {
  const now = jstNow();
  const allBroadcasts = await getBroadcasts(db);

  const nowMs = Date.now();
  const scheduled = allBroadcasts.filter(
    (b) =>
      b.status === 'scheduled' &&
      b.scheduled_at !== null &&
      new Date(b.scheduled_at).getTime() <= nowMs,
  );

  for (const broadcast of scheduled) {
    try {
      await processBroadcastSend(db, lineClient, broadcast.id, workerUrl);
    } catch (err) {
      console.error(`Failed to send scheduled broadcast ${broadcast.id}:`, err);
      // Continue with next broadcast
    }
  }
}

