import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit はスキーマ → マイグレーション SQL の「生成」にのみ使う
 * （`npm run db:generate`）。D1 への適用は wrangler が行う。
 * 生成される SQL は素の SQLite DDL で、そのまま D1 に適用できる。
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
} satisfies Config;
