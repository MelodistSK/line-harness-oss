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
  js: 'application/javascript',
  css: 'text/css',
  html: 'text/html',
  json: 'application/json',
  woff2: 'font/woff2',
  woff: 'font/woff',
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_TYPES));
const MAX_SIZE = 100 * 1024 * 1024; // 100 MB (R2 supports up to 5 GB per object)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

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
      httpMetadata: { contentType: mime },
      customMetadata: {
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

function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

// OPTIONS /assets/:filename — CORS preflight
assets.options('/assets/:filename', (c) => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

// GET /assets/:filename — serve file publicly (no auth, Range request supported)
assets.get('/assets/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    const rangeHeader = c.req.header('range');

    // Try R2 first — supports range requests natively
    const r2Head = await c.env.ASSETS.head(filename);
    if (r2Head) {
      const mime = r2Head.httpMetadata?.contentType || mimeFromFilename(filename);
      const totalSize = r2Head.size;

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          const obj = await c.env.ASSETS.get(filename, { range: { offset: start, length: end - start + 1 } });
          if (!obj) return c.json({ success: false, error: 'Not found' }, 404);
          return new Response(obj.body, {
            status: 206,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': mime,
              'Content-Range': `bytes ${start}-${end}/${totalSize}`,
              'Content-Length': String(end - start + 1),
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=31536000, immutable',
              'ETag': r2Head.httpEtag,
            },
          });
        }
      }

      const obj = await c.env.ASSETS.get(filename);
      if (!obj) return c.json({ success: false, error: 'Not found' }, 404);
      return new Response(obj.body, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': mime,
          'Content-Length': String(totalSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'ETag': obj.httpEtag,
        },
      });
    }

    // Fallback: check KV (legacy files not yet migrated)
    const { value, metadata } = await c.env.ASSETS_KV.getWithMetadata<{ contentType: string }>(
      filename,
      'arrayBuffer',
    );
    if (value) {
      const mime = metadata?.contentType || mimeFromFilename(filename);
      const buf = value as ArrayBuffer;
      const totalSize = buf.byteLength;

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          const slice = buf.slice(start, end + 1);
          return new Response(slice, {
            status: 206,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': mime,
              'Content-Range': `bytes ${start}-${end}/${totalSize}`,
              'Content-Length': String(slice.byteLength),
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
      }

      return new Response(buf, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': mime,
          'Content-Length': String(totalSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return c.json({ success: false, error: 'Not found' }, 404);
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

    const allItems: Record<string, unknown>[] = [];

    // List R2 objects
    let r2Cursor: string | undefined;
    do {
      const listed = await c.env.ASSETS.list({ cursor: r2Cursor, limit: 1000 });
      for (const obj of listed.objects) {
        const ct = obj.httpMetadata?.contentType ?? '';
        if (filterType === 'image' && !ct.startsWith('image/')) continue;
        if (filterType === 'video' && !ct.startsWith('video/')) continue;
        allItems.push({
          filename: obj.key,
          url: `${workerUrl}/assets/${obj.key}`,
          contentType: ct,
          size: obj.size,
          originalName: obj.customMetadata?.originalName,
          uploadedAt: obj.customMetadata?.uploadedAt ?? obj.uploaded.toISOString(),
          storage: 'r2',
        });
      }
      r2Cursor = listed.truncated ? listed.cursor : undefined;
    } while (r2Cursor);

    // Also list KV assets (legacy, not yet migrated)
    let kvCursor: string | undefined;
    do {
      const list = await c.env.ASSETS_KV.list({ cursor: kvCursor, limit: 1000 });
      for (const key of list.keys) {
        // Skip if already in R2
        if (allItems.some(i => i.filename === key.name)) continue;
        const meta = (key.metadata ?? {}) as Record<string, unknown>;
        const ct = (meta.contentType as string) || '';
        if (filterType === 'image' && !ct.startsWith('image/')) continue;
        if (filterType === 'video' && !ct.startsWith('video/')) continue;
        if (key.name === 'liff-index.html' || key.name === 'liff.js') continue;
        allItems.push({
          filename: key.name,
          url: `${workerUrl}/assets/${key.name}`,
          ...meta,
          storage: 'kv',
        });
      }
      kvCursor = list.list_complete ? undefined : list.cursor;
    } while (kvCursor);

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
    // Delete from both R2 and KV to handle migration period
    await Promise.allSettled([
      c.env.ASSETS.delete(filename),
      c.env.ASSETS_KV.delete(filename),
    ]);
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('DELETE /api/assets/:filename error:', message);
    return c.json({ success: false, error: `Failed to delete asset: ${message}` }, 500);
  }
});

// POST /api/assets/migrate-to-r2 — migrate all KV assets to R2 (auth required)
assets.post('/api/assets/migrate-to-r2', async (c) => {
  try {
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    let kvCursor: string | undefined;

    do {
      const list = await c.env.ASSETS_KV.list({ cursor: kvCursor, limit: 100 });
      for (const key of list.keys) {
        if (key.name === 'liff-index.html' || key.name === 'liff.js') { skipped++; continue; }
        const meta = (key.metadata ?? {}) as Record<string, unknown>;

        // Check if already in R2
        const existing = await c.env.ASSETS.head(key.name);
        if (existing) { skipped++; continue; }

        try {
          const value = await c.env.ASSETS_KV.get(key.name, 'arrayBuffer');
          if (!value) { skipped++; continue; }

          const ct = (meta.contentType as string) || 'application/octet-stream';
          await c.env.ASSETS.put(key.name, value, {
            httpMetadata: { contentType: ct },
            customMetadata: {
              originalName: (meta.originalName as string) || key.name,
              uploadedAt: (meta.uploadedAt as string) || new Date().toISOString(),
            },
          });
          migrated++;
        } catch (err) {
          console.error(`Failed to migrate ${key.name}:`, err);
          failed++;
        }
      }
      kvCursor = list.list_complete ? undefined : list.cursor;
    } while (kvCursor);

    return c.json({ success: true, data: { migrated, skipped, failed } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/assets/migrate-to-r2 error:', message);
    return c.json({ success: false, error: `Migration failed: ${message}` }, 500);
  }
});

export { assets };
