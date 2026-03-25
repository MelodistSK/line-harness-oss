# LINE Harness OSS - 開発ガイド（ままよろ版）

## プロジェクト概要

**LINE Harness OSS** は、LINE公式アカウント向けのオープンソースCRMシステムです。
ままよろ自社運用向けにカスタマイズされています。

### 特徴
- **フル機能CRM**: ステップ配信、オートリプライ、フォーム、アンケート、リマインダ、スコアリング
- **マルチアカウント対応**: 複数のLINE公式アカウントを1プラットフォームで管理
- **実用的UI**: Next.js 15 + React で構築された直感的なダッシュボード
- **OSSベース**: MIT License - 自由にカスタマイズ・運用可能

---

## 技術スタック

### フロントエンド
- **Next.js 15** (App Router)
- **React 19**
- **TailwindCSS** / **PostCSS**
- **TypeScript**

### バックエンド / API
- **Cloudflare Workers** (Hono フレームワーク)
- **Cloudflare D1** (SQLite3 互換 DB)
- **TypeScript**

### LIFF / モバイルUI
- **Vite** + **React** + **TypeScript**
- LINE LIFF SDK 統合

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
│   │   │   ├── index.ts     # メインエントリ、CORS・Auth設定
│   │   │   ├── routes/      # API各ルート（webhook, friends, scenarios等）
│   │   │   ├── middleware/  # 認証ミドルウェア
│   │   │   └── services/    # ビジネスロジック
│   │   ├── wrangler.toml    # CF Workers 設定
│   │   └── package.json
│   │
│   ├── web/                 # Next.js ダッシュボード
│   │   ├── src/
│   │   │   ├── app/         # App Router
│   │   │   ├── components/  # React コンポーネント
│   │   │   ├── contexts/    # React Context など
│   │   │   └── lib/         # ユーティリティ
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── liff/                # LIFF フロントエンド（React + Vite）
│       ├── src/
│       │   ├── main.ts      # エントリポイント
│       │   ├── form.ts      # フォーム機能
│       │   ├── booking.ts   # 予約機能
│       │   └── ...
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   ├── db/                  # D1 スキーマ & マイグレーション
│   │   ├── schema.sql
│   │   ├── schema-full.sql  # 本番導入用：全42テーブル統合版
│   │   ├── migrations/      # 段階的マイグレーション (001〜009)
│   │   └── src/
│   │       └── *.ts         # DB操作関数（friends, scenarios等）
│   │
│   ├── line-sdk/            # LINE SDK ラッパー
│   │   └── src/
│   │       ├── client.ts    # LINE API クライアント
│   │       ├── webhook.ts   # Webhook 署名検証
│   │       └── types.ts     # 型定義
│   │
│   ├── sdk/                 # ままよろ向け SDK（将来拡張用）
│   │   └── ...
│   │
│   └── shared/              # 共有型・定数
│       └── src/
│           └── *.ts
│
├── docs/
│   ├── SPEC.md              # 完全仕様書
│   ├── wiki/                # 詳細ドキュメント
│   │   ├── 09-Rich-Menus.md
│   │   ├── 11-Forms-and-LIFF.md
│   │   ├── 21-Deployment.md
│   │   └── ...
│   └── PROGRESS.md
│
├── scripts/
│   └── sync-oss.sh          # OSS同期スクリプト
│
├── package.json             # ルートパッケージ
├── pnpm-workspace.yaml      # ワークスペース定義
├── tsconfig.base.json       # TS 共有設定
└── CLAUDE.md                # このファイル（開発ガイド）
```

---

## よく使うコマンド

### セットアップ
```bash
# 依存関係のインストール
pnpm install

# TypeScript ビルド確認
pnpm -r run build
```

### 開発

#### Next.js ダッシュボード
```bash
cd apps/web
pnpm dev
# → http://localhost:3000
```

#### Cloudflare Workers (ローカル開発)
```bash
cd apps/worker
pnpm dev
# → http://localhost:8787
```

#### LIFF フロントエンド
```bash
cd apps/liff
pnpm dev
# → http://localhost:5173
```

### データベース

#### D1 スキーマ確認
```bash
# リモート D1 内容確認
wrangler d1 execute line-crm --remote --command "SELECT name FROM sqlite_master WHERE type='table';"

