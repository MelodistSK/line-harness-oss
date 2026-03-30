# LINE Harness OSS - 開発ガイド

LINE公式アカウント向けOSS CRM。ままよろ自社運用向けカスタマイズ版。
詳細データ（環境変数値・デプロイURL・テーブル一覧等）は **docs/REFERENCE.md** を参照。

---

## 技術スタック

- **フロント**: Next.js 15 (App Router, `output: 'export'`) + React 19 + TailwindCSS v4 + TypeScript
- **バックエンド**: Cloudflare Workers (Hono) + D1 (SQLite) + R2 (メディア) + KV (LIFF配信)
- **LIFF**: Vite 6 + TypeScript + LINE LIFF SDK
- **パッケージ管理**: pnpm ワークスペース（モノレポ）

## ディレクトリ構成

```
apps/worker/src/          # Hono API（routes/ 27ファイル、services/、middleware/）
apps/web/src/             # Next.js（app/ 30ページ、components/、lib/api.ts）
apps/liff/src/            # LIFF（main.ts、form.ts、booking.ts）
packages/db/              # D1スキーマ(schema-full.sql)・マイグレーション(001-019)・DB操作関数
packages/line-sdk/        # LINE API クライアント・Webhook署名検証
packages/shared/          # 共有型定義
```

## よく使うコマンド

```bash
pnpm install && pnpm -r run build          # セットアップ
cd apps/web && pnpm dev                     # フロント開発 → :3000
cd apps/worker && pnpm dev                  # API開発 → :8787
cd apps/worker && npx wrangler deploy       # Workerデプロイ
npx vercel deploy --prod                    # Vercelデプロイ
wrangler d1 execute line-crm --file packages/db/migrations/019_ai_usage.sql --remote
```

---

## アーキテクチャ概要

### 認証
- `Authorization: Bearer {API_KEY}` ヘッダー認証
- 認証スキップパスは `middleware/auth.ts` で定義（公開LIFF・assets・webhook・フォーム等）
- LINE Webhook署名検証（`X-Line-Signature`）

### イベントバス (`services/event-bus.ts`)
- 全操作でイベント発火 → Webhook OUT / スコアリング / オートメーション連動
- `fireEvent()` に `friendId` を渡せば `friend.lineUserId` を自動付与

### メッセージ配信パイプライン
- ステップ配信・一斉配信・リマインダ → Cron 5分毎実行
- 変数展開: `{{name}}`/`{{uid}}`/`{{score}}`/`{{ref}}` → `expandVariables()` 統一
- URLトラッキング自動変換 (`services/auto-track.ts`)、動画URLはスキップ
- ステルス送信（バッチ遅延・バリエーション）

### LIFF配信
- `/liff` → KVから `liff-index.html` 配信（友だち追加フロー）
- `/liff/booking`, `/liff/form` → `liff-pages.ts` でインラインHTML生成（Worker再デプロイで反映）
- 予約ページは必ず `/liff/booking`（Worker直接配信）を使用（`liff.line.me` 経由は不安定）

### AIアシスタント (`routes/ai-assistant.ts`)
- `POST /api/ai-assistant/chat` → Claude Sonnet 4 がツール呼び出しでCRM操作
- 59種ツール定義（CRUD全対応）、DB直接アクセス（内部fetch不要）
- 破壊的操作は `confirmed=true` 必須、閲覧系は即実行
- トークン使用量記録（`ai_usage_logs`テーブル）+ 利用状況ダッシュボード
- `GET /api/ai-assistant/usage`, `GET /api/ai-assistant/usage/logs`

---

## 開発ルール

### セキュリティ（必須）
```typescript
// SQLは必ずプリペアドステートメント
.prepare(`WHERE id = ?`).bind(id)              // OK
.prepare(`WHERE id = '${id}'`)                 // NG: SQLインジェクション
```
- 環境変数は必ず `.trim()` して使用（改行混入防止）
- Vercel環境変数は `printf` で設定（`echo` は改行付加）

### Webhook OUTルール
- **全イベントで `friend.lineUserId` を必ず含める**
- `fireEvent()` に `friendId` を渡す。不明な場合は `eventData.lineUserId` にフォールバック
- ペイロード構造: `{ event, timestamp, friend: { id, lineUserId, displayName, ... }, eventData }`

### コーディング規約
- DB層: snake_case（`display_name`）→ API層: camelCase（`displayName`）に変換
- DB操作は `packages/db/src/*.ts` の関数を使用（直接SQL書かない）
- 新機能追加時は `index.ts` にルート登録 + 認証スキップ要否を `auth.ts` で確認
- メディアはR2保存、動画はRange request (206) 対応必須

### 自動更新ルール
機能追加・修正時、commit前に以下を更新:
- **CLAUDE.md**: アーキテクチャに影響する変更のみ
- **docs/REFERENCE.md**: 環境変数・デプロイ設定・テーブル・認証パス・トラブルシューティング

---

## 主要機能一覧

| カテゴリ | 機能 |
|----------|------|
| 配信 | ステップ配信、一斉配信（ステルス対応）、オートリプライ、リマインダ |
| メッセージ | text/image/flex/carousel/video/rich_menu/form/booking、クイックリプライ、変数展開 |
| フォーム | 9種フィールド、タグ付与、シナリオ登録、Kintone連携、CSV出力 |
| 予約 | GCal連携マルチサービス、空きスロット4重照合、リマインダー自動配信、LIFFキャンセル |
| 分析 | QRコード流入計測、流入分析ダッシュボード、アフィリエイト追跡、URLトラッキング |
| 自動化 | オートメーション(IF-THEN)、スコアリング、イベントバス、Webhook IN/OUT |
| UI | ダークネイビーサイドバー、Flexプレビュー、リッチメニュービルダー |
| AI | Claude APIチャットアシスタント（59種ツール、CRUD全対応、利用状況トラッキング） |
| その他 | マルチアカウント、Stripe連携、広告連携、BAN検知、メディアR2ストレージ |

---

## 今後の拡張想定

- Stripe 決済連携（基盤実装済み）
- Slack 通知（notification_rules テーブル用意済み）
- AI自動返信（LLM API連携）
- SMS 連携（多チャネル対応）

---

**最終更新**: 2026年3月31日
