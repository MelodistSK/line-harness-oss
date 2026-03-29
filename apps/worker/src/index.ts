import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { LineClient } from '@line-crm/line-sdk';
import { getLineAccounts } from '@line-crm/db';
import { processStepDeliveries } from './services/step-delivery.js';
import { processScheduledBroadcasts } from './services/broadcast.js';
import { processReminderDeliveries } from './services/reminder-delivery.js';
import { checkAccountHealth } from './services/ban-monitor.js';
import { authMiddleware } from './middleware/auth.js';
import { webhook } from './routes/webhook.js';
import { friends } from './routes/friends.js';
import { tags } from './routes/tags.js';
import { scenarios } from './routes/scenarios.js';
import { broadcasts } from './routes/broadcasts.js';
import { users } from './routes/users.js';
import { lineAccounts } from './routes/line-accounts.js';
import { conversions } from './routes/conversions.js';
import { affiliates } from './routes/affiliates.js';
import { openapi } from './routes/openapi.js';
import { liffRoutes } from './routes/liff.js';
// Round 3 ルート
import { webhooks } from './routes/webhooks.js';
import { calendar } from './routes/calendar.js';
import { reminders } from './routes/reminders.js';
import { scoring } from './routes/scoring.js';
import { templates } from './routes/templates.js';
import { chats } from './routes/chats.js';
import { notifications } from './routes/notifications.js';
import { stripe } from './routes/stripe.js';
import { health } from './routes/health.js';
import { automations } from './routes/automations.js';
import { richMenus } from './routes/rich-menus.js';
import { trackedLinks } from './routes/tracked-links.js';
import { analytics } from './routes/analytics.js';
import { forms } from './routes/forms.js';
import { assets } from './routes/assets.js';
import { richMenuMappings } from './routes/rich-menu-mappings.js';
import { adPlatforms } from './routes/ad-platforms.js';
import { generateBookingHtml, generateFormHtml, generateBookingCancelHtml } from './liff-pages.js';
import { processBookingReminders } from './services/booking-reminder.js';

export type Env = {
  Bindings: {
    DB: D1Database;
    ASSETS: R2Bucket;
    ASSETS_KV: KVNamespace;
    LINE_CHANNEL_SECRET: string;
    LINE_CHANNEL_ACCESS_TOKEN: string;
    API_KEY: string;
    LIFF_URL: string;
    LINE_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_ID: string;
    LINE_LOGIN_CHANNEL_SECRET: string;
    WORKER_URL: string;
    ALLOWED_ORIGINS?: string;
    X_HARNESS_URL?: string;  // Optional: X Harness API URL for account linking
  };
};

const app = new Hono<Env>();

// CORS — control origins via ALLOWED_ORIGINS env var (comma-separated)
// Fallback to '*' if not set (for backward compatibility during MVP)
const allowedOrigins = (c: Context) => {
  const origins = c.env.ALLOWED_ORIGINS;
  if (!origins) return '*';
  return origins.split(',').map(o => o.trim());
};

app.use('*', (c, next) => {
  const origins = allowedOrigins(c);
  return cors({ origin: origins })(c, next);
});

// Auth middleware — skips /webhook and /docs automatically
app.use('*', authMiddleware);

// Mount route groups — MVP & Round 2
app.route('/', webhook);
app.route('/', friends);
app.route('/', tags);
app.route('/', scenarios);
app.route('/', broadcasts);
app.route('/', users);
app.route('/', lineAccounts);
app.route('/', conversions);
app.route('/', affiliates);
app.route('/', openapi);
app.route('/', liffRoutes);

// Mount route groups — Round 3
app.route('/', webhooks);
app.route('/', calendar);
app.route('/', reminders);
app.route('/', scoring);
app.route('/', templates);
app.route('/', chats);
app.route('/', notifications);
app.route('/', stripe);
app.route('/', health);
app.route('/', automations);
app.route('/', richMenus);
app.route('/', trackedLinks);
app.route('/', analytics);
app.route('/', forms);
app.route('/', assets);
app.route('/', richMenuMappings);
app.route('/', adPlatforms);

