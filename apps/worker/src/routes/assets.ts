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
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB (KV value limit is 25 MB)

// POST /api/assets/upload — upload an image (auth required)
assets.post('/api/assets/upload', async (c) => {
  try {
    const contentType = c.req.header('content-type') ?? '';

    let filename: string;
    let data: ArrayBuffer;
    let mime: string;

    if (contentType.includes('multipart/form-data')) {
      const form = await c.req.formData();
      const file = form.get('file');
      if (!file || !(file instanceof File)) {
        return c.json({ success: false, error: 'file field is required' }, 400);
      }
      const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
      mime = MIME_TYPES[ext] ?? file.type;
      if (!mime.startsWith('image/')) {
        return c.json({ success: false, error: 'Only image files are allowed' }, 400);
      }
      data = await file.arrayBuffer();
      const timestamp = Date.now();
      const rand = crypto.randomUUID().slice(0, 8);
      filename = `${timestamp}-${rand}.${ext}`;
    } else if (contentType.startsWith('image/')) {
      data = await c.req.arrayBuffer();
      const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg'
        : contentType.includes('gif') ? 'gif'
        : contentType.includes('webp') ? 'webp'
        : contentType.includes('svg') ? 'svg'
        : 'png';
      mime = MIME_TYPES[ext] ?? 'image/png';
      const timestamp = Date.now();
      const rand = crypto.randomUUID().slice(0, 8);
      filename = `${timestamp}-${rand}.${ext}`;
    } else {
      return c.json({
        success: false,
        error: 'Content-Type must be multipart/form-data or image/*',
      }, 400);
    }

    if (data.byteLength > MAX_SIZE) {
      return c.json({ success: false, error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` }, 400);
    }

    await c.env.ASSETS.put(filename, data, {
      metadata: { contentType: mime, size: data.byteLength },
    });

    const workerUrl = c.env.WORKER_URL || new URL(c.req.url).origin;
    const publicUrl = `${workerUrl}/assets/${filename}`;

    return c.json({
      success: true,
      data: { filename, url: publicUrl, contentType: mime, size: data.byteLength },
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/assets/upload error:', message);
    return c.json({ success: false, error: `Upload failed: ${message}` }, 500);
  }
});

// GET /assets/:filename — serve image publicly (no auth)
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

    const mime = metadata?.contentType ?? 'image/png';
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
    const list = await c.env.ASSETS.list();
    const workerUrl = c.env.WORKER_URL || new URL(c.req.url).origin;

    const items = list.keys.map((key) => ({
      filename: key.name,
      url: `${workerUrl}/assets/${key.name}`,
      ...(key.metadata as Record<string, unknown> ?? {}),
    }));

    return c.json({ success: true, data: items });
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
