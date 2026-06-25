import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { type Database } from "@/db";

/**
 * 統合テスト用のインメモリ SQLite データベースを生成する（Issue #8）。
 *
 * 本番は Cloudflare D1（`drizzle-orm/d1`）だが、D1 はリクエストコンテキスト
 * 経由でしか触れずユニットテストから扱いづらい。D1 は SQLite 互換であり、
 * Drizzle のスキーマ・クエリビルダは両ドライバで共通のため、テストでは
 * `better-sqlite3` の `:memory:` DB へ同じ Drizzle スキーマ／マイグレーションを
 * 適用して代替する。型は本番と揃えるため `Database`（= D1 版）として扱う
 * （クエリ API は同一。`as` はテスト基盤に閉じる）。
 */

const here = dirname(fileURLToPath(import.meta.url));
// drizzle/migrations はリポジトリルート直下。src/test/integration から辿る。
const MIGRATIONS_FOLDER = resolve(here, "../../../drizzle/migrations");

export interface TestDb {
  db: Database;
  /** 接続を閉じる（テスト終了時に呼ぶ）。 */
  close: () => void;
}

/**
 * マイグレーション適用済みの空のインメモリ DB を返す。
 * 各テストで新規生成して状態を隔離する。
 */
export function createTestDb(): TestDb {
  const sqlite = new BetterSqlite3(":memory:");
  // 外部キー制約（ON DELETE CASCADE 等）を D1 と同様に有効化する。
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema }) as unknown as Database;
  migrate(db as unknown as Parameters<typeof migrate>[0], {
    migrationsFolder: MIGRATIONS_FOLDER,
  });

  return {
    db,
    close: () => {
      sqlite.close();
    },
  };
}
