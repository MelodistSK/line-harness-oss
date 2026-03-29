# LINE Harness OSS - 開発ガイド（ままよろ版）

## プロジェクト概要

**LINE Harness OSS** は、LINE公式アカウント向けのオープンソースCRMシステムです。
ままよろ自社運用向けにカスタマイズされています。

### 特徴
- **フル機能CRM**: ステップ配信、オートリプライ、フォーム、アンケート、リマインダ、スコアリング
- **マルチアカウント対応**: 複数のLINE公式アカウントを1プラットフォームで管理
- **実用的UI**: Next.js 15 + React 19 + ダークネイビーサイドバーの直感的ダッシュボード
- **OSSベース**: MIT License - 自由にカスタマイズ・運用可能

---

## 技術スタック

### フロントエンド
- **Next.js 15.1.0** (App Router, `output: 'export'` 静的サイト)
- **React 19.0.0**
- **TailwindCSS v4** / **PostCSS**
- **TypeScript 5.7.0**

### バックエンド / API
- **Cloudflare Workers** (Hono フレームワーク)
- **Cloudflare D1** (SQLite3 互換 DB)
- **Cloudflare R2** (メディアストレージ、100MB/ファイル上限)
- **Cloudflare KV** (LIFFアプリ配信 + R2移行前のレガシーアセット)
- **TypeScript**

### LIFF / モバイルUI
- **Vite 6.0.0** + TypeScript
- LINE LIFF SDK 統合
- LIFF ID: `2009615537-8qwrEnEt`
- エンドポイントURL: `https://line-harness-mamayoro.s-kamiya.workers.dev/liff`

### パッケージ管理
- **pnpm** ワークスペース（モノレポ構成）
- **TypeScript** 共有設定

---

## ディレクトリ構成

```
line-harness-oss/
├── apps/
│   ├── worker/              # Cloudflare Workers バックエンド
│   │   ├── src/
│   │   │   ├── index.ts     # メインエントリ、CORS・Auth、/liff・/liff/booking・/r/:ref
│   │   │   ├── liff-pages.ts # LIFF予約・フォーム専用HTML生成（インラインJS）
│   │   │   ├── routes/      # API各ルート（26ファイル）
│   │   │   ├── middleware/  # 認証ミドルウェア (auth.ts)
│   │   │   └── services/    # ビジネスロジック
│   │   │       ├── broadcast.ts       # 一斉配信（テンプレート変数展開対応）
│   │   │       ├── google-calendar.ts # GCal API（サービスアカウントJWT認証）
│   │   │       ├── event-bus.ts       # イベント発火・Webhook/Scoring/Automation
│   │   │       ├── step-delivery.ts   # ステップ配信・buildMessage
│   │   │       ├── reminder-delivery.ts
│   │   │       ├── stealth.ts         # 人間らしい送信パターン
│   │   │       └── auto-track.ts      # URLトラッキング自動変換
│   │   ├── wrangler.toml    # CF Workers 設定
│   │   └── package.json
│   │
│   ├── web/                 # Next.js ダッシュボード
│   │   ├── src/
│   │   │   ├── app/         # App Router (27ページ)
│   │   │   ├── components/  # React コンポーネント
│   │   │   ├── contexts/    # React Context
│   │   │   └── lib/         # ユーティリティ・API クライアント
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── liff/                # LIFF フロントエンド（Vite + TypeScript）
│       ├── src/
│       │   ├── main.ts      # エントリ（友だち追加は?page=なし時のみ）
│       │   ├── form.ts      # フォーム表示・送信
│       │   └── booking.ts   # 予約（レガシー、/liff/bookingに移行済み）
│       ├── .env             # VITE_API_URL, VITE_LIFF_ID (gitignore対象)
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── db/                  # D1 スキーマ & マイグレーション
│   │   ├── schema.sql
│   │   ├── schema-full.sql  # 本番導入用：全43テーブル統合版
│   │   ├── migrations/      # 段階的マイグレーション (001〜014)
│   │   └── src/
│   │       └── *.ts         # DB操作関数
│   │
│   ├── line-sdk/            # LINE SDK ラッパー
│   │   └── src/
│   │       ├── client.ts    # LINE API クライアント
│   │       ├── webhook.ts   # Webhook 署名検証
│   │       └── types.ts     # 型定義
│   │
│   └── shared/              # 共有型・定数
│       └── src/
│           └── types.ts     # MessageType, ApiResponse等の共有型定義
│
├── docs/
│   ├── SPEC.md              # 完全仕様書
│   └── wiki/                # 詳細ドキュメント
│
└── CLAUDE.md                # このファイル（開発ガイド）
```

