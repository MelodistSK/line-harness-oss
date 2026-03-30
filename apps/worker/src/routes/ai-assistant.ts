import { Hono } from 'hono';
import type { Env } from '../index.js';
import {
  getFriends, getFriendById, getFriendTags, addTagToFriend, removeTagFromFriend,
  getTags, createTag,
  getScenarios, getScenarioById, createScenario, createScenarioStep, enrollFriendInScenario,
  getBroadcasts, createBroadcast,
  getTemplates, createTemplate,
  getForms, getFormSubmissions,
  getAutomations, createAutomation,
  getScoringRules, createScoringRule,
  getOutgoingWebhooks, createOutgoingWebhook,
  getTrackedLinks, createTrackedLink,
  getQrCodes, createQrCode,
  getReminders, createReminder,
  getCalendarServices, createCalendarService, getCalendarBookings, updateCalendarBookingStatus,
  getAnalyticsSummary,
  getFriendCount,
} from '@line-crm/db';
import { LineClient } from '@line-crm/line-sdk';

export const aiAssistant = new Hono<Env>();

// ── Booking Flex generator (same logic as frontend) ──

function generateBookingFlex(workerUrl: string, serviceId?: string): string {
  const liffUrl = serviceId
    ? `${workerUrl}/liff/booking?serviceId=${serviceId}`
    : `${workerUrl}/liff/booking`;
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: 'ご予約はこちら', weight: 'bold', size: 'lg', wrap: true },
        { type: 'text', text: 'ご都合の良い日時をお選びください', color: '#666666', size: 'sm', wrap: true, margin: 'md' },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', contents: [
        { type: 'button', action: { type: 'uri', label: '予約する', uri: liffUrl }, style: 'primary', color: '#06C755' },
      ],
    },
  });
}

// ── Types ──

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolResults?: unknown[];
  confirmAction?: unknown;
}

interface ChatRequest {
  messages: ChatMessage[];
  confirmed?: boolean;
  pendingAction?: {
    toolName: string;
    toolInput: Record<string, unknown>;
  };
}

// ── Destructive tools that require confirmation ──

const DESTRUCTIVE_TOOLS = new Set([
  'send_message', 'create_broadcast',
  'create_tag', 'add_tag_to_friend', 'remove_tag_from_friend',
  'create_scenario', 'add_scenario_step', 'enroll_friend_in_scenario',
  'create_template', 'create_form',
  'create_automation', 'create_scoring_rule',
  'create_outgoing_webhook', 'create_tracked_link', 'create_qr_code',
  'create_reminder', 'create_calendar_service', 'cancel_booking',
  'update_friend_metadata',
  'create_rich_menu', 'link_rich_menu_to_user', 'set_default_rich_menu',
]);

// ── System prompt ──

const SYSTEM_PROMPT = `あなたはLINE CRM「My Hisho」の管理AIアシスタントです。
スタッフからの自然言語指示でCRMを操作します。
常に日本語で応答してください。
操作を実行する前に必ず内容を確認してください。
破壊的操作（配信送信、タグ変更、削除等）は必ず確認を取ってから実行してください。
データの閲覧・検索系の操作は確認なしで即実行してOKです。

重要なルール:
- ツールを使って取得した情報は正確にユーザーに伝えてください
- 友だちの名前で検索する場合はlist_friendsを使い、結果から該当者を探してください
- 一度に複数の操作が必要な場合は順番に実行してください
- 不明な点があればユーザーに確認してください
- 回答はマークダウン形式で見やすく整理してください`;

// ── Tool definitions for Claude API ──