# 初期化（新規プロジェクト）
wrangler d1 execute line-crm --file packages/db/schema-full.sql --remote
```

#### マイグレーション実行
```bash
# 段階的適用（既存DBへの追加機能）
wrangler d1 execute line-crm --file packages/db/migrations/001_round2.sql --remote
wrangler d1 execute line-crm --file packages/db/migrations/002_round3.sql --remote
# ... 009 まで
```

### デプロイ

#### Worker デプロイ
```bash
cd apps/worker
pnpm deploy
```

#### Next.js デプロイ（Vercel など）
```bash
cd apps/web
# Vercel CLI または git push main → 自動デプロイ
```

---

## セキュリティ注意事項

### 1. SQLインジェクション対策 ✅
- **プリペアドステートメント必須**: 全SQL操作で `.prepare()` + `.bind()` を使用
- 文字列結合での動的SQL埋め込みは **厳禁**
- 例外: `webhook.ts` line 312 の `auto_replies` クエリ（修正済み）

```typescript
// ❌ 危険（文字列結合）
.prepare(`WHERE line_account_id = '${id}'`)

// ✅ 安全（プリペアドステートメント）
.prepare(`WHERE line_account_id = ?`).bind(id)
```

### 2. CORS設定 ✅
- **本番環境では origin: '*' を許可しない**
- 環境変数 `ALLOWED_ORIGINS` で制御（カンマ区切り）
- 未設定時はデフォルト値を使用（通常は自社ドメインのみ）

```typescript
// index.ts の CORS ミドルウェア
const origins = c.env.ALLOWED_ORIGINS?.split(',') ?? ['https://mamayoro.com'];
app.use('*', cors({ origin: origins }));
```

### 3. LINE Webhook 署名検証 ✅
- 全 webhook イベント前に `verifySignature()` で署名を検証
- 既実装: `webhook.ts` line 52

### 4. API認証キー 🔐
- `API_KEY` は環境変数で管理
- 本番環境ではランダムな強力な値（32文字以上推奨）
- リクエストヘッダ `Authorization: Bearer {API_KEY}` で検証

### 5. D1データベース接続
- `wrangler.toml` の `binding` でセキュアに接続
- コネクションプール化（Workers での最適化）

### 6. 環境変数管理（`.dev.vars` / Wrangler Secrets）
```
# .dev.vars （ローカル開発用）
LINE_CHANNEL_SECRET=xxxxx
LINE_CHANNEL_ACCESS_TOKEN=xxxxx
API_KEY=your-secret-key
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Wrangler Secrets （本番環境）
wrangler secret put LINE_CHANNEL_SECRET
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put API_KEY
wrangler secret put ALLOWED_ORIGINS
```

---

## ままよろ向けカスタマイズ方針

### 実装済み
1. ✅ マルチアカウント対応 (`friends.line_account_id`, `scenarios.line_account_id` 等)
2. ✅ SQLインジェクション対策 (プリペアドステートメント)
3. ✅ CORS環境変数制御
4. ✅ LINE Login 統合
5. ✅ Webhook IN/OUT
6. ✅ Google Calendar 連携
7. ✅ アクション自動化
8. ✅ リマインダ配信
9. ✅ スコアリング機能
10. ✅ メタデータ拡張

### 今後の拡張想定
- **Stripe 決済連携** (既に基盤実装)
- **Slack 通知** (notification_rules テーブル用意済み)
- **カスタムフック** (webhook OUT 用)
- **AI自動返信** (LLM API 連携)
- **SMS 連携** (多チャネル対応)

---

## トラブルシューティング

### CORS エラー
```
Error: Access to XMLHttpRequest blocked by CORS policy
```
→ `Env.ALLOWED_ORIGINS` を確認。複数ドメイン時はカンマ区切り

### D1 接続エラー
```
Error: Database not bound
```
→ `wrangler.toml` で `binding = "DB"` が設定されているか確認
→ `wrangler d1 list` で D1 が作成されているか確認

### LINE Webhook 署名検証失敗
```
Invalid LINE signature error
```
→ `LINE_CHANNEL_SECRET` が正しいか確認
→ Raw body の encoding を確認（JSON パース後ではなく raw として検証）

### TypeScript エラー
```bash
# 全パッケージの型チェック
pnpm -r run typecheck

# ビルド確認
pnpm -r run build
```

---

## サポート・責任者

- **開発代理人**: Claude (AI)
- **本番運用**: ままよろ エンジニアチーム
- **OSSコントリビューション**: LINE-related improvements only

---

## ライセンス

MIT License - 自由にカスタマイズ・拡張・商用利用可能

---

**最終更新**: 2026年3月26日 (Cloudflare Workers / D1 / Next.js 15対応)
