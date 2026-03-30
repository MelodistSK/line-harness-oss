# LINE Harness OSS - リファレンス詳細

> CLAUDE.md から分離した詳細データ。環境変数の値、デプロイURL、テーブル一覧、トラブルシューティング等。

---

## デプロイ情報

### Vercel（Next.js ダッシュボード）
- **プロジェクト**: `onlinesecretary/line-harness-oss`
- **本番URL**: `https://line-harness-oss-teal.vercel.app`
- **ビルドコマンド**: `pnpm --filter @line-crm/shared build && pnpm --filter web build`
- **出力ディレクトリ**: `apps/web/out`
- **注意**: `packages/shared/dist/` は gitignore対象のため、Vercel CI でビルド時に再生成必須 → `vercel.json` の `buildCommand` で対応済み

### Cloudflare Workers（バックエンド）
- **Worker名**: `line-harness-mamayoro`
- **本番URL**: `https://line-harness-mamayoro.s-kamiya.workers.dev`
- **アカウントID**: `f00cff121653deb09e6d20bbfca5349a`
- **D1 DB**: `line-crm` (ID: `df15a84f-3aa0-4257-823a-524d308cf98a`)
- **R2**: `line-harness-assets`（バインディング: `ASSETS`、メディアストレージ）
- **KV**: `ASSETS_KV` (ID: `86808b1b6a0a4d45be74d2e1df497f88`、LIFF配信 + レガシーアセット)
- **Cron**: `*/5 * * * *`（5分ごとにステップ配信・予約配信・リマインダ実行）

### LIFF
- **LIFF ID**: `2009615537-8qwrEnEt`
- **エンドポイントURL**: `https://line-harness-mamayoro.s-kamiya.workers.dev/liff`
- **配信方式**: WorkerのKVストアから配信（`/liff` → `liff-index.html`、`/assets/liff.js`）
- **フォームURL形式**: `https://liff.line.me/2009615537-8qwrEnEt?page=form&id={FORM_ID}`
- **予約URL形式**: `https://line-harness-mamayoro.s-kamiya.workers.dev/liff/booking`（Worker直接配信）
- **注意**: 予約ページは `/liff/booking` で独立配信（`liff-pages.ts`）。`liff.line.me` 経由は `liff.state` 変換でルーティング不安定のためWorker URLを直接使用。

---

## 環境変数一覧

### Cloudflare Workers（wrangler secrets + vars）

| 変数名 | 種別 | 説明 |
|--------|------|------|
| `LINE_CHANNEL_SECRET` | Secret | LINE Messaging API チャネルシークレット |
| `LINE_CHANNEL_ACCESS_TOKEN` | Secret | LINE Messaging API アクセストークン |
| `LINE_CHANNEL_ID` | Secret | LINE Messaging API チャネルID |
| `LINE_LOGIN_CHANNEL_ID` | Secret | LINE Login チャネルID |
| `LINE_LOGIN_CHANNEL_SECRET` | Secret | LINE Login チャネルシークレット |
| `API_KEY` | Secret | 管理API認証キー（32文字以上推奨） |
| `ALLOWED_ORIGINS` | Secret | CORS許可オリジン（カンマ区切り） |
| `LIFF_URL` | Secret | LIFFアプリURL（`https://liff.line.me/2009615537-8qwrEnEt`） |
| `WORKER_URL` | Var | Workerの公開URL |
| `X_HARNESS_URL` | Secret | X Harness API URL（省略可） |
| `ANTHROPIC_API_KEY` | Secret | Anthropic APIキー（AIアシスタント機能用） |
| `DB` | Binding | D1 データベース |
| `ASSETS` | Binding | R2 メディアストレージ |
| `ASSETS_KV` | Binding | KV（LIFF配信 + レガシーアセット） |

```bash
# シークレット設定方法
wrangler secret put LINE_CHANNEL_SECRET
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put API_KEY
wrangler secret put ALLOWED_ORIGINS
wrangler secret put LIFF_URL
wrangler secret put ANTHROPIC_API_KEY
```

