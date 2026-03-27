import { Hono } from 'hono';
import { LineClient } from '@line-crm/line-sdk';
import { getFriendsByTag } from '@line-crm/db';
import type { Env } from '../index.js';

const richMenuMappings = new Hono<Env>();

// GET /api/rich-menu-tag-mappings — list all mappings
richMenuMappings.get('/api/rich-menu-tag-mappings', async (c) => {
  try {
    const rows = await c.env.DB
      .prepare('SELECT id, tag_id, rich_menu_id, created_at FROM rich_menu_tag_mappings ORDER BY created_at DESC')
      .all();
    const data = (rows.results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      tagId: r.tag_id,
      richMenuId: r.rich_menu_id,
      createdAt: r.created_at,
    }));
    return c.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// POST /api/rich-menu-tag-mappings — create or update a mapping
richMenuMappings.post('/api/rich-menu-tag-mappings', async (c) => {
  try {
    const body = await c.req.json<{ tagId: string; richMenuId: string }>();
    if (!body.tagId || !body.richMenuId) {
      return c.json({ success: false, error: 'tagId and richMenuId are required' }, 400);
    }

    const id = crypto.randomUUID();
    await c.env.DB
      .prepare(
        `INSERT INTO rich_menu_tag_mappings (id, tag_id, rich_menu_id)
         VALUES (?, ?, ?)
         ON CONFLICT(tag_id) DO UPDATE SET rich_menu_id = excluded.rich_menu_id`,
      )
      .bind(id, body.tagId, body.richMenuId)
      .run();

    return c.json({ success: true, data: { id, tagId: body.tagId, richMenuId: body.richMenuId } }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// DELETE /api/rich-menu-tag-mappings/:id — delete a mapping
richMenuMappings.delete('/api/rich-menu-tag-mappings/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB
      .prepare('DELETE FROM rich_menu_tag_mappings WHERE id = ?')
      .bind(id)
      .run();
    return c.json({ success: true, data: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// POST /api/rich-menu-tag-mappings/:id/apply — apply mapping to all friends with this tag
richMenuMappings.post('/api/rich-menu-tag-mappings/:id/apply', async (c) => {
  try {
    const id = c.req.param('id');
    const mapping = await c.env.DB
      .prepare('SELECT tag_id, rich_menu_id FROM rich_menu_tag_mappings WHERE id = ?')
      .bind(id)
      .first<{ tag_id: string; rich_menu_id: string }>();

    if (!mapping) {
      return c.json({ success: false, error: 'Mapping not found' }, 404);
    }

    const friends = await getFriendsByTag(c.env.DB, mapping.tag_id);
    const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);

    let linked = 0;
    let failed = 0;
    for (const friend of friends) {
      try {
        await lineClient.linkRichMenuToUser(friend.line_user_id, mapping.rich_menu_id);
        linked++;
      } catch {
        failed++;
      }
    }

    return c.json({ success: true, data: { linked, failed, total: friends.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

export { richMenuMappings };