function getToolDefinitions() {
  return [
    // 【友だち管理】
    {
      name: 'list_friends',
      description: '友だち一覧を取得します。検索やタグでフィルタできます。',
      input_schema: {
        type: 'object' as const,
        properties: {
          limit: { type: 'number', description: '取得件数（デフォルト50）' },
          offset: { type: 'number', description: 'オフセット' },
          tagId: { type: 'string', description: 'タグIDでフィルタ' },
        },
        required: [],
      },
    },
    {
      name: 'get_friend',
      description: '友だちの詳細を取得します（タグ・スコア・メタデータ含む）。',
      input_schema: {
        type: 'object' as const,
        properties: {
          friendId: { type: 'string', description: '友だちID' },
        },
        required: ['friendId'],
      },
    },
    {
      name: 'search_friends',
      description: '名前で友だちを検索します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: '検索キーワード（名前の部分一致）' },
          limit: { type: 'number', description: '取得件数（デフォルト20）' },
        },
        required: ['query'],
      },
    },
    {
      name: 'update_friend_metadata',
      description: '友だちのメタデータを更新します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          friendId: { type: 'string', description: '友だちID' },
          metadata: { type: 'object', description: '更新するメタデータ（キー:値）' },
        },
        required: ['friendId', 'metadata'],
      },
    },
    // 【タグ管理】
    {
      name: 'list_tags',
      description: 'タグ一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_tag',
      description: '新しいタグを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'タグ名' },
          color: { type: 'string', description: 'タグ色（例: #3B82F6）' },
        },
        required: ['name'],
      },
    },
    {
      name: 'add_tag_to_friend',
      description: '友だちにタグを付与します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          friendId: { type: 'string', description: '友だちID' },
          tagId: { type: 'string', description: 'タグID' },
        },
        required: ['friendId', 'tagId'],
      },
    },
    {
      name: 'remove_tag_from_friend',
      description: '友だちからタグを削除します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          friendId: { type: 'string', description: '友だちID' },
          tagId: { type: 'string', description: 'タグID' },
        },
        required: ['friendId', 'tagId'],
      },
    },
    // 【メッセージ送信】
    {
      name: 'send_message',
      description: '個別の友だちにメッセージを送信します。テキスト、画像、Flex等に対応。',
      input_schema: {
        type: 'object' as const,
        properties: {
          friendId: { type: 'string', description: '友だちID' },
          messageType: { type: 'string', description: 'メッセージ種別（text/image/flex/video）', enum: ['text', 'image', 'flex', 'video'] },
          content: { type: 'string', description: 'メッセージ内容（textの場合はテキスト、imageの場合はURL、flexの場合はJSON文字列）' },
        },
        required: ['friendId', 'messageType', 'content'],
      },
    },
    {
      name: 'create_broadcast',
      description: '一斉配信を作成します。即時送信または予約配信が可能。',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: '配信タイトル' },
          messageType: { type: 'string', description: 'メッセージ種別', enum: ['text', 'image', 'flex', 'carousel', 'video'] },
          messageContent: { type: 'string', description: 'メッセージ内容' },
          targetType: { type: 'string', description: '配信対象', enum: ['all', 'tag'] },
          targetTagId: { type: 'string', description: '対象タグID（targetType=tagの場合）' },
          scheduledAt: { type: 'string', description: '予約配信日時（ISO 8601形式、省略で即時）' },
          status: { type: 'string', description: 'ステータス', enum: ['draft', 'scheduled'] },
        },
        required: ['title', 'messageType', 'messageContent', 'targetType'],
      },
    },
    {
      name: 'list_broadcasts',
      description: '配信一覧・ステータスを確認します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    // 【シナリオ管理】
    {
      name: 'list_scenarios',
      description: 'シナリオ一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_scenario',
      description: '新しいシナリオを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'シナリオ名' },
          description: { type: 'string', description: '説明' },
          triggerType: { type: 'string', description: 'トリガー種別', enum: ['friend_add', 'tag_added', 'manual'] },
          triggerTagId: { type: 'string', description: 'トリガータグID（tag_addedの場合）' },
        },
        required: ['name', 'triggerType'],
      },
    },
    {
      name: 'add_scenario_step',
      description: 'シナリオにステップを追加します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          scenarioId: { type: 'string', description: 'シナリオID' },
          stepOrder: { type: 'number', description: 'ステップ順序' },
          delayMinutes: { type: 'number', description: '遅延時間（分）' },
          messageType: { type: 'string', description: 'メッセージ種別（bookingは自動でflexに変換）', enum: ['text', 'image', 'flex', 'carousel', 'video', 'rich_menu', 'form', 'booking'] },
          messageContent: { type: 'string', description: 'メッセージ内容（booking時は省略可、自動生成）' },
          serviceId: { type: 'string', description: '予約サービスID（booking時のオプション）' },
        },
        required: ['scenarioId', 'stepOrder', 'messageType'],
      },
    },
    {
      name: 'enroll_friend_in_scenario',
      description: '友だちをシナリオに登録します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          friendId: { type: 'string', description: '友だちID' },
          scenarioId: { type: 'string', description: 'シナリオID' },
        },
        required: ['friendId', 'scenarioId'],
      },
    },
    // 【テンプレート管理】
    {
      name: 'list_templates',
      description: 'テンプレート一覧を取得します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          category: { type: 'string', description: 'カテゴリでフィルタ' },
        },
        required: [],
      },
    },
    {
      name: 'create_template',
      description: 'テンプレートを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'テンプレート名' },
          category: { type: 'string', description: 'カテゴリ' },
          messageType: { type: 'string', description: 'メッセージ種別', enum: ['text', 'image', 'flex'] },
          messageContent: { type: 'string', description: 'メッセージ内容' },
        },
        required: ['name', 'messageType', 'messageContent'],
      },
    },
    // 【フォーム管理】
    {
      name: 'list_forms',
      description: 'フォーム一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'get_form_submissions',
      description: 'フォームの回答一覧を取得します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          formId: { type: 'string', description: 'フォームID' },
        },
        required: ['formId'],
      },
    },
    // 【リッチメニュー管理】
    {
      name: 'list_rich_menus',
      description: 'リッチメニュー一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    // 【カレンダー予約】
    {
      name: 'list_calendar_services',
      description: '予約サービス一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_calendar_service',
      description: '予約サービスを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'サービス名' },
          description: { type: 'string', description: '説明' },
          durationMinutes: { type: 'number', description: '所要時間（分）' },
        },
        required: ['name'],
      },
    },
    {
      name: 'list_bookings',
      description: '予約一覧を取得します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          serviceId: { type: 'string', description: 'サービスIDでフィルタ' },
          status: { type: 'string', description: 'ステータスでフィルタ' },
        },
        required: [],
      },
    },
    {
      name: 'cancel_booking',
      description: '予約をキャンセルします。',
      input_schema: {
        type: 'object' as const,
        properties: {
          bookingId: { type: 'string', description: '予約ID' },
        },
        required: ['bookingId'],
      },
    },
    // 【スコアリング】
    {
      name: 'list_scoring_rules',
      description: 'スコアリングルール一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_scoring_rule',
      description: 'スコアリングルールを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'ルール名' },
          eventType: { type: 'string', description: 'イベント種別' },
          scoreValue: { type: 'number', description: 'スコア値' },
        },
        required: ['name', 'eventType', 'scoreValue'],
      },
    },
    // 【オートメーション】
    {
      name: 'list_automations',
      description: 'オートメーションルール一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_automation',
      description: 'オートメーションルールを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'ルール名' },
          description: { type: 'string', description: '説明' },
          eventType: { type: 'string', description: 'トリガーイベント種別' },
          conditions: { type: 'object', description: '条件（オプション）' },
          actions: {
            type: 'array',
            description: 'アクション配列',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', description: 'アクション種別（add_tag/remove_tag/start_scenario/send_message/send_webhook/switch_rich_menu/update_metadata）' },
                value: { type: 'string', description: 'アクション値' },
              },
            },
          },
          priority: { type: 'number', description: '優先度' },
        },
        required: ['name', 'eventType', 'actions'],
      },
    },
    // 【Webhook管理】
    {
      name: 'list_outgoing_webhooks',
      description: '送信Webhook一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_outgoing_webhook',
      description: '送信Webhookを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Webhook名' },
          url: { type: 'string', description: '送信先URL' },
          eventTypes: { type: 'array', description: 'トリガーイベント種別の配列', items: { type: 'string' } },
          secret: { type: 'string', description: '署名シークレット（オプション）' },
        },
        required: ['name', 'url', 'eventTypes'],
      },
    },
    // 【トラッキング・分析】
    {
      name: 'list_tracked_links',
      description: 'トラッキングリンク一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_tracked_link',
      description: 'トラッキングリンクを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'リンク名' },
          originalUrl: { type: 'string', description: '元URL' },
          tagId: { type: 'string', description: 'クリック時付与タグID' },
          scenarioId: { type: 'string', description: 'クリック時開始シナリオID' },
        },
        required: ['name', 'originalUrl'],
      },
    },
    {
      name: 'list_qr_codes',
      description: 'QRコード一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_qr_code',
      description: 'QRコードを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'QRコード名' },
          refCode: { type: 'string', description: '参照コード（ユニーク）' },
        },
        required: ['name', 'refCode'],
      },
    },
    {
      name: 'get_analytics',
      description: '流入分析サマリーを取得します（総友だち数・今月追加・流入経路数等）。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    // 【リマインダー】
    {
      name: 'list_reminders',
      description: 'リマインダー一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'create_reminder',
      description: 'リマインダーを作成します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'リマインダー名' },
          description: { type: 'string', description: '説明' },
        },
        required: ['name'],
      },
    },
    // 【メディア】
    {
      name: 'list_media',
      description: 'メディアファイル一覧を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
      name: 'get_media_url',
      description: 'メディアファイルの公開URLを取得します。',
      input_schema: {
        type: 'object' as const,
        properties: {
          filename: { type: 'string', description: 'ファイル名' },
        },
        required: ['filename'],
      },
    },
    {
      name: 'get_friend_count',
      description: '友だちの総数を取得します。',
      input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
  ];
}

