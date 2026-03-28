import { Hono } from 'hono';
import type { Env } from '../index.js';

const assets = new Hono<Env>();

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_TYPES));
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB (KV value limit)

// POST /api/assets/upload — upload image or video (auth required)
assets.post('/api/assets/upload', async (c) => {
  try {
    const contentType = c.req.header('content-type') ?? '';

    let filename: string;
    let originalName: string;
    let data: ArrayBuffer;
    let mime: string;

    if (contentType.includes('multipart/form-data')) {
      const form = await c.req.formData();
      const file = form.get('file');
      if (!file || !(file instanceof File)) {
        return c.json({ success: false, error: 'file field is required' }, 400);
      }
      const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return c.json({ success: false, error: `Unsupported file type: .${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` }, 400);
      }
      mime = MIME_TYPES[ext] ?? file.type;
      if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
        return c.json({ success: false, error: 'Only image and video files are allowed' }, 400);
      }
      data = await file.arrayBuffer();
      originalName = file.name;
      const timestamp = Date.now();
      const rand = crypto.randomUUID().slice(0, 8);
      filename = `${timestamp}-${rand}.${ext}`;
    } else if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
      data = await c.req.arrayBuffer();
      let ext = 'png';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
      else if (contentType.includes('gif')) ext = 'gif';
      else if (contentType.includes('webp')) ext = 'webp';
      else if (contentType.includes('svg')) ext = 'svg';
      else if (contentType.includes('mp4') || contentType.includes('m4v')) ext = 'mp4';
      mime = MIME_TYPES[ext] ?? contentType;
      originalName = `upload.${ext}`;
      const timestamp = Date.now();
      const rand = crypto.randomUUID().slice(0, 8);
      filename = `${timestamp}-${rand}.${ext}`;
    } else {
      return c.json({
        success: false,
        error: 'Content-Type must be multipart/form-data, image/*, or video/*',
      }, 400);
    }

    if (data.byteLength > MAX_SIZE) {
      return c.json({ success: false, error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` }, 400);
    }

    const now = new Date().toISOString();
    await c.env.ASSETS.put(filename, data, {
      metadata: {
        contentType: mime,
        size: data.byteLength,
        originalName,
        uploadedAt: now,
      },
    });

    const workerUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
    const publicUrl = `${workerUrl}/assets/${filename}`;

    return c.json({
      success: true,
      data: { filename, url: publicUrl, contentType: mime, size: data.byteLength, originalName, uploadedAt: now },
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/assets/upload error:', message);
    return c.json({ success: false, error: `Upload failed: ${message}` }, 500);
  }
});

// GET /assets/:filename — serve file publicly (no auth)
assets.get('/assets/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    const { value, metadata } = await c.env.ASSETS.getWithMetadata<{ contentType: string }>(
      filename,
      'arrayBuffer',
    );

    if (!value) {
      return c.json({ success: false, error: 'Not found' }, 404);
    }

    const mime = metadata?.contentType ?? 'application/octet-stream';
    return new Response(value as ArrayBuffer, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('GET /assets/:filename error:', message);
    return c.json({ success: false, error: `Failed to retrieve asset: ${message}` }, 500);
  }
});

// GET /api/assets — list uploaded assets (auth required)
assets.get('/api/assets', async (c) => {
  try {
    const workerUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
    const filterType = c.req.query('type'); // 'image' | 'video' | undefined

    // Paginate through all KV keys
    let cursor: string | undefined;
    const allItems: Record<string, unknown>[] = [];
    do {
      const list = await c.env.ASSETS.list({ cursor, limit: 1000 });
      for (const key of list.keys) {
        const meta = (key.metadata ?? {}) as Record<string, unknown>;
        const ct = (meta.contentType as string) || '';
        if (filterType === 'image' && !ct.startsWith('image/')) continue;
        if (filterType === 'video' && !ct.startsWith('video/')) continue;
        // Skip internal LIFF files
        if (key.name === 'liff-index.html' || key.name === 'liff.js') continue;
        allItems.push({
          filename: key.name,
          url: `${workerUrl}/assets/${key.name}`,
          ...meta,
        });
      }
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);

    return c.json({ success: true, data: allItems });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('GET /api/assets error:', message);
    return c.json({ success: false, error: `Failed to list assets: ${message}` }, 500);
  }
});

// DELETE /api/assets/:filename — delete an asset (auth required)
assets.delete('/api/assets/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    await c.env.ASSETS.delete(filename);
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('DELETE /api/assets/:filename error:', message);
    return c.json({ success: false, error: `Failed to delete asset: ${message}` }, 500);
  }
});

export { assets };
