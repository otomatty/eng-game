import "server-only";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { loginAttempts } from "@/db/schema";
import {
  isLocked,
  rateLimitKey,
  resolveRateLimitConfig,
  type AttemptState,
} from "./rate-limit";

/**
 * ログイン総当たり対策（レート制限）の副作用層。
 *
 * 判定・次状態の算出は純粋ロジック（[`rate-limit.ts`](./rate-limit.ts)）に委譲し、
 * ここでは D1 への読み書き・クライアント IP の取得・現在時刻の取得といった副作用のみを担う
 * （CLAUDE.md「純粋ロジックは分離」/ Issue #5）。
 */

/**
 * リクエストヘッダからクライアント IP を取得する。
 * Cloudflare の `cf-connecting-ip` を最優先し、`x-forwarded-for` の先頭へフォールバックする。
 * 取得できない場合は "unknown"（少なくともメール単位での制限は効く）。
 */
async function getClientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip");
  if (cf && cf.trim() !== "") return cf.trim();
  const xff = h.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first && first !== "") return first;
  return "unknown";
}

/** DB の行（Date）を純粋ロジック用の状態（ms エポック）へ変換する。 */
function toState(row: typeof loginAttempts.$inferSelect | undefined): AttemptState | null {
  if (!row) return null;
  return {
    failureCount: row.failureCount,
    firstFailureAt: row.firstFailureAt.getTime(),
    lockedUntil: row.lockedUntil ? row.lockedUntil.getTime() : null,
  };
}

/** 現在のレート制限状況。`blocked` のとき `retryAfterMs` に解除までの残り時間。 */
export interface LoginRateLimitStatus {
  blocked: boolean;
  retryAfterMs: number;
  /** 後続の記録・リセットで再利用するキー。 */
  key: string;
}

/**
 * ログイン試行が許可されるか（=現在ロックされていないか）を判定する。
 * パスワード検証より前に呼ぶ。
 */
export async function checkLoginRateLimit(
  email: string,
): Promise<LoginRateLimitStatus> {
  const ip = await getClientIp();
  const key = rateLimitKey(ip, email);
  const db = getDb();
  const row = (
    await db.select().from(loginAttempts).where(eq(loginAttempts.id, key)).limit(1)
  )[0];
  const { locked, retryAfterMs } = isLocked(toState(row), Date.now());
  return { blocked: locked, retryAfterMs, key };
}

/**
 * ログイン失敗を 1 件記録する。
 *
 * 並行する失敗を取りこぼさない（= バーストを 1 回として数えてロックを回避されない）ため、
 * 読み取り→計算→書き込みではなく、単一の条件付き UPSERT で原子的に
 * インクリメント／窓リセット／ロック判定を行う。SQL の遷移は純粋関数
 * [`registerFailure`](./rate-limit.ts) と一致させており、その単体テストが仕様の参照となる。
 * D1 の drizzle ドライバは対話的トランザクションを持たないため 1 文で完結させる。
 *
 * 列は drizzle の timestamp モード（= エポック秒）で保存されるため、ここでは秒で計算する。
 */
export async function recordLoginFailure(key: string): Promise<void> {
  const config = resolveRateLimitConfig(process.env);
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowSec = Math.floor(config.windowMs / 1000);
  const lockUntil = now + Math.floor(config.lockMs / 1000);
  const max = config.maxFailures;

  // 既存行が「失効済み（窓を出た／ロック解除済み）」か。失効なら新しい窓で数え直す。
  const expired = sql`(
    (login_attempts.locked_until IS NOT NULL AND ${now} >= login_attempts.locked_until)
    OR (login_attempts.locked_until IS NULL AND ${now} - login_attempts.first_failure_at >= ${windowSec})
  )`;

  await db.run(sql`
    INSERT INTO login_attempts (id, failure_count, first_failure_at, locked_until, updated_at)
    VALUES (${key}, 1, ${now}, CASE WHEN 1 >= ${max} THEN ${lockUntil} ELSE NULL END, ${now})
    ON CONFLICT(id) DO UPDATE SET
      failure_count = CASE WHEN ${expired} THEN 1 ELSE login_attempts.failure_count + 1 END,
      first_failure_at = CASE WHEN ${expired} THEN ${now} ELSE login_attempts.first_failure_at END,
      locked_until = CASE
        WHEN ${expired} THEN (CASE WHEN 1 >= ${max} THEN ${lockUntil} ELSE NULL END)
        WHEN login_attempts.failure_count + 1 >= ${max} THEN ${lockUntil}
        ELSE login_attempts.locked_until
      END,
      updated_at = ${now}
  `);

  // 後始末（opportunistic cleanup）: 失効済みの行を全件削除し、テーブルの無制限な増殖を防ぐ。
  // 失敗（=書き込み）が起きたときだけ走るため自己抑制的で、専用のスケジューラを必要としない。
  // 直前に upsert した本キーの行は新鮮（失効していない）ため削除対象にならない。
  // （大規模化する場合は first_failure_at / locked_until にインデックスを検討する。）
  await purgeExpiredLoginAttempts(now, windowSec);
}

/** 失効済み（窓を出た／ロック解除済み）のレート制限行を削除する。 */
async function purgeExpiredLoginAttempts(
  now: number,
  windowSec: number,
): Promise<void> {
  const db = getDb();
  await db.run(sql`
    DELETE FROM login_attempts
    WHERE (locked_until IS NOT NULL AND ${now} >= locked_until)
       OR (locked_until IS NULL AND ${now} >= first_failure_at + ${windowSec})
  `);
}

/** ログイン成功時にカウンタをリセットする（行を削除）。 */
export async function resetLoginRateLimit(key: string): Promise<void> {
  const db = getDb();
  await db.delete(loginAttempts).where(eq(loginAttempts.id, key));
}

/** 残り時間（ms）を「約 N 分」の日本語表記にする（ユーザー向けメッセージ用）。 */
export function formatRetryAfter(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  if (minutes <= 1) return "しばらく";
  return `約${minutes}分`;
}