// ── Tool executor ──

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  db: D1Database,
  env: Env['Bindings'],
): Promise<unknown> {
  switch (toolName) {
    // 友だち管理
    case 'list_friends': {
      const friends = await getFriends(db, {
        limit: (toolInput.limit as number) || 50,
        offset: (toolInput.offset as number) || 0,
        tagId: toolInput.tagId as string | undefined,
      });
      // Attach tags for each friend
      const results = await Promise.all(
        friends.map(async (f) => {
          const tags = await getFriendTags(db, f.id);
          return {
            id: f.id,
            displayName: f.display_name,
            lineUserId: f.line_user_id,
            isFollowing: !!f.is_following,
            score: f.score,
            metadata: f.metadata ? JSON.parse(f.metadata) : {},
            tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
            createdAt: f.created_at,
          };
        }),
      );
      return { friends: results, count: results.length };
    }

    case 'get_friend': {
      const friend = await getFriendById(db, toolInput.friendId as string);
      if (!friend) return { error: '友だちが見つかりません' };
      const tags = await getFriendTags(db, friend.id);
      return {
        id: friend.id,
        displayName: friend.display_name,
        lineUserId: friend.line_user_id,
        isFollowing: !!friend.is_following,
        score: friend.score,
        metadata: friend.metadata ? JSON.parse(friend.metadata) : {},
        tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
        createdAt: friend.created_at,
      };
    }

    case 'search_friends': {
      const query = (toolInput.query as string).toLowerCase();
      const limit = (toolInput.limit as number) || 20;
      // D1 doesn't have great LIKE performance, but it works
      const result = await db
        .prepare(`SELECT * FROM friends WHERE LOWER(display_name) LIKE ? ORDER BY created_at DESC LIMIT ?`)
        .bind(`%${query}%`, limit)
        .all();
      const friends = result.results as unknown[];
      const results = await Promise.all(
        (friends as Array<{ id: string; display_name: string; line_user_id: string; is_following: number; score: number; metadata: string; created_at: string }>).map(async (f) => {
          const tags = await getFriendTags(db, f.id);
          return {
            id: f.id,
            displayName: f.display_name,
            lineUserId: f.line_user_id,
            isFollowing: !!f.is_following,
            score: f.score,
            metadata: f.metadata ? JSON.parse(f.metadata) : {},
            tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
            createdAt: f.created_at,
          };
        }),
      );
      return { friends: results, count: results.length };
    }

    case 'update_friend_metadata': {
      const friend = await getFriendById(db, toolInput.friendId as string);
      if (!friend) return { error: '友だちが見つかりません' };
      const existing = friend.metadata ? JSON.parse(friend.metadata) : {};
      const merged = { ...existing, ...(toolInput.metadata as Record<string, unknown>) };
      await db
        .prepare(`UPDATE friends SET metadata = ?, updated_at = datetime('now', '+9 hours') WHERE id = ?`)
        .bind(JSON.stringify(merged), friend.id)
        .run();
      return { success: true, metadata: merged };
    }

    // タグ管理
    case 'list_tags': {
      const tags = await getTags(db);
      return tags.map((t) => ({ id: t.id, name: t.name, color: t.color, createdAt: t.created_at }));
    }

    case 'create_tag': {
      const tag = await createTag(db, {
        name: toolInput.name as string,
        color: (toolInput.color as string) || '#3B82F6',
      });
      return { id: tag.id, name: tag.name, color: tag.color };
    }

    case 'add_tag_to_friend': {
      await addTagToFriend(db, toolInput.friendId as string, toolInput.tagId as string);
      return { success: true };
    }

    case 'remove_tag_from_friend': {
      await removeTagFromFriend(db, toolInput.friendId as string, toolInput.tagId as string);
      return { success: true };
    }

    // メッセージ送信
    case 'send_message': {
      const friend = await getFriendById(db, toolInput.friendId as string);
      if (!friend) return { error: '友だちが見つかりません' };
      const lineClient = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
      let msgType = toolInput.messageType as string;
      let content = toolInput.content as string;
      // booking → flex変換
      if (msgType === 'booking') {
        msgType = 'flex';
        const workerUrl = env.WORKER_URL || '';
        content = generateBookingFlex(workerUrl);
      }
      let messages: unknown[];
      if (msgType === 'text') {
        messages = [{ type: 'text', text: content }];
      } else if (msgType === 'image') {
        messages = [{ type: 'image', originalContentUrl: content, previewImageUrl: content }];
      } else if (msgType === 'flex') {
        messages = [{ type: 'flex', altText: 'Flexメッセージ', contents: JSON.parse(content) }];
      } else if (msgType === 'video') {
        messages = [{ type: 'video', originalContentUrl: content, previewImageUrl: content }];
      } else {
        messages = [{ type: 'text', text: content }];
      }
      await lineClient.pushMessage(friend.line_user_id, messages);
      return { success: true, sentTo: friend.display_name };
    }

    case 'create_broadcast': {
      let bcMsgType = toolInput.messageType as string;
      let bcMsgContent = toolInput.messageContent as string;
      if (bcMsgType === 'booking') {
        bcMsgType = 'flex';
        bcMsgContent = generateBookingFlex(env.WORKER_URL || '');
      }
      if (bcMsgType === 'form') bcMsgType = 'flex';
      const broadcast = await createBroadcast(db, {
        title: toolInput.title as string,
        messageType: bcMsgType as 'text' | 'image' | 'flex' | 'carousel' | 'video',
        messageContent: bcMsgContent,
        targetType: toolInput.targetType as 'all' | 'tag',
        targetTagId: toolInput.targetTagId as string | undefined,
        scheduledAt: toolInput.scheduledAt as string | undefined,
      });
      // Set status if specified
      if (toolInput.status === 'scheduled' && toolInput.scheduledAt) {
        await db.prepare(`UPDATE broadcasts SET status = 'scheduled' WHERE id = ?`).bind(broadcast.id).run();
      }
      return { id: broadcast.id, title: broadcast.title, status: toolInput.status || 'draft' };
    }

    case 'list_broadcasts': {
      const broadcasts = await getBroadcasts(db);
      return broadcasts.map((b) => ({
        id: b.id,
        title: b.title,
        messageType: b.message_type,
        targetType: b.target_type,
        status: b.status,
        scheduledAt: b.scheduled_at,
        createdAt: b.created_at,
      }));
    }

    // シナリオ管理
    case 'list_scenarios': {
      const scenarios = await getScenarios(db);
      return scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        triggerType: s.trigger_type,
        isActive: !!s.is_active,
        stepCount: s.step_count,
        createdAt: s.created_at,
      }));
    }

    case 'create_scenario': {
      const scenario = await createScenario(db, {
        name: toolInput.name as string,
        description: toolInput.description as string | undefined,
        triggerType: toolInput.triggerType as 'friend_add' | 'tag_added' | 'manual',
        triggerTagId: toolInput.triggerTagId as string | undefined,
      });
      return { id: scenario.id, name: scenario.name };
    }

    case 'add_scenario_step': {
      let msgType = toolInput.messageType as string;
      let msgContent = toolInput.messageContent as string;
      // booking → flex変換（DBにはflexとして保存）
      if (msgType === 'booking') {
        msgType = 'flex';
        const workerUrl = env.WORKER_URL || '';
        const serviceId = toolInput.serviceId as string | undefined;
        msgContent = generateBookingFlex(workerUrl, serviceId);
      }
      // form → flex変換
      if (msgType === 'form') {
        msgType = 'flex';
      }
      const step = await createScenarioStep(db, {
        scenarioId: toolInput.scenarioId as string,
        stepOrder: toolInput.stepOrder as number,
        delayMinutes: (toolInput.delayMinutes as number) || 0,
        messageType: msgType,
        messageContent: msgContent,
      });
      return { id: step.id, stepOrder: step.step_order };
    }

    case 'enroll_friend_in_scenario': {
      const enrollment = await enrollFriendInScenario(
        db,
        toolInput.friendId as string,
        toolInput.scenarioId as string,
      );
      return { id: enrollment.id, status: enrollment.status };
    }

    // テンプレート
    case 'list_templates': {
      const templates = await getTemplates(db, toolInput.category as string | undefined);
      return templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        messageType: t.message_type,
        createdAt: t.created_at,
      }));
    }

    case 'create_template': {
      const template = await createTemplate(db, {
        name: toolInput.name as string,
        category: (toolInput.category as string) || 'general',
        messageType: toolInput.messageType as string,
        messageContent: toolInput.messageContent as string,
      });
      return { id: template.id, name: template.name };
    }

    // フォーム
    case 'list_forms': {
      const result = await db.prepare(`SELECT id, name, description, is_active, submit_count, created_at FROM forms ORDER BY created_at DESC`).all();
      return (result.results as Array<{ id: string; name: string; description: string | null; is_active: number; submit_count: number; created_at: string }>).map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        isActive: !!f.is_active,
        submitCount: f.submit_count,
        createdAt: f.created_at,
      }));
    }

    case 'get_form_submissions': {
      const submissions = await getFormSubmissions(db, toolInput.formId as string);
      return submissions.map((s) => ({
        id: s.id,
        formId: s.form_id,
        friendId: s.friend_id,
        data: s.data ? JSON.parse(s.data) : {},
        createdAt: s.created_at,
      }));
    }

    // リッチメニュー（LINE API経由）
    case 'list_rich_menus': {
      const lineClient = new LineClient(env.LINE_CHANNEL_ACCESS_TOKEN);
      const result = await lineClient.getRichMenuList();
      const menus = (result as { richmenus?: Array<{ richMenuId: string; name: string; chatBarText: string; selected: boolean }> }).richmenus ?? [];
      return menus.map((m) => ({
        richMenuId: m.richMenuId,
        name: m.name,
        chatBarText: m.chatBarText,
        selected: m.selected,
      }));
    }

    // カレンダー予約
    case 'list_calendar_services': {
      const services = await getCalendarServices(db);
      return services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMinutes: s.duration,
        isActive: !!s.is_active,
      }));
    }

    case 'create_calendar_service': {
      const service = await createCalendarService(db, {
        name: toolInput.name as string,
        description: (toolInput.description as string) || null,
        duration: (toolInput.durationMinutes as number) || 60,
      });
      return { id: service.id, name: service.name };
    }

    case 'list_bookings': {
      const bookings = await getCalendarBookings(db, {
        connectionId: toolInput.serviceId as string | undefined,
        friendId: undefined,
      });
      return bookings.map((b) => ({
        id: b.id,
        title: b.title,
        startAt: b.start_at,
        endAt: b.end_at,
        status: b.status,
        friendId: b.friend_id,
        serviceId: b.service_id,
      }));
    }

    case 'cancel_booking': {
      await updateCalendarBookingStatus(db, toolInput.bookingId as string, 'cancelled');
      return { success: true };
    }

    // スコアリング
    case 'list_scoring_rules': {
      const rules = await getScoringRules(db);
      return rules.map((r) => ({
        id: r.id,
        name: r.name,
        eventType: r.event_type,
        scoreValue: r.score_value,
        isActive: !!r.is_active,
      }));
    }

    case 'create_scoring_rule': {
      const rule = await createScoringRule(db, {
        name: toolInput.name as string,
        eventType: toolInput.eventType as string,
        scoreValue: toolInput.scoreValue as number,
      });
      return { id: rule.id, name: rule.name };
    }

    // オートメーション
    case 'list_automations': {
      const automations = await getAutomations(db);
      return automations.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        eventType: a.event_type,
        isActive: !!a.is_active,
        priority: a.priority,
      }));
    }

    case 'create_automation': {
      const automation = await createAutomation(db, {
        name: toolInput.name as string,
        description: toolInput.description as string | undefined,
        eventType: toolInput.eventType as string,
        conditions: toolInput.conditions as Record<string, unknown> | undefined,
        actions: toolInput.actions as unknown[],
        priority: toolInput.priority as number | undefined,
      });
      return { id: automation.id, name: automation.name };
    }

    // Webhook
    case 'list_outgoing_webhooks': {
      const webhooks = await getOutgoingWebhooks(db);
      return webhooks.map((w) => ({
        id: w.id,
        name: w.name,
        url: w.url,
        eventTypes: w.event_types ? JSON.parse(w.event_types) : [],
        isActive: !!w.is_active,
      }));
    }

    case 'create_outgoing_webhook': {
      const webhook = await createOutgoingWebhook(db, {
        name: toolInput.name as string,
        url: toolInput.url as string,
        eventTypes: toolInput.eventTypes as string[],
        secret: toolInput.secret as string | undefined,
      });
      return { id: webhook.id, name: webhook.name };
    }

    // トラッキング
    case 'list_tracked_links': {
      const links = await getTrackedLinks(db);
      return links.map((l) => ({
        id: l.id,
        name: l.name,
        originalUrl: l.original_url,
        shortCode: l.short_code,
        clickCount: l.click_count,
      }));
    }

    case 'create_tracked_link': {
      const link = await createTrackedLink(db, {
        name: toolInput.name as string,
        originalUrl: toolInput.originalUrl as string,
        tagId: toolInput.tagId as string | undefined,
        scenarioId: toolInput.scenarioId as string | undefined,
      });
      return { id: link.id, name: link.name, shortCode: link.short_code };
    }

    case 'list_qr_codes': {
      const codes = await getQrCodes(db);
      return codes.map((q) => ({
        id: q.id,
        name: q.name,
        refCode: q.ref_code,
        scanCount: q.scan_count,
        friendCount: q.friend_count,
      }));
    }

    case 'create_qr_code': {
      const code = await createQrCode(db, {
        name: toolInput.name as string,
        refCode: toolInput.refCode as string,
      });
      return { id: code.id, name: code.name, refCode: code.ref_code };
    }

    case 'get_analytics': {
      const summary = await getAnalyticsSummary(db);
      return summary;
    }

    // リマインダー
    case 'list_reminders': {
      const reminders = await getReminders(db);
      return reminders.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isActive: !!r.is_active,
      }));
    }

    case 'create_reminder': {
      const reminder = await createReminder(db, {
        name: toolInput.name as string,
        description: toolInput.description as string | undefined,
      });
      return { id: reminder.id, name: reminder.name };
    }

    // メディア
    case 'list_media': {
      const list = await env.ASSETS.list({ limit: 100 });
      return list.objects.map((o) => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded,
      }));
    }

    case 'get_media_url': {
      const workerUrl = env.WORKER_URL || '';
      return { url: `${workerUrl}/assets/${toolInput.filename}` };
    }

    case 'get_friend_count': {
      const count = await getFriendCount(db);
      return { count };
    }

    default:
      return { error: `未対応のツール: ${toolName}` };
  }
}

