import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { buildSeedSql } from "./seed-data";

/**
 * D1 投入用のシード SQL（drizzle/seed.sql）を生成する。
 *
 * 生成した SQL は次のコマンドで投入する:
 *   npm run db:seed:local   # ローカル D1（miniflare）
 *   npm run db:seed:remote  # 本番 D1
 *
 * パスワードはデモ用に全アカウント "password"（bcrypt ハッシュを埋め込む）。
 */
const passwordHash = bcrypt.hashSync("password", 10);
const sql = `-- このファイルは \`npm run db:seed:gen\` で自動生成されます。直接編集しないでください。\n${buildSeedSql(
  passwordHash,
)}`;

const outDir = path.join(process.cwd(), "drizzle");
const outPath = path.join(outDir, "seed.sql");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, sql, "utf8");

console.log(`✅ seed SQL を生成しました: ${outPath}`);
console.log("   投入: npm run db:seed:local  /  npm run db:seed:remote");
console.log("   デモ用パスワードは全アカウント 'password'");
