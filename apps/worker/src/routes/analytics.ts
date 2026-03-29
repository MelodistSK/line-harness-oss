import { Hono } from 'hono';
import {
  getQrCodes,
  getQrCodeById,
  getQrCodeByRef,
  createQrCode,
  deleteQrCode,
  getSourceStats,
  getDailySourceStats,
  getAnalyticsSummary,
} from '@line-crm/db';
import type { Env } from '../index.js';

const analytics = new Hono<Env>();

// ========================================================================
// QR Codes CRUD
// ========================================================================

analytics.get('/api/qr-codes', async (c) => {
  try {
    const items = await getQrCodes(c.env.DB);
    const baseUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
    return c.json({
      success: true,
      data: items.map((q) => ({
        id: q.id,
        name: q.name,
        refCode: q.ref_code,
        scanCount: q.scan_count,
        friendCount: q.friend_count,
        isActive: !!q.is_active,
        liffUrl: `${baseUrl}/r/${encodeURIComponent(q.ref_code)}`,
        createdAt: q.created_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/qr-codes error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

analytics.post('/api/qr-codes', async (c) => {
  try {
    const body = await c.req.json<{ name: string; refCode?: string }>();
    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);

    // Generate ref code if not provided
    const refCode = body.refCode || `qr_${crypto.randomUUID().slice(0, 8)}`;

    // Check uniqueness
    const existing = await getQrCodeByRef(c.env.DB, refCode);
    if (existing) return c.json({ success: false, error: 'This ref code already exists' }, 409);

    const qr = await createQrCode(c.env.DB, { name: body.name, refCode });
    const baseUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
    return c.json({
      success: true,
      data: {
        id: qr.id,
        name: qr.name,
        refCode: qr.ref_code,
        liffUrl: `${baseUrl}/r/${encodeURIComponent(qr.ref_code)}`,
      },
    }, 201);
  } catch (err) {
    console.error('POST /api/qr-codes error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

analytics.delete('/api/qr-codes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const qr = await getQrCodeById(c.env.DB, id);
    if (!qr) return c.json({ success: false, error: 'QR code not found' }, 404);
    await deleteQrCode(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/qr-codes/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

analytics.get('/api/qr-codes/:id/stats', async (c) => {
  try {
    const id = c.req.param('id');
    const qr = await getQrCodeById(c.env.DB, id);
    if (!qr) return c.json({ success: false, error: 'QR code not found' }, 404);

    // Get daily friend additions for this ref
    const daily = await getDailySourceStats(c.env.DB);
    const filtered = daily.filter((d) => d.ref_code === qr.ref_code);

    return c.json({
      success: true,
      data: {
        id: qr.id,
        name: qr.name,
        refCode: qr.ref_code,
        scanCount: qr.scan_count,
        friendCount: qr.friend_count,
        daily: filtered.map((d) => ({ date: d.date, count: d.count })),
      },
    });
  } catch (err) {
    console.error('GET /api/qr-codes/:id/stats error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========================================================================
// Analytics endpoints
// ========================================================================

analytics.get('/api/analytics/sources', async (c) => {
  try {
    const from = c.req.query('from') ?? undefined;
    const to = c.req.query('to') ?? undefined;
    const stats = await getSourceStats(c.env.DB, from, to);

    // Enrich with QR code names
    const qrCodes = await getQrCodes(c.env.DB);
    const qrMap = new Map(qrCodes.map((q) => [q.ref_code, q.name]));

    return c.json({
      success: true,
      data: stats.map((s) => ({
        refCode: s.ref_code,
        name: qrMap.get(s.ref_code) || s.ref_code,
        friendCount: s.friend_count,
      })),
    });
  } catch (err) {
    console.error('GET /api/analytics/sources error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

analytics.get('/api/analytics/sources/daily', async (c) => {
  try {
    const from = c.req.query('from') ?? undefined;
    const to = c.req.query('to') ?? undefined;
    const stats = await getDailySourceStats(c.env.DB, from, to);

    const qrCodes = await getQrCodes(c.env.DB);
    const qrMap = new Map(qrCodes.map((q) => [q.ref_code, q.name]));

    return c.json({
      success: true,
      data: stats.map((s) => ({
        date: s.date,
        refCode: s.ref_code,
        name: qrMap.get(s.ref_code) || s.ref_code,
        count: s.count,
      })),
    });
  } catch (err) {
    console.error('GET /api/analytics/sources/daily error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

analytics.get('/api/analytics/summary', async (c) => {
  try {
    const summary = await getAnalyticsSummary(c.env.DB);

    // Resolve top source name
    let topSourceName = summary.topSource;
    if (summary.topSource) {
      const qr = await getQrCodeByRef(c.env.DB, summary.topSource);
      if (qr) topSourceName = qr.name;
    }

    return c.json({
      success: true,
      data: {
        ...summary,
        topSourceName,
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/summary error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { analytics };
