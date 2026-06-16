import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * リクエストスコープの Cloudflare D1 バインディング（env.DB）から
 * Drizzle クライアントを生成する。
 *
 * D1 はリクエストコンテキスト経由でのみアクセスできるため、モジュール
 * シングルトンにはできない。各サーバー処理の先頭で `const db = getDb();`
 * のように取得して使う。
 */
export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}

export { schema };
