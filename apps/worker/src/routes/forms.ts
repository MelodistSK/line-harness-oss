import { Hono } from 'hono';
import {
  getForms,
  getFormById,
  createForm,
  updateForm,
  deleteForm,
  getFormSubmissions,
  createFormSubmission,
  jstNow,
} from '@line-crm/db';
import { getFriendByLineUserId, getFriendById } from '@line-crm/db';
import { addTagToFriend, enrollFriendInScenario } from '@line-crm/db';
import type { Form as DbForm, FormSubmission as DbFormSubmission } from '@line-crm/db';
import type { Env } from '../index.js';

const forms = new Hono<Env>();

function serializeForm(row: DbForm & { kintone_enabled?: number; kintone_subdomain?: string; kintone_app_id?: string; kintone_api_token?: string; kintone_field_mapping?: string }) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fields: JSON.parse(row.fields || '[]') as unknown[],
    onSubmitTagId: row.on_submit_tag_id,
    onSubmitScenarioId: row.on_submit_scenario_id,
    saveToMetadata: Boolean(row.save_to_metadata),
    isActive: Boolean(row.is_active),
    submitCount: row.submit_count,
    kintoneEnabled: Boolean(row.kintone_enabled),
    kintoneSubdomain: row.kintone_subdomain ?? null,
    kintoneAppId: row.kintone_app_id ?? null,
    kintoneApiToken: row.kintone_api_token ?? null,
    kintoneFieldMapping: row.kintone_field_mapping ? JSON.parse(row.kintone_field_mapping) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeSubmission(row: DbFormSubmission & { friend_name?: string | null }) {
  return {
    id: row.id,
    formId: row.form_id,
    friendId: row.friend_id,
    friendName: row.friend_name || null,
    data: JSON.parse(row.data || '{}') as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

// GET /api/forms — list all forms
forms.get('/api/forms', async (c) => {
  try {
    const items = await getForms(c.env.DB);
    return c.json({ success: true, data: items.map(serializeForm) });
  } catch (err) {
    console.error('GET /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/forms/:id — get form
forms.get('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    return c.json({ success: true, data: serializeForm(form) });
  } catch (err) {
    console.error('GET /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/forms — create form
forms.post('/api/forms', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      description?: string | null;
      fields?: unknown[];
      onSubmitTagId?: string | null;
      onSubmitScenarioId?: string | null;
      saveToMetadata?: boolean;
    }>();

    if (!body.name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }

    const form = await createForm(c.env.DB, {
      name: body.name,
      description: body.description ?? null,
      fields: JSON.stringify(body.fields ?? []),
      onSubmitTagId: body.onSubmitTagId ?? null,
      onSubmitScenarioId: body.onSubmitScenarioId ?? null,
      saveToMetadata: body.saveToMetadata,
    });

    // Save kintone fields if provided
    const kb = body as Record<string, unknown>;
    if (kb.kintoneEnabled !== undefined) {
      await c.env.DB.prepare(
        `UPDATE forms SET kintone_enabled = ?, kintone_subdomain = ?, kintone_app_id = ?, kintone_api_token = ?, kintone_field_mapping = ? WHERE id = ?`
      ).bind(
        kb.kintoneEnabled ? 1 : 0,
        (kb.kintoneSubdomain as string) || null,
        (kb.kintoneAppId as string) || null,
        (kb.kintoneApiToken as string) || null,
        kb.kintoneFieldMapping ? JSON.stringify(kb.kintoneFieldMapping) : null,
        form.id,
      ).run();
    }

    return c.json({ success: true, data: serializeForm(form) }, 201);
  } catch (err) {
    console.error('POST /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/forms/:id — update form
forms.put('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      description?: string | null;
      fields?: unknown[];
      onSubmitTagId?: string | null;
      onSubmitScenarioId?: string | null;
      saveToMetadata?: boolean;
      isActive?: boolean;
    }>();

    const updated = await updateForm(c.env.DB, id, {
      name: body.name,
      description: body.description,
      fields: body.fields !== undefined ? JSON.stringify(body.fields) : undefined,
      onSubmitTagId: body.onSubmitTagId,
      onSubmitScenarioId: body.onSubmitScenarioId,
      saveToMetadata: body.saveToMetadata,
      isActive: body.isActive,
    });

    // Update kintone fields if provided
    const kb = body as Record<string, unknown>;
    if (kb.kintoneEnabled !== undefined) {
      await c.env.DB.prepare(
        `UPDATE forms SET kintone_enabled = ?, kintone_subdomain = ?, kintone_app_id = ?, kintone_api_token = ?, kintone_field_mapping = ? WHERE id = ?`
      ).bind(
        kb.kintoneEnabled ? 1 : 0,
        (kb.kintoneSubdomain as string) || null,
        (kb.kintoneAppId as string) || null,
        (kb.kintoneApiToken as string) || null,
        kb.kintoneFieldMapping ? JSON.stringify(kb.kintoneFieldMapping) : null,
        id,
      ).run();
    }

    if (!updated) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }

    return c.json({ success: true, data: serializeForm(updated) });
  } catch (err) {
    console.error('PUT /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/forms/:id
forms.delete('/api/forms/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    await deleteForm(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/forms/:id/submissions — list submissions
forms.get('/api/forms/:id/submissions', async (c) => {
  try {
    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    const submissions = await getFormSubmissions(c.env.DB, id);
    return c.json({ success: true, data: submissions.map(serializeSubmission) });
  } catch (err) {
    console.error('GET /api/forms/:id/submissions error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/forms/:id/submit — submit form (public, used by LIFF)
forms.post('/api/forms/:id/submit', async (c) => {
  try {
    const formId = c.req.param('id');
    const form = await getFormById(c.env.DB, formId);
    if (!form) {
      return c.json({ success: false, error: 'Form not found' }, 404);
    }
    if (!form.is_active) {
      return c.json({ success: false, error: 'This form is no longer accepting responses' }, 400);
    }

    const body = await c.req.json<{
      lineUserId?: string;
      friendId?: string;
      data?: Record<string, unknown>;
    }>();

    const submissionData = body.data ?? {};

    // Validate required fields
    const fields = JSON.parse(form.fields || '[]') as Array<{
      name: string;
      label: string;
      type: string;
      required?: boolean;
    }>;

    for (const field of fields) {
      if (field.required) {
        const val = submissionData[field.name];
        if (val === undefined || val === null || val === '') {
          return c.json(
            { success: false, error: `${field.label} は必須項目です` },
            400,
          );
        }
      }
    }

    // Resolve friend by lineUserId or friendId
    let friendId: string | null = body.friendId ?? null;
    if (!friendId && body.lineUserId) {
      const friend = await getFriendByLineUserId(c.env.DB, body.lineUserId);
      if (friend) {
        friendId = friend.id;
      }
    }

    // Save submission (friendId null if not resolved — avoids FK constraint)
    const submission = await createFormSubmission(c.env.DB, {
      formId,
      friendId: friendId || null,
      data: JSON.stringify(submissionData),
    });

    // Side effects (best-effort, don't fail the request)
    if (friendId) {
      const db = c.env.DB;
      const now = jstNow();

      const sideEffects: Promise<unknown>[] = [];

      // Save response data to friend's metadata
      if (form.save_to_metadata) {
        sideEffects.push(
          (async () => {
            const friend = await getFriendById(db, friendId!);
            if (!friend) return;
            const existing = JSON.parse(friend.metadata || '{}') as Record<string, unknown>;
            const merged = { ...existing, ...submissionData };
            await db
              .prepare(`UPDATE friends SET metadata = ?, updated_at = ? WHERE id = ?`)
              .bind(JSON.stringify(merged), now, friendId)
              .run();
          })(),
        );
      }

      // Add tag
      if (form.on_submit_tag_id) {
        sideEffects.push(addTagToFriend(db, friendId, form.on_submit_tag_id));
      }

      // Enroll in scenario
      if (form.on_submit_scenario_id) {
        sideEffects.push(enrollFriendInScenario(db, friendId, form.on_submit_scenario_id));
      }

      // Send confirmation message with submitted data back to user
      sideEffects.push(
        (async () => {
          console.log('Form reply: starting for friendId', friendId);
          const friend = await getFriendById(db, friendId!);
          if (!friend?.line_user_id) { console.log('Form reply: no line_user_id'); return; }
          console.log('Form reply: sending to', friend.line_user_id);
          const { LineClient } = await import('@line-crm/line-sdk');
          // Resolve access token from friend's account (multi-account support)
          let accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
          if ((friend as unknown as Record<string, unknown>).line_account_id) {
            const { getLineAccountById } = await import('@line-crm/db');
            const account = await getLineAccountById(db, (friend as unknown as Record<string, unknown>).line_account_id as string);
            if (account) accessToken = account.channel_access_token;
          }
          const lineClient = new LineClient(accessToken);

          // Build Flex card showing their answers
          const entries = Object.entries(submissionData as Record<string, unknown>);
          const answerRows = entries.map(([key, value]) => {
            const field = form.fields ? (JSON.parse(form.fields) as Array<{ name: string; label: string }>).find((f: { name: string }) => f.name === key) : null;
            const label = field?.label || key;
            const val = Array.isArray(value) ? value.join(', ') : (value !== null && value !== undefined && value !== '') ? String(value) : '-';
            return {
              type: 'box' as const, layout: 'vertical' as const, margin: 'md' as const,
              contents: [
                { type: 'text' as const, text: label, size: 'xxs' as const, color: '#64748b' },
                { type: 'text' as const, text: val, size: 'sm' as const, color: '#1e293b', weight: 'bold' as const, wrap: true },
              ],
            };
          });

          const flex = {
            type: 'bubble', size: 'giga',
            header: {
              type: 'box', layout: 'vertical',
              contents: [
                { type: 'text', text: '診断結果', size: 'lg', weight: 'bold', color: '#1e293b' },
                { type: 'text', text: `${friend.display_name || ''}さんのプロフィール`, size: 'xs', color: '#64748b', margin: 'sm' },
              ],
              paddingAll: '20px', backgroundColor: '#f0fdf4',
            },
            body: {
              type: 'box', layout: 'vertical',
              contents: [
                ...answerRows,
                { type: 'separator', margin: 'lg' },
                ...(form.save_to_metadata ? [{ type: 'box', layout: 'vertical', margin: 'lg', backgroundColor: '#eff6ff', cornerRadius: 'md', paddingAll: '12px',
                  contents: [
                    { type: 'text', text: 'メタデータに自動保存済み。今後の配信があなたに最適化されます。', size: 'xxs', color: '#2563EB', wrap: true },
                  ],
                }] : []),
              ],
              paddingAll: '20px',
            },
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              contents: [
                { type: 'button', action: { type: 'message', label: 'アカウント連携を見る', text: 'アカウント連携を見る' }, style: 'primary', color: '#14b8a6' },
              ],
            },
          };

          const { buildMessage } = await import('../services/step-delivery.js');
          await lineClient.pushMessage(friend.line_user_id, [buildMessage('flex', JSON.stringify(flex))]);
        })(),
      );

      if (sideEffects.length > 0) {
        const results = await Promise.allSettled(sideEffects);
        for (const r of results) {
          if (r.status === 'rejected') console.error('Form side-effect failed:', r.reason);
        }
      }
    }

    // kintone integration (best-effort)
    try {
      const fullForm = await c.env.DB.prepare(
        'SELECT kintone_enabled, kintone_subdomain, kintone_app_id, kintone_api_token, kintone_field_mapping FROM forms WHERE id = ?'
      ).bind(formId).first<{ kintone_enabled: number; kintone_subdomain: string; kintone_app_id: string; kintone_api_token: string; kintone_field_mapping: string }>();

      if (fullForm?.kintone_enabled && fullForm.kintone_subdomain && fullForm.kintone_app_id && fullForm.kintone_api_token) {
        const mapping = JSON.parse(fullForm.kintone_field_mapping || '{}') as Record<string, string>;
        const record: Record<string, { value: unknown }> = {};
        for (const [formField, kintoneField] of Object.entries(mapping)) {
          if (kintoneField && submissionData[formField] !== undefined) {
            const val = submissionData[formField];
            record[kintoneField] = { value: Array.isArray(val) ? val.join('\n') : String(val ?? '') };
          }
        }

        const kintoneUrl = `https://${fullForm.kintone_subdomain}.cybozu.com/k/v1/record.json`;
        const kRes = await fetch(kintoneUrl, {
          method: 'POST',
          headers: {
            'X-Cybozu-API-Token': fullForm.kintone_api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ app: fullForm.kintone_app_id, record }),
        });
        if (!kRes.ok) {
          const errText = await kRes.text().catch(() => '');
          console.error('kintone API error:', kRes.status, errText);
        }
      }
    } catch (kErr) {
      console.error('kintone integration error:', kErr);
    }

    return c.json({ success: true, data: serializeSubmission(submission) }, 201);
  } catch (err) {
    console.error('POST /api/forms/:id/submit error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/forms/:id/kintone-test — test kintone connection and get fields
forms.post('/api/forms/:id/kintone-test', async (c) => {
  try {
    const body = await c.req.json<{ subdomain: string; appId: string; apiToken: string }>();
    if (!body.subdomain || !body.appId || !body.apiToken) {
      return c.json({ success: false, error: 'subdomain, appId, apiToken are required' }, 400);
    }

    const url = `https://${body.subdomain}.cybozu.com/k/v1/app/form/fields.json?app=${body.appId}`;
    const res = await fetch(url, {
      headers: { 'X-Cybozu-API-Token': body.apiToken },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return c.json({ success: false, error: `kintone API error: ${res.status} ${errText}` }, 400);
    }

    const data = await res.json() as { properties: Record<string, { code: string; label: string; type: string }> };
    const fields = Object.values(data.properties).map((f) => ({
      code: f.code,
      label: f.label,
      type: f.type,
    }));

    return c.json({ success: true, data: fields });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// GET /api/forms/:id/submissions/csv — export submissions as CSV
forms.get('/api/forms/:id/submissions/csv', async (c) => {
  try {
    // Auth: Bearer header or ?token= query param
    const authHeader = c.req.header('Authorization');
    const queryToken = c.req.query('token');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
    if (!token || token !== c.env.API_KEY) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const form = await getFormById(c.env.DB, id);
    if (!form) return c.json({ success: false, error: 'Form not found' }, 404);

    const submissions = await getFormSubmissions(c.env.DB, id);
    const fields = JSON.parse(form.fields || '[]') as Array<{ name: string; label: string }>;

    // Build CSV
    const headers = ['name', 'date', ...fields.map((f) => f.label)];
    const rows = submissions.map((s) => {
      const data = JSON.parse(s.data || '{}') as Record<string, unknown>;
      return [
        (s as unknown as { friend_name?: string }).friend_name || '',
        s.created_at,
        ...fields.map((f) => {
          const val = data[f.name];
          return Array.isArray(val) ? val.join('; ') : String(val ?? '');
        }),
      ];
    });

    const csvLines = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ];
    const csv = '\uFEFF' + csvLines.join('\n'); // BOM for Excel

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${form.name}_submissions.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

export { forms };
