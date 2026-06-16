# デプロイ手順（Cloudflare Workers + D1）

このアプリは [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)（OpenNext）で
Next.js 16（App Router）を **Cloudflare Workers** 上で動かし、データは **Cloudflare D1**（SQLite 互換）に保存する。

DB アクセスはリクエストスコープのバインディング（`env.DB`）経由で、`src/db/index.ts` の
`getDb()` から取得する。ローカル開発も `next dev` が OpenNext のローカル統合（miniflare）を通じて
同じ D1 バインディングをエミュレートするため、本番と同一コードで動作する。

---

## 1. ローカル開発

```bash
npm install

# ローカル D1 を作成しマイグレーション＋シードを投入（.wrangler/state 配下に作られる）
npm run db:setup:local        # = db:migrate:local && db:seed:local

# 開発サーバー（http://localhost:3000）
npm run dev
```

- スキーマを変更したら `npm run db:generate` でマイグレーション SQL を生成し、
  `npm run db:migrate:local` で適用する。
- シードデータ（`src/db/seed-data.ts`）を変更したら `npm run db:seed:local` で再投入する
  （`drizzle/seed.sql` が再生成され、冪等に上書きされる）。

### デモ用アカウント

シードで投入されるデモアカウント一覧は [README](../README.md#デモ用アカウントパスワードはすべて-password) を参照（パスワードは既定で `password`、`SEED_DEFAULT_PASSWORD` で上書き可）。

---

## 2. 本番（Cloudflare）への初回セットアップ

前提: Cloudflare アカウントと `wrangler` での認証（`npx wrangler login`、または
`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` を環境変数に設定）。

```bash
# 1) 本番 D1 データベースを作成
npx wrangler d1 create eng-game-db
```

出力された `database_id` を [`wrangler.jsonc`](../wrangler.jsonc) の
`d1_databases[0].database_id`（`REPLACE_WITH_YOUR_D1_DATABASE_ID`）に貼り付ける。

```bash
# 2) 本番 D1 にスキーマを適用
npm run db:migrate:remote

# 3) 初期データを投入（任意。デモ用シード。実運用では管理画面から登録してもよい）
npm run db:seed:remote

# 4) ビルドしてデプロイ
npm run deploy
```

`npm run deploy` は内部で `opennextjs-cloudflare build`（`.open-next/` を生成）→
`opennextjs-cloudflare deploy`（Workers へ公開）を実行する。

---

## 3. 継続的デプロイ（更新時）

```bash
# スキーマ変更がある場合のみ
npm run db:generate            # マイグレーション SQL を生成（drizzle/migrations/）
npm run db:migrate:remote      # 本番 D1 へ適用

npm run deploy                 # 再ビルド＆デプロイ
```

> マイグレーションは `drizzle/migrations/` を wrangler が管理し、適用済みのものは
> D1 側の管理テーブルでスキップされる（冪等）。

---

## 4. 構成ファイル

| ファイル | 役割 |
|---|---|
| `wrangler.jsonc` | Workers 名・互換フラグ（`nodejs_compat`）・D1 バインディング（`DB`）・アセット |
| `open-next.config.ts` | OpenNext（Cloudflare アダプタ）の設定 |
| `next.config.ts` | `initOpenNextCloudflareForDev()` で `next dev` のローカルバインディングを有効化 |
| `drizzle.config.ts` | スキーマ → マイグレーション SQL の生成設定（適用は wrangler） |
| `cloudflare-env.d.ts` | `env.DB`（D1Database）の型。`npm run cf-typegen` でも生成可能 |

---

## 5. 補足・既知の制約

- **`better-sqlite3` は廃止**: ローカルファイル SQLite は使わず、ローカルでも D1 エミュレーションを用いる。
- **シードのパスワード**: デモ用に全アカウント `password`（bcrypt ハッシュ）。本番投入時は
  シードを使わず管理画面からユーザーを作成するか、シード後すぐにパスワードを変更すること。
- D1 はリクエストコンテキスト経由でのみアクセスできるため、DB クライアントはモジュール
  シングルトンにできない。各サーバー処理の先頭で `const db = getDb();` のように取得する。