// Short link: /r/:ref → record scan + redirect to LINE friend-add URL
app.get('/r/:ref', async (c) => {
  const ref = c.req.param('ref');
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || null;
  const ua = c.req.header('User-Agent') || null;

  // Record the scan asynchronously (don't block redirect)
  const ctx = c.executionCtx as ExecutionContext;
  ctx.waitUntil((async () => {
    try {
      const { recordRefScan, incrementQrCodeScan } = await import('@line-crm/db');
      await recordRefScan(c.env.DB, ref, ip, ua);
      await incrementQrCodeScan(c.env.DB, ref);
    } catch (err) {
      console.error('/r/:ref scan recording error:', err);
    }
  })());

  // Redirect directly to LINE friend-add URL
  const botBasicId = '@374uwtva';
  return c.redirect(`https://line.me/R/ti/p/${botBasicId}`, 302);
});

// LIFF app — serve from KV
app.get('/liff', async (c) => {
  const html = await c.env.ASSETS_KV.get('liff-index.html', 'text');
  if (!html) return c.json({ success: false, error: 'LIFF app not found' }, 404);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// LIFF Booking — standalone page, NO friend-add flow
app.get('/liff/booking', (c) => {
  const liffId = c.env.LIFF_URL?.match(/liff\.line\.me\/([^?/]+)/)?.[1] || '2009615537-8qwrEnEt';
  const workerUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
  return new Response(generateBookingHtml(liffId, workerUrl), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// LIFF Booking Cancel — standalone page, NO friend-add flow
app.get('/liff/booking/cancel', (c) => {
  const liffId = c.env.LIFF_URL?.match(/liff\.line\.me\/([^?/]+)/)?.[1] || '2009615537-8qwrEnEt';
  const workerUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
  return new Response(generateBookingCancelHtml(liffId, workerUrl), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// LIFF Form — standalone page, NO friend-add flow
app.get('/liff/form', (c) => {
  const liffId = c.env.LIFF_URL?.match(/liff\.line\.me\/([^?/]+)/)?.[1] || '2009615537-8qwrEnEt';
  const workerUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
  const formId = new URL(c.req.url).searchParams.get('id') || '';
  return new Response(generateFormHtml(liffId, workerUrl, formId), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

// 404 fallback
app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

// Scheduled handler for cron triggers — runs for all active LINE accounts
async function scheduled(
  _event: ScheduledEvent,
  env: Env['Bindings'],
  _ctx: ExecutionContext,
): Promise<void> {
  // Get all active accounts from DB, plus the default env account
  const dbAccounts = await getLineAccounts(env.DB);
  const activeTokens = new Set<string>();

  // Default account from env
  activeTokens.add(env.LINE_CHANNEL_ACCESS_TOKEN);

  // DB accounts
  for (const account of dbAccounts) {
    if (account.is_active) {
      activeTokens.add(account.channel_access_token);
    }
  }

  // Run delivery for each account
  const jobs = [];
  for (const token of activeTokens) {
    const lineClient = new LineClient(token);
    jobs.push(
      processStepDeliveries(env.DB, lineClient, env.WORKER_URL),
      processScheduledBroadcasts(env.DB, lineClient, env.WORKER_URL),
      processReminderDeliveries(env.DB, lineClient),
    );
  }
  jobs.push(checkAccountHealth(env.DB));

  // Booking reminders (only need default client, bookings are cross-account)
  const defaultLineClient = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
  jobs.push(processBookingReminders(env.DB, defaultLineClient, env.WORKER_URL, env.LINE_CHANNEL_ACCESS_TOKEN));

  await Promise.allSettled(jobs);
}

export default {
  fetch: app.fetch,
  scheduled,
};
