import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

/** アプリ全体で扱う Drizzle クライアントの型。 */
export type Database = DrizzleD1Database<typeof schema>;

/**
 * テスト用の DB 差し替えフック（本番経路では常に undefined）。
 *
 * D1 はリクエストコンテキスト経由でしか触れず本番では実 DB を使うが、
 * 統合テストではインメモリ SQLite を注入して `getDb()` の戻り値を差し替える
 * （Issue #8 / `src/test/integration` 参照）。テスト以外からは設定されない。
 */
let testDatabase: Database | undefined;

/**
 * @internal テスト専用: `getDb()` が返す DB を差し替える（`undefined` で解除）。
 * 統合テストの `beforeEach` でインメモリ DB を注入し、`afterEach` で解除する。
 */
export function setTestDatabase(db: Database | undefined): void {
  testDatabase = db;
}

/**
 * リクエストスコープの Cloudflare D1 バインディング（env.DB）から
 * Drizzle クライアントを生成する。
 *
 * D1 はリクエストコンテキスト経由でのみアクセスできるため、モジュール
 * シングルトンにはできない。各サーバー処理の先頭で `const db = getDb();`
 * のように取得して使う。
 *
 * テスト時に `setTestDatabase` で注入された DB があればそれを優先して返す。
 */
export function getDb(): Database {
  if (testDatabase) return testDatabase;
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}

export { schema };