---

## よく使うコマンド

### セットアップ
```bash
pnpm install
pnpm -r run build
```

### 開発

```bash
# Next.js ダッシュボード
cd apps/web && pnpm dev        # → http://localhost:3000

# Cloudflare Workers
cd apps/worker && pnpm dev     # → http://localhost:8787

# LIFF フロントエンド
cd apps/liff && pnpm dev       # → http://localhost:3002
```

### データベース

```bash
# リモート D1 テーブル確認
wrangler d1 execute line-crm --remote --command "SELECT name FROM sqlite_master WHERE type='table';"

# 初期化（新規プロジェクト）
wrangler d1 execute line-crm --file packages/db/schema-full.sql --remote

# マイグレーション実行
wrangler d1 execute line-crm --file packages/db/migrations/001_round2.sql --remote
# ... 018 まで
```

### デプロイ

```bash
# Worker デプロイ
cd apps/worker && npx wrangler deploy

# Vercel デプロイ（git push で自動 or 手動）
npx vercel deploy --prod
```

### LIFFアプリ更新（KVに再アップロード）

```bash
# LIFFをリビルド（環境変数をビルド時に埋め込み）
cd apps/liff
VITE_LIFF_ID=2009615537-8qwrEnEt \
VITE_API_URL=https://line-harness-mamayoro.s-kamiya.workers.dev \
pnpm build

# KVの古いキーを削除してから再アップロード
cd ../worker
npx wrangler kv:key delete --namespace-id=86808b1b6a0a4d45be74d2e1df497f88 "liff-index.html"
npx wrangler kv:key delete --namespace-id=86808b1b6a0a4d45be74d2e1df497f88 "liff.js"
npx wrangler kv:key put --namespace-id=86808b1b6a0a4d45be74d2e1df497f88 "liff-index.html" --path ../liff/dist/index.html
npx wrangler kv:key put --namespace-id=86808b1b6a0a4d45be74d2e1df497f88 "liff.js" --path ../liff/dist/assets/liff.js

# Workerを再デプロイ
pnpm run deploy
```

> **注意**: `/liff/booking` (予約ページ) と `/liff/form` (フォームページ) は `liff-pages.ts` でインラインHTML生成されるため、KVアップロード不要。Worker再デプロイのみで反映される。

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
- **配信方式**: WorkerのKVストアから配信（`/liff` ルートで `liff-index.html` を返却、`/assets/liff.js` でJSを配信）
- **フォームURL形式**: `https://liff.line.me/2009615537-8qwrEnEt?page=form&id={FORM_ID}`
- **予約URL形式**: `https://line-harness-mamayoro.s-kamiya.workers.dev/liff/booking`（Worker直接配信、友だち追加フロー不要）
- **注意**: 予約ページは `/liff/booking` で独立配信（`liff-pages.ts` でインラインHTML生成）。`liff.line.me/{LIFF_ID}?page=booking` 経由の場合、LIFF SDKの `liff.state` パラメータ変換でルーティングが不安定になるため、Worker URLを直接使用する。

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
| `WORKER_URL` | Var | Workerの公開URL（`https://line-harness-mamayoro.s-kamiya.workers.dev`） |
| `X_HARNESS_URL` | Secret | X Harness API URL（省略可） |
| `DB` | Binding | D1 データベース |
| `ASSETS` | Binding | R2 メディアストレージ（画像・動画） |
| `ASSETS_KV` | Binding | KV（LIFF配信 + レガシーアセット、R2フォールバック） |

```bash
# シークレット設定方法
wrangler secret put LINE_CHANNEL_SECRET
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put API_KEY
wrangler secret put ALLOWED_ORIGINS
wrangler secret put LIFF_URL
```

### Next.js ダッシュボード（Vercel環境変数）

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_API_URL` | Worker API エンドポイント（`https://line-harness-mamayoro.s-kamiya.workers.dev`） |
| `NEXT_PUBLIC_API_KEY` | 管理API認証キー（Worker の `API_KEY` と同じ値） |
| `NEXT_PUBLIC_LIFF_ID` | LIFF アプリID（`2009615537-8qwrEnEt`） |

