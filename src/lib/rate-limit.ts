/**
 * ログイン総当たり対策（レート制限）の純粋ロジック。
 *
 * 副作用なし・DB 非依存。「IP + メール」単位の試行状態（失敗カウンタと窓・ロック）を
 * 受け取り、ブロック可否・次状態を算出する。DB アクセスやヘッダ取得などの副作用は
 * [`login-rate-limit.ts`](./login-rate-limit.ts) 側に分離し、ここは単体テストで網羅する
 * （CLAUDE.md 0 章「仕様 → テスト → 実装」/ Issue #5）。
 *
 * 時刻はすべてミリ秒エポック（`Date.now()` 互換）で扱う。
 */

/** レート制限のしきい値・窓・ロック時間（環境変数で調整可能）。 */
export interface RateLimitConfig {
  /** この回数の失敗に達するとロックする（しきい値）。 */
  maxFailures: number;
  /** 失敗カウントを集計する時間窓（ミリ秒）。窓を過ぎた失敗はリセットされる。 */
  windowMs: number;
  /** しきい値到達後にブロックする時間（ミリ秒）。 */
  lockMs: number;
}

/** 「IP + メール」単位の試行状態（DB に永続化する値の純粋表現）。 */
export interface AttemptState {
  /** 現在の窓における連続失敗回数。 */
  failureCount: number;
  /** 現在の窓の起点（最初の失敗時刻、ミリ秒エポック）。 */
  firstFailureAt: number;
  /** ロック解除時刻（ミリ秒エポック）。ロックされていなければ null。 */
  lockedUntil: number | null;
}

/** 既定値: 15 分の窓で 5 回失敗したら 15 分ロック。 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
};

/** 文字列を正の整数として解釈する。不正・0 以下は fallback。 */
function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

/**
 * 環境変数からレート制限設定を解決する。
 * - `LOGIN_RATE_LIMIT_MAX_FAILURES`: しきい値（回）。既定 5。
 * - `LOGIN_RATE_LIMIT_WINDOW_SEC`: 窓（秒）。既定 900（15 分）。
 * - `LOGIN_RATE_LIMIT_LOCK_SEC`: ロック時間（秒）。既定 900（15 分）。
 *
 * 不正値・未設定時は既定値にフォールバックする（堅牢性のため）。
 */
export function resolveRateLimitConfig(
  env: Record<string, string | undefined>,
): RateLimitConfig {
  return {
    maxFailures: parsePositiveInt(
      env.LOGIN_RATE_LIMIT_MAX_FAILURES,
      DEFAULT_RATE_LIMIT.maxFailures,
    ),
    windowMs:
      parsePositiveInt(
        env.LOGIN_RATE_LIMIT_WINDOW_SEC,
        DEFAULT_RATE_LIMIT.windowMs / 1000,
      ) * 1000,
    lockMs:
      parsePositiveInt(
        env.LOGIN_RATE_LIMIT_LOCK_SEC,
        DEFAULT_RATE_LIMIT.lockMs / 1000,
      ) * 1000,
  };
}

/** 「IP + メール」からレート制限のキーを組み立てる。 */
export function rateLimitKey(ip: string, email: string): string {
  return `${ip}|${email.trim().toLowerCase()}`;
}

/**
 * 現在ロック中かどうかを判定する（パスワード検証より前に呼ぶ）。
 * - ロック時刻が未来なら blocked。`retryAfterMs` は解除までの残り時間。
 * - ロックなし・期限切れなら未ブロック（`retryAfterMs` は 0）。
 */
export function isLocked(
  state: AttemptState | null,
  now: number,
): { locked: boolean; retryAfterMs: number } {
  if (state?.lockedUntil == null) {
    return { locked: false, retryAfterMs: 0 };
  }
  if (now < state.lockedUntil) {
    return { locked: true, retryAfterMs: state.lockedUntil - now };
  }
  return { locked: false, retryAfterMs: 0 };
}

/**
 * 現在の試行状態が「失効済み（窓を出た／ロックが解除済み）」かどうか。
 * 失効していれば次の失敗は新しい窓として数え直す。
 */
function isExpired(
  state: AttemptState,
  now: number,
  config: RateLimitConfig,
): boolean {
  if (state.lockedUntil !== null) return now >= state.lockedUntil;
  return now - state.firstFailureAt >= config.windowMs;
}

/**
 * ログイン失敗を 1 件記録した後の次状態を返す（純粋）。
 * - 状態なし／窓失効／ロック解除済みなら、新しい窓で `failureCount = 1`。
 * - 窓内ならインクリメント。`maxFailures` 到達でロック（`lockedUntil = now + lockMs`）。
 */
export function registerFailure(
  state: AttemptState | null,
  now: number,
  config: RateLimitConfig,
): AttemptState {
  const startFresh = state === null || isExpired(state, now, config);
  if (startFresh) {
    const failureCount = 1;
    return {
      failureCount,
      firstFailureAt: now,
      lockedUntil: failureCount >= config.maxFailures ? now + config.lockMs : null,
    };
  }
  const failureCount = state.failureCount + 1;
  return {
    failureCount,
    firstFailureAt: state.firstFailureAt,
    lockedUntil:
      failureCount >= config.maxFailures ? now + config.lockMs : state.lockedUntil,
  };
}

/**
 * 現在の窓で残り何回失敗できるか（0 以上）。
 * 状態なし／失効済みなら満タン（`maxFailures`）。
 */
export function remainingAttempts(
  state: AttemptState | null,
  now: number,
  config: RateLimitConfig,
): number {
  if (state === null || isExpired(state, now, config)) return config.maxFailures;
  return Math.max(0, config.maxFailures - state.failureCount);
}