// ── Main chat endpoint ──

aiAssistant.post('/api/ai-assistant/chat', async (c) => {
  const anthropicApiKey = (c.env as Record<string, string>).ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return c.json({ success: false, error: 'ANTHROPIC_API_KEY is not configured' }, 500);
  }

  const body = await c.req.json<ChatRequest>();
  const { messages, confirmed, pendingAction } = body;

  // If confirmed=true and there's a pending action, execute it directly
  if (confirmed && pendingAction) {
    try {
      const result = await executeTool(pendingAction.toolName, pendingAction.toolInput, c.env.DB, c.env);
      return c.json({
        success: true,
        data: {
          role: 'assistant',
          content: `実行完了しました。\n\n結果:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
          confirmAction: null,
        },
      });
    } catch (err) {
      return c.json({
        success: true,
        data: {
          role: 'assistant',
          content: `実行中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`,
          confirmAction: null,
        },
      });
    }
  }

  // Build messages for Claude API
  const claudeMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Track cumulative usage across tool loop
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCalls = 0;
  const userMessage = messages.filter((m) => m.role === 'user').pop()?.content || '';

  try {
    // Call Claude API with tools
    let response = await callClaudeAPI(anthropicApiKey, claudeMessages, getToolDefinitions());
    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;

    // Process tool calls in a loop
    let iterations = 0;
    const maxIterations = 10;

    while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
      iterations++;

      const toolUseBlocks = response.content.filter(
        (block: { type: string }) => block.type === 'tool_use',
      ) as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>;

      if (toolUseBlocks.length === 0) break;
      totalToolCalls += toolUseBlocks.length;

      // Check if any tool is destructive and needs confirmation
      const destructiveTools = toolUseBlocks.filter((t) => DESTRUCTIVE_TOOLS.has(t.name));

      if (destructiveTools.length > 0 && !confirmed) {
        const textBlocks = response.content.filter(
          (block: { type: string }) => block.type === 'text',
        ) as Array<{ type: 'text'; text: string }>;
        const responseText = textBlocks.map((b) => b.text).join('\n');

        // Log usage even for confirmation pauses
        const ctx = c.executionCtx as ExecutionContext;
        ctx.waitUntil(logUsage(c.env.DB, totalInputTokens, totalOutputTokens, totalToolCalls, userMessage));

        return c.json({
          success: true,
          data: {
            role: 'assistant',
            content: responseText || '以下の操作を実行します。よろしいですか？',
            confirmAction: {
              toolName: destructiveTools[0].name,
              toolInput: destructiveTools[0].input,
              description: describeToolAction(destructiveTools[0].name, destructiveTools[0].input),
            },
          },
        });
      }

      // Execute all tool calls
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (tool) => {
          try {
            const result = await executeTool(tool.name, tool.input, c.env.DB, c.env);
            return {
              type: 'tool_result' as const,
              tool_use_id: tool.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: 'tool_result' as const,
              tool_use_id: tool.id,
              content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
              is_error: true,
            };
          }
        }),
      );

      // Continue conversation with tool results
      const updatedMessages = [
        ...claudeMessages,
        { role: 'assistant' as const, content: response.content },
        ...toolResults.map((tr) => ({
          role: 'user' as const,
          content: [tr],
        })),
      ];

      response = await callClaudeAPI(anthropicApiKey, updatedMessages, getToolDefinitions());
      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;
    }

    // Log usage asynchronously
    const ctx = c.executionCtx as ExecutionContext;
    ctx.waitUntil(logUsage(c.env.DB, totalInputTokens, totalOutputTokens, totalToolCalls, userMessage));

    // Extract final text response
    const textBlocks = response.content.filter(
      (block: { type: string }) => block.type === 'text',
    ) as Array<{ type: 'text'; text: string }>;
    const finalText = textBlocks.map((b) => b.text).join('\n');

    return c.json({
      success: true,
      data: {
        role: 'assistant',
        content: finalText || '処理が完了しました。',
        confirmAction: null,
      },
    });
  } catch (err) {
    console.error('AI Assistant error:', err);
    // Log partial usage even on error
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      const ctx = c.executionCtx as ExecutionContext;
      ctx.waitUntil(logUsage(c.env.DB, totalInputTokens, totalOutputTokens, totalToolCalls, userMessage));
    }
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : 'AI処理中にエラーが発生しました',
    }, 500);
  }
});

// ── Claude API caller ──

interface ClaudeResponse {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  stop_reason: string;
  usage?: { input_tokens: number; output_tokens: number };
}

async function callClaudeAPI(
  apiKey: string,
  messages: unknown[],
  tools: unknown[],
): Promise<ClaudeResponse> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      tools,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<ClaudeResponse>;
}

// ── Usage logging ──

const SONNET_INPUT_COST_PER_TOKEN = 3 / 1_000_000;   // $3/1M tokens
const SONNET_OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;  // $15/1M tokens

async function logUsage(
  db: D1Database,
  inputTokens: number,
  outputTokens: number,
  toolCallCount: number,
  userMessage: string,
) {
  const totalTokens = inputTokens + outputTokens;
  const estimatedCost = inputTokens * SONNET_INPUT_COST_PER_TOKEN + outputTokens * SONNET_OUTPUT_COST_PER_TOKEN;
  const id = crypto.randomUUID();
  const truncatedMessage = userMessage.substring(0, 100);
  await db.prepare(
    `INSERT INTO ai_usage_logs (id, input_tokens, output_tokens, total_tokens, estimated_cost_usd, model, tool_calls, user_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+9 hours'))`,
  ).bind(id, inputTokens, outputTokens, totalTokens, estimatedCost, 'claude-sonnet-4-20250514', toolCallCount, truncatedMessage).run();
}

// ── Usage API endpoints ──

// GET /api/ai-assistant/usage?period=month|daily&from=&to=
aiAssistant.get('/api/ai-assistant/usage', async (c) => {
  const period = c.req.query('period') || 'month';
  const db = c.env.DB;

  if (period === 'daily') {
    const from = c.req.query('from') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = c.req.query('to') || new Date().toISOString().slice(0, 10);
    const result = await db.prepare(
      `SELECT
        date(created_at) as date,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(estimated_cost_usd) as estimated_cost_usd,
        COUNT(*) as request_count,
        SUM(tool_calls) as tool_calls
       FROM ai_usage_logs
       WHERE date(created_at) >= ? AND date(created_at) <= ?
       GROUP BY date(created_at)
       ORDER BY date(created_at) ASC`,
    ).bind(from, to).all();
    return c.json({ success: true, data: result.results });
  }

  // period=month (default): monthly aggregation
  const result = await db.prepare(
    `SELECT
      strftime('%Y-%m', created_at) as month,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(estimated_cost_usd) as estimated_cost_usd,
      COUNT(*) as request_count,
      SUM(tool_calls) as tool_calls
     FROM ai_usage_logs
     GROUP BY strftime('%Y-%m', created_at)
     ORDER BY month DESC
     LIMIT 12`,
  ).all();
  return c.json({ success: true, data: result.results });
});

// GET /api/ai-assistant/usage/logs?limit=&offset=
aiAssistant.get('/api/ai-assistant/usage/logs', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const db = c.env.DB;

  const result = await db.prepare(
    `SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  ).bind(limit, offset).all();

  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM ai_usage_logs`).first<{ total: number }>();

  return c.json({
    success: true,
    data: {
      logs: result.results,
      total: countResult?.total || 0,
    },
  });
});

// ── Describe tool action for confirmation ──

function describeToolAction(toolName: string, input: Record<string, unknown>): string {
  const descriptions: Record<string, (input: Record<string, unknown>) => string> = {
    send_message: (i) => `友だち(${i.friendId})に${i.messageType}メッセージを送信`,
    create_broadcast: (i) => `「${i.title}」を${i.targetType === 'all' ? '全員' : 'タグ指定'}に配信`,
    create_tag: (i) => `タグ「${i.name}」を作成`,
    add_tag_to_friend: (i) => `友だち(${i.friendId})にタグ(${i.tagId})を付与`,
    remove_tag_from_friend: (i) => `友だち(${i.friendId})からタグ(${i.tagId})を削除`,
    create_scenario: (i) => `シナリオ「${i.name}」を作成`,
    add_scenario_step: (i) => `シナリオにステップを追加`,
    enroll_friend_in_scenario: (i) => `友だちをシナリオに登録`,
    create_template: (i) => `テンプレート「${i.name}」を作成`,
    create_automation: (i) => `オートメーション「${i.name}」を作成`,
    create_scoring_rule: (i) => `スコアリングルール「${i.name}」を作成`,
    create_outgoing_webhook: (i) => `Webhook「${i.name}」を作成`,
    create_tracked_link: (i) => `トラッキングリンク「${i.name}」を作成`,
    create_qr_code: (i) => `QRコード「${i.name}」を作成`,
    create_reminder: (i) => `リマインダー「${i.name}」を作成`,
    create_calendar_service: (i) => `予約サービス「${i.name}」を作成`,
    cancel_booking: (i) => `予約(${i.bookingId})をキャンセル`,
    update_friend_metadata: (i) => `友だち(${i.friendId})のメタデータを更新`,
  };
  const fn = descriptions[toolName];
  return fn ? fn(input) : `${toolName}を実行`;
}