> ⚠️ **重要**: `printf "value" | npx vercel env add KEY production` を使うこと。`echo` は末尾改行が入りバグの原因になる。

### LIFF アプリ（`apps/liff/.env`、gitignore対象）

```
VITE_API_URL=https://line-harness-mamayoro.s-kamiya.workers.dev
VITE_LIFF_ID=2009615537-8qwrEnEt
VITE_BOT_BASIC_ID=@xxxxxx          # LINE Bot の基本ID
VITE_CALENDAR_CONNECTION_ID=xxxx   # Google Calendar接続ID（予約機能用）
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

## 実装済み機能一覧

### メッセージ配信
- **ステップ配信（シナリオ）**: 遅延付きの自動メッセージシーケンス
  - トリガー: `friend_add` / `tag_added` / `manual`
  - メッセージ種別: テキスト・画像・Flex・カルーセル・動画・リッチメニュー切替
  - クイックリプライ対応
  - 変数展開: `{{name}}` / `{{uid}}` / `{{ref}}` / `{{#if_ref}}...{{/if_ref}}`
  - 配信時間帯制御（9:00〜23:00 JST）・ジッター付き
  - 条件分岐: `tag_exists` / `tag_not_exists` / `metadata_equals` / `metadata_not_equals`

- **一斉配信（ブロードキャスト）**: 全フォロワーまたはタグ絞り込み配信
  - 即時送信・予約配信
  - ステルス送信（バッチ遅延・メッセージバリエーション）
  - URLトラッキング自動変換
  - テンプレート変数展開: `{{name}}`/`{{score}}`/`{{uid}}`（変数含む場合はpushMessage個別送信）

- **オートリプライ**: キーワードマッチによる自動返信

- **リマインダ配信**: 特定日時基準のステップ配信

### メッセージ作成強化
- **対応メッセージ種別**: `text` / `image` / `flex` / `carousel` / `video` / `rich_menu` / `form` / `booking`
- **クイックリプライ**: 全メッセージタイプに追加可能
- **Flexプレビュー**: JSON入力でリアルタイムプレビュー表示（`flex-preview.tsx`）
- **テンプレート挿入**: 保存済みテンプレートからワンクリック挿入
- **変数プレビュー**: `{{name}}` 等のサンプル値置換プレビュー
- **テスト送信**: 管理者自身への事前テスト送信
- **フォーム配信**: LIFFフォームへのリンクボタン付きFlex自動生成
- **リッチメニュー切替アクション**: シナリオステップでメニューをリンク/解除

### フォームビルダー
- **9種フィールド**: `text` / `email` / `tel` / `number` / `textarea` / `select` / `radio` / `checkbox` / `date` / `file`
- 送信時タグ付与・シナリオ自動登録
- メタデータ保存（スコアリングと連携）
- **Kintone連携**: サブドメイン・AppID・APIトークン・フィールドマッピング設定
- 回答一覧・CSV エクスポート

### メディアストレージ（R2 + KVフォールバック）
- **Cloudflare R2** に保存（最大100MB/ファイル）
- アップロードAPI: `POST /api/assets/upload`（multipart/form-data または `image/*`/`video/*`）
- 公開配信: `GET /assets/:filename`（認証不要・永続キャッシュ・Range request対応・CORS対応）
- 対応形式: PNG / JPEG / GIF / WebP / SVG / MP4 / M4V / JS / CSS / HTML
- 拡張子ベースMIME自動判定（メタデータ欠損時のフォールバック）
- **KVフォールバック**: R2にない場合はKVから配信（移行期間中の後方互換）
- **移行API**: `POST /api/assets/migrate-to-r2`（KV→R2一括コピー）
- **LIFFアプリ**はKV配信（`liff-index.html` / `liff.js`）
- **動画配信要件**: Content-Type: video/mp4, Accept-Ranges: bytes, 206 Partial Content対応（LINE API必須）

### リッチメニュービルダー
- リッチメニュー作成・削除・デフォルト設定
- **メニュー画像アップロード** → KV保存 → LINE APIへPOST
- **セグメント切替**: フレンド個別にリッチメニューをリンク/解除
- **自動切替**: オートメーションアクション `switch_rich_menu` でシナリオ・自動化から切替
- LINE Developers ConsoleのリッチメニューIDインポート対応
- リッチメニューマッピング管理（フレンドとメニューの対応表）

### イベントバス & Webhook OUT
- **全イベント種別**:

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

- **友だち詳細情報付きペイロード**: `friendId` があれば、名前・タグ一覧・スコアを自動付与してWebhook送信
- 送信Webhookにシークレット署名（`X-Harness-Signature`）対応

### 自動化（オートメーション）
- IF-THENルール: イベント発生時に自動アクション実行
- **アクション種別**: `add_tag` / `remove_tag` / `start_scenario` / `send_message` / `send_webhook` / `switch_rich_menu` / `update_metadata`
- 優先度制御・実行ログ記録

### スコアリング
- ポイントルール設定（イベント種別×ポイント）
- フレンドごとの累計スコア管理
- スコア閾値アクションでオートメーション連携

### 認証 & セキュリティ
- `Authorization: Bearer {API_KEY}` ヘッダー認証
- 認証スキップパス一覧（`apps/worker/src/middleware/auth.ts`）:
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
- LINE Webhook署名検証（`X-Line-Signature`）
- SQLインジェクション対策（全操作でプリペアドステートメント使用）

### UI・デザイン
- **ダークネイビーサイドバー** + ライトコンテンツエリアのハイブリッドデザイン
- ダッシュボード: KPI集計、最近の配信・フレンド一覧、アカウントステータス
- リッチメニュー管理画面にリアルタイム画像プレビュー
- Flexメッセージプレビューコンポーネント（`flex-preview.tsx`）
- 全ページ日本語UI

### その他
- **Google Calendar予約システム（複数サービス対応）**:
  - **マルチサービス**: 「カット」「カラー」等メニューごとに独立したカレンダー・設定で予約管理
  - `calendar_services` テーブル: サービスごとにGoogle接続情報・営業時間・休日・予約枠・フォーム項目を個別設定
  - サービスアカウントJWT認証（Web Crypto API、外部ライブラリ不要）
  - 管理画面: サービス一覧カード表示 → 個別編集（接続設定・営業時間・休日・予約フォーム項目）
  - LIFF予約ページ: `/liff/booking`（サービス選択 → 日付 → 時間 → フォーム → 確認 → 送信）
    - サービスが1つのみの場合はサービス選択をスキップ
    - URLパラメータ `?serviceId=xxx` で特定サービスに直接遷移
  - 空きスロット計算: 営業時間 + 休日 + GCal FreeBusy + D1予約の4重照合（サービスごとに独立）
  - 二重予約防止: 予約作成時にGCal + D1の両方で再確認
  - メッセージ種別「予約」: Flex自動生成、サービス指定可能、全送信画面で利用可能
  - Webhook OUT: `booking_created` イベントに `serviceId` / `serviceName` / `calendarId` を含む
  - **予約リマインダー自動配信**: 予約前にLINEリマインダーを自動送信
    - 複数リマインダー設定可能（例: 3日前、1日前、1時間前）
    - タイミング: ○日前 / ○時間前 / ○分前（自由入力）
    - メッセージタイプ: テキスト / Flex（カスタムまたはデフォルトテンプレート）
    - 変数展開: `{{name}}` / `{{date}}` / `{{time}}` / `{{serviceName}}` / `{{bookingData.phone}}` 等
    - サービスごとに異なるリマインダー設定が可能（またはグローバル共通）
    - キャンセルボタン付き: ONの場合、FlexにLIFFキャンセルページへのリンクボタンを自動追加
    - LIFF予約キャンセルページ: `/liff/booking/cancel?id={bookingId}`（確認画面 → キャンセル → GCal削除 + Webhook）
    - 管理画面: `/calendar` 設定タブにリマインダーセクション（CRUD、プレビュー、デフォルトテンプレート挿入）
    - Webhook OUT: `booking_reminder_sent` / `booking_cancelled` イベント
    - `booking_reminders` / `booking_reminder_logs` テーブル（マイグレーション018）
    - Cron: 5分毎に既存cronで `processBookingReminders` を実行（二重送信防止ログ付き）
- **QRコード別流入計測**:
  - QRコード作成・管理（`qr_codes`テーブル）: 名前、refコード自動生成、LIFF友だち追加URLのQR画像生成
  - スキャン数・友だち追加数カウント（LIFF link時に自動インクリメント）
  - QRコード別日別推移統計
  - QRコード画像ダウンロード（PNG）
- **流入分析ダッシュボード** (`/analytics`):
  - サマリーカード（総友だち数・今月追加・流入経路数・トップ経路）
  - 経路別友だち追加数 棒グラフ（CSS）
  - 日別推移 折れ線グラフ（SVG）
  - QRコード別コンバージョン率（スキャン → 友だち追加）
  - 期間フィルタ（7日/30日/90日/全期間）
  - 経路一覧テーブル
- **アフィリエイト追跡**: クリックID・コミッション率・成果レポート
- **広告プラットフォーム連携**: Facebook/Google Ads コンバージョンAPI
- **アカウントヘルスモニタリング**: BAN検知（normal/warning/danger）
- **マルチアカウント**: 複数LINE公式アカウントを1システムで管理
- **Stripe連携**: 決済イベント受信・フレンド照合
- **短縮リンク**: `/r/:ref` → LIFFへのリダイレクト（LINE友だち追加URL）

---

## データベーステーブル一覧（D1）

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
conversion_points, conversion_events
affiliates, affiliate_clicks

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
chats, notification_rules, notifications
automations, automation_logs
account_health_logs, account_migrations

# リッチメニュー
rich_menus, rich_menu_mappings

# フォーム
forms, form_submissions
```

---

## セキュリティ注意事項

### 1. SQLインジェクション対策 ✅
```typescript
// ❌ 危険（文字列結合）
.prepare(`WHERE line_account_id = '${id}'`)

// ✅ 安全（プリペアドステートメント）
.prepare(`WHERE line_account_id = ?`).bind(id)
```

### 2. CORS設定 ✅
```typescript
const origins = c.env.ALLOWED_ORIGINS?.split(',') ?? ['https://mamayoro.com'];
app.use('*', cors({ origin: origins }));
```

### 3. 環境変数に改行を含めない ✅
```bash
# ❌ 危険（echo は末尾改行を含む）
echo "KEY_VALUE" | vercel env add VAR_NAME production

# ✅ 安全（printf は改行を含まない）
printf "KEY_VALUE" | vercel env add VAR_NAME production
```
コード側でも取得時に必ず `.trim()` を使用（`getApiKey()`, `LIFF_ID` 変数参照）

### 4. LINE Webhook 署名検証 ✅
- `webhook.ts` で `verifySignature()` を全イベント前に実行

### 5. API認証キー 🔐
- `API_KEY` は32文字以上の乱数推奨
- `Authorization: Bearer {API_KEY}` で検証
- フロントエンドでは `localStorage.lh_api_key` → `NEXT_PUBLIC_API_KEY` のフォールバック

---

## トラブルシューティング

### Vercelビルドエラー（TypeScript型エラー）
- `packages/shared/dist/` は gitignore対象 → Vercel CI で `@line-crm/shared` を先にビルド必須
- `vercel.json` の `buildCommand` で対応済み

### 改行文字によるFetch APIエラー
```
TypeError: Failed to execute 'set' on 'Headers': Invalid value
```
- `NEXT_PUBLIC_API_KEY` や `NEXT_PUBLIC_LIFF_ID` に `\n` が混入している
- Vercel環境変数を `printf` で再設定し、コード側でも `.trim()` を使用

### LIFF Unauthorized エラー
- LIFFエンドポイントURLがWorkerに向いている場合、`/liff` パスが認証対象になる
- `auth.ts` で `path === '/liff'` をホワイトリスト済み
- 正しいLIFFエンドポイントURL: `https://line-harness-mamayoro.s-kamiya.workers.dev/liff`

### Flex配信でURIに改行が含まれる（LINE API 400: invalid uri）
- `NEXT_PUBLIC_API_URL` や `NEXT_PUBLIC_LIFF_ID` の末尾改行が原因
- Vercel環境変数は `printf` で設定すること（`echo` は改行付加）
- 全ての `process.env.NEXT_PUBLIC_*` 参照に `.trim()` 済み（api.ts, 各generateBookingFlex等）

### LIFF予約ページで友だち追加フローが走る
- `liff.line.me/{LIFF_ID}?page=booking` 経由の場合、LIFF SDKが `liff.state` にパラメータを変換するためルーティング失敗
- 解決: 予約ページは `/liff/booking` (Worker直接配信) を使用。FlexメッセージのURLも `{WORKER_URL}/liff/booking`

### LIFF予約ページで「JSON Parse error: Unexpected identifier "sun"」
- `settings-public` APIが返す `closedDays` は既にJavaScript配列なのに `JSON.parse()` で再パースしていた
- `liff-pages.ts` で `Array.isArray()` チェック後にそのまま使用するよう修正済み

### 動画がLINEで再生できない
- Range request非対応（200で全データ返却）→ 206 Partial Content対応済み
- auto-track.tsで動画URLがトラッキングURLに置換されていた → videoタイプをスキップ対象に追加
- previewImageUrlが空の場合に動画URLをフォールバックに使用していた → プレースホルダー画像に変更

### チャット送信で500エラー（メッセージは届いている）
- LINE pushMessage成功後の後処理（messages_log INSERT, updateChat）でエラー発生時に500を返していた
- LINE送信後の後処理を個別try-catchでラップし、失敗しても200を返すよう修正済み

### CORS エラー
```
Error: Access to XMLHttpRequest blocked by CORS policy
```
→ `ALLOWED_ORIGINS` にフロントエンドのオリジンを追加（カンマ区切り）

### D1 接続エラー
```
Error: Database not bound
```
→ `wrangler.toml` で `binding = "DB"` が設定されているか確認

### TypeScript エラー
```bash
pnpm -r run typecheck
pnpm -r run build
```

---

## ままよろ向けカスタマイズ方針

### 実装済み ✅
1. マルチアカウント対応
2. SQLインジェクション対策（プリペアドステートメント）
3. CORS環境変数制御
4. LINE Login統合
5. Webhook IN/OUT（全イベント種別・friend詳細情報付きペイロード）
6. Google Calendar連携
7. アクション自動化（Automation）
8. リマインダ配信
9. スコアリング機能
10. メタデータ拡張
11. メディアストレージ（Cloudflare R2、KVフォールバック、Range request対応）
12. リッチメニュービルダー＋セグメント切替＋自動切替
13. フォームビルダー（9種フィールド＋Kintone連携）
14. Flexメッセージプレビュー
15. ダークテーマUI（ネイビーサイドバー）
16. メッセージ送信強化（カルーセル・クイックリプライ・動画・テンプレート挿入・変数プレビュー・テスト送信・フォーム送信・予約送信・リッチメニュー切替アクション）
17. LIFFアプリ（友だち追加・フォーム・予約）、Worker KV/R2配信
18. URLトラッキング自動変換（Auto-track）
19. アフィリエイト追跡
20. アカウントヘルスモニタリング
21. 広告プラットフォーム連携（Facebook/Google Ads）
22. 環境変数の改行バグ防止（.trim() 徹底）
23. 全管理ページに編集・複製・削除確認機能
24. Google Calendar予約システム（サービスアカウントJWT認証、管理画面設定、LIFF予約）
25. テンプレート変数展開（一斉配信: {{name}}/{{score}}/{{uid}}）
26. 動画メッセージ完全対応（R2配信、Range request、CORS、プレビュー）
27. チャット画面の自動スクロール（最新メッセージへ）
28. 予約リマインダー自動配信（複数設定、テンプレート変数、キャンセルボタン、LIFFキャンセルページ）
29. トラッキングリンクのlu自動付与（全pushMessageパスで友だち識別パラメータ埋め込み）

### 今後の拡張想定
- **Stripe 決済連携** (基盤実装済み)
- **Slack 通知** (notification_rules テーブル用意済み)
- **AI自動返信** (LLM API 連携)
- **SMS 連携** (多チャネル対応)

---

## 自動更新ルール

- 機能追加・修正・設定変更を行った場合、作業完了時にCLAUDE.mdの該当セクションを必ず更新すること。
- git commitする前にCLAUDE.mdの更新を含めること。
- 特に以下の変更時は対応セクションを更新する:
  - 新しい環境変数の追加/削除 → 「環境変数一覧」セクション
  - 新しいAPIエンドポイント → 「実装済み機能一覧」
  - 認証スキップパスの変更 → 「認証 & セキュリティ」
  - デプロイ設定の変更 → 「デプロイ情報」
  - LIFF設定の変更 → 「LIFF」セクション
  - 新しいDBテーブル → 「データベーステーブル一覧」
  - 既知のバグ修正・回避策 → 「トラブルシューティング」

---

**最終更新**: 2026年3月30日