### Next.js ダッシュボード（Vercel環境変数）

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_API_URL` | Worker API エンドポイント |
| `NEXT_PUBLIC_API_KEY` | 管理API認証キー（Worker の `API_KEY` と同じ値） |
| `NEXT_PUBLIC_LIFF_ID` | LIFF アプリID（`2009615537-8qwrEnEt`） |

> **重要**: `printf "value" | npx vercel env add KEY production` を使うこと。`echo` は末尾改行が入りバグの原因になる。

### LIFF アプリ（`apps/liff/.env`、gitignore対象）

```
VITE_API_URL=https://line-harness-mamayoro.s-kamiya.workers.dev
VITE_LIFF_ID=2009615537-8qwrEnEt
VITE_BOT_BASIC_ID=@xxxxxx
VITE_CALENDAR_CONNECTION_ID=xxxx
```

### ローカル開発（`apps/worker/.dev.vars`）

```
LINE_CHANNEL_SECRET=xxxxx
LINE_CHANNEL_ACCESS_TOKEN=xxxxx
API_KEY=your-secret-key
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
LIFF_URL=https://liff.line.me/2009615537-8qwrEnEt
WORKER_URL=http://localhost:8787
```

---

## データベーステーブル一覧（D1 全46テーブル）

```
# 友だち管理
friends, tags, friend_tags

# シナリオ配信
scenarios, scenario_steps, friend_scenarios

# 配信・メッセージ
broadcasts, messages_log, auto_replies, templates

# ユーザー・アカウント管理
admin_users, users, line_accounts, operators

# コンバージョン・アフィリエイト
conversion_points, conversion_events, affiliates, affiliate_clicks

# Google Calendar
google_calendar_connections, calendar_bookings, calendar_settings, calendar_services
booking_reminders, booking_reminder_logs

# 決済
stripe_events

# Webhook
incoming_webhooks, outgoing_webhooks

# リマインダ
reminders, reminder_steps, friend_reminders, friend_reminder_deliveries

# スコアリング
scoring_rules, friend_scores

# 広告・トラッキング
ad_platforms, ad_conversion_logs, tracked_links, qr_codes

# オペレーション
chats, notification_rules, notifications, automations, automation_logs
account_health_logs, account_migrations

# リッチメニュー
rich_menus, rich_menu_mappings

# フォーム
forms, form_submissions

