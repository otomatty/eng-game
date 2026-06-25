import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { loginAttempts } from "@/db/schema";
import {
  isLocked,
  rateLimitKey,
  registerFailure,
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
 * ログイン失敗を 1 件記録する（窓・しきい値・ロックは純粋ロジックが算出）。
 * 既存行があれば更新、なければ作成（upsert）。
 */
export async function recordLoginFailure(key: string): Promise<void> {
  const config = resolveRateLimitConfig(process.env);
  const db = getDb();
  const row = (
    await db.select().from(loginAttempts).where(eq(loginAttempts.id, key)).limit(1)
  )[0];
  const now = Date.now();
  const next = registerFailure(toState(row), now, config);

  const values = {
    failureCount: next.failureCount,
    firstFailureAt: new Date(next.firstFailureAt),
    lockedUntil: next.lockedUntil === null ? null : new Date(next.lockedUntil),
    updatedAt: new Date(now),
  };
  await db
    .insert(loginAttempts)
    .values({ id: key, ...values })
    .onConflictDoUpdate({ target: loginAttempts.id, set: values });
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
