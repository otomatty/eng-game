import type { D1Database } from "@cloudflare/workers-types";

/**
 * Cloudflare のバインディング型。`getCloudflareContext().env` の型として使われる。
 * wrangler.jsonc の d1_databases.binding と対応させること。
 *
 * `npm run cf-typegen`（wrangler types）でも生成できるが、CI を wrangler 非依存に
 * 保つため最小限の定義をここに固定している。
 */
declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

export {};