# AIアシスタント
ai_usage_logs
```

---

## イベントバス全イベント種別

| イベント | 発火タイミング |
|----------|----------------|
| `friend_add` | 友だち追加時 |
| `tag_added` | タグ付与時 |
| `tag_removed` | タグ削除時 |
| `message_received` | メッセージ受信時 |
| `form_submitted` | フォーム送信時 |
| `broadcast_sent` | 一斉配信完了時 |
| `scenario_started` | シナリオ開始時 |
| `scenario_completed` | シナリオ完了時 |
| `cv_fire` | コンバージョン発生時 |
| `score_threshold` | スコア閾値到達時 |
| `calendar_booked` | カレンダー予約時 |
| `booking_reminder_sent` | 予約リマインダー送信時 |
| `booking_cancelled` | 予約キャンセル時 |

---

## 認証スキップパス一覧

`apps/worker/src/middleware/auth.ts` で定義:
- `/webhook`, `/docs`, `/openapi.json`
- `/api/affiliates/click`, `/api/liff/*`, `/auth/*`
- `/liff`, `/liff/*`（LIFFアプリ配信・予約・フォーム）
- `/assets/*`, `/t/*`, `/r/*`（公開リソース）
- `/api/calendar/available`, `/api/calendar/settings-public`, `/api/calendar/book*`
- `/api/forms/:id`（フォーム定義取得）
- `/api/forms/:id/submit`（フォーム送信）
- `/api/rich-menus/:id/image`（独自トークン認証）
- `/api/forms/:id/submissions/csv`（クエリトークン認証）
- `/api/webhooks/incoming/:id/receive`（受信Webhook）
- `/api/integrations/stripe/webhook`（Stripe Webhook）

---

## 実装済み機能詳細

### メッセージ配信
- **ステップ配信**: トリガー(`friend_add`/`tag_added`/`manual`)、メッセージ種別(text/image/flex/carousel/video/rich_menu/form/booking)、クイックリプライ、変数展開(`{{name}}`/`{{uid}}`/`{{score}}`/`{{ref}}`/`{{#if_ref}}`)、配信時間帯(9-23JST)、条件分岐
- **一斉配信**: 即時/予約、ステルス送信、URLトラッキング自動変換、テンプレート変数展開
- **オートリプライ**: キーワードマッチ自動返信
- **リマインダ配信**: 特定日時基準のステップ配信

### フォームビルダー
- 9種フィールド(text/email/tel/number/textarea/select/radio/checkbox/date/file)
- 送信時タグ付与・シナリオ登録・メタデータ保存・Kintone連携・CSV出力

### メディアストレージ（R2 + KVフォールバック）
- R2保存(100MB上限)、KVフォールバック、Range request対応(動画必須)
- 動画プレビューはR2自己ホスト(`/assets/video-preview-default.png`)

### リッチメニュー
- 作成・削除・デフォルト設定・画像アップロード・セグメント切替・自動切替

### Google Calendar予約（マルチサービス対応）
- サービスごとに独立設定、サービスアカウントJWT認証
- LIFF予約ページ(`/liff/booking`)、空きスロット4重照合、二重予約防止
- 予約リマインダー自動配信（複数設定、変数展開、キャンセルボタン付き）
- LIFFキャンセルページ(`/liff/booking/cancel`)

### AIチャットアシスタント
- `POST /api/ai-assistant/chat`: Claude Sonnet 4によるツール呼び出し
- 59種CRM操作ツール（list/create/update/delete全対応）、破壊的操作は確認フロー付き
- トークン使用量記録（`ai_usage_logs`テーブル、Sonnet 4料金: input $3/1M + output $15/1M）
- `GET /api/ai-assistant/usage?period=month|daily` — 月別・日別集計
- `GET /api/ai-assistant/usage/logs` — ログ一覧
- サイドバー最上部にグラデーションアクセント、チャットUI(マークダウン・サジェスト・履歴保存)
- 「利用状況」タブ: 今月サマリー(USD/JPY)・日別棒グラフ・月別推移・ログ一覧

### その他
- QRコード別流入計測、流入分析ダッシュボード、アフィリエイト追跡
- 広告プラットフォーム連携(Facebook/Google Ads)、BAN検知、マルチアカウント
- Stripe連携、短縮リンク(`/r/:ref`)、URLトラッキング自動変換

---

## トラブルシューティング

### Vercelビルドエラー
- `packages/shared/dist/` は gitignore → Vercel CI で先にビルド必須（`vercel.json`で対応済み）

### 改行文字によるFetch APIエラー
- `NEXT_PUBLIC_*` に `\n` 混入 → Vercel環境変数は `printf` で設定、コード側 `.trim()` 済み

### LIFF Unauthorized
- `auth.ts` で `/liff` をホワイトリスト済み

### LIFF予約で友だち追加フロー
- `liff.line.me` 経由ではなく `/liff/booking`（Worker直接配信）を使用

### LIFF予約 JSON Parse error
- `closedDays` の二重パース → `Array.isArray()` チェック済み

### 動画がLINEで再生不可
- 206 Partial Content対応済み、auto-track videoスキップ済み、プレビュー画像フォールバック済み

### チャット送信500エラー（メッセージは届く）
- LINE送信後の後処理を個別try-catchでラップ済み

### CORS エラー
- `ALLOWED_ORIGINS` にフロントエンドオリジンを追加

### D1 接続エラー
- `wrangler.toml` で `binding = "DB"` を確認

---

## LIFFアプリ更新手順

```bash
# LIFFリビルド
cd apps/liff
VITE_LIFF_ID=2009615537-8qwrEnEt \
VITE_API_URL=https://line-harness-mamayoro.s-kamiya.workers.dev \
pnpm build

# KV再アップロード
cd ../worker
npx wrangler kv:key delete --namespace-id=86808b1b6a0a4d45be74d2e1df497f88 "liff-index.html"
npx wrangler kv:key delete --namespace-id=86808b1b6a0a4d45be74d2e1df497f88 "liff.js"
npx wrangler kv:key put --namespace-id=86808b1b6a0a4d45be74d2e1df497f88 "liff-index.html" --path ../liff/dist/index.html
npx wrangler kv:key put --namespace-id=86808b1b6a0a4d45be74d2e1df497f88 "liff.js" --path ../liff/dist/assets/liff.js
pnpm run deploy
```

> `/liff/booking` と `/liff/form` は `liff-pages.ts` でインラインHTML生成のため、Worker再デプロイのみで反映。

---

**最終更新**: 2026年3月31日
