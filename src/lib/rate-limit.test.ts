import { describe, it, expect } from "vitest";
import {
  DEFAULT_RATE_LIMIT,
  isLocked,
  rateLimitKey,
  registerFailure,
  remainingAttempts,
  resolveRateLimitConfig,
  type AttemptState,
  type RateLimitConfig,
} from "./rate-limit";

/**
 * 観点表（仕様検討の成果 / Issue #5）:
 * - resolveRateLimitConfig: 正常系=env を秒→ms に変換 / 異常系=不正値は既定 / 境界=未設定
 * - rateLimitKey: 正常系=IP+メール結合 / 境界=メールの大文字・前後空白を正規化
 * - registerFailure / isLocked:
 *   - 正常系: しきい値内の失敗はブロックしない（その後の成功でログイン可）
 *   - 異常系: しきい値超過で一定時間ブロックされる
 *   - 境界: ちょうどしきい値でロック / 窓の切り替わりでカウンタリセット /
 *           ロック解除時刻の前後 / 成功時（=状態クリア）でリセット
 * - remainingAttempts: 境界=満タン / 1 / 0
 */

// テスト用の小さな設定（3 回失敗で 1 分ロック、窓は 10 秒）
const config: RateLimitConfig = {
  maxFailures: 3,
  windowMs: 10_000,
  lockMs: 60_000,
};
const T0 = 1_000_000; // 任意の基準時刻（ms）

describe("resolveRateLimitConfig", () => {
  describe("正常系", () => {
    it("環境変数（秒）を ms に変換して設定を組み立てる", () => {
      const c = resolveRateLimitConfig({
        LOGIN_RATE_LIMIT_MAX_FAILURES: "10",
        LOGIN_RATE_LIMIT_WINDOW_SEC: "30",
        LOGIN_RATE_LIMIT_LOCK_SEC: "120",
      });
      expect(c).toEqual({ maxFailures: 10, windowMs: 30_000, lockMs: 120_000 });
    });
  });

  describe("境界値", () => {
    it("未設定なら既定値を返す", () => {
      expect(resolveRateLimitConfig({})).toEqual(DEFAULT_RATE_LIMIT);
    });
  });

  describe("異常系", () => {
    it("数値でない・0 以下・小数は既定値にフォールバックする", () => {
      const c = resolveRateLimitConfig({
        LOGIN_RATE_LIMIT_MAX_FAILURES: "abc",
        LOGIN_RATE_LIMIT_WINDOW_SEC: "0",
        LOGIN_RATE_LIMIT_LOCK_SEC: "-5",
      });
      expect(c).toEqual(DEFAULT_RATE_LIMIT);
    });

    it("空文字は既定値にフォールバックする", () => {
      const c = resolveRateLimitConfig({ LOGIN_RATE_LIMIT_MAX_FAILURES: "  " });
      expect(c.maxFailures).toBe(DEFAULT_RATE_LIMIT.maxFailures);
    });
  });
});

describe("rateLimitKey", () => {
  it("IP とメールを結合する", () => {
    expect(rateLimitKey("203.0.113.1", "user@example.com")).toBe(
      "203.0.113.1|user@example.com",
    );
  });

  it("境界値: メールの大文字・前後空白を正規化して同一キーにする", () => {
    expect(rateLimitKey("203.0.113.1", "  USER@Example.com ")).toBe(
      "203.0.113.1|user@example.com",
    );
  });
});

describe("isLocked", () => {
  it("状態なしはブロックしない", () => {
    expect(isLocked(null, T0)).toEqual({ locked: false, retryAfterMs: 0 });
  });

  it("ロック未設定（失敗のみ）はブロックしない", () => {
    const state: AttemptState = {
      failureCount: 2,
      firstFailureAt: T0,
      lockedUntil: null,
    };
    expect(isLocked(state, T0).locked).toBe(false);
  });

  it("異常系: ロック時刻が未来ならブロックし残り時間を返す", () => {
    const state: AttemptState = {
      failureCount: 3,
      firstFailureAt: T0,
      lockedUntil: T0 + 60_000,
    };
    expect(isLocked(state, T0 + 10_000)).toEqual({
      locked: true,
      retryAfterMs: 50_000,
    });
  });

  it("境界値: ロック解除時刻ちょうどはブロックしない", () => {
    const state: AttemptState = {
      failureCount: 3,
      firstFailureAt: T0,
      lockedUntil: T0 + 60_000,
    };
    expect(isLocked(state, T0 + 60_000).locked).toBe(false);
  });
});

describe("registerFailure", () => {
  describe("正常系", () => {
    it("最初の失敗で新しい窓を開始しカウント 1（ロックなし）", () => {
      const next = registerFailure(null, T0, config);
      expect(next).toEqual({
        failureCount: 1,
        firstFailureAt: T0,
        lockedUntil: null,
      });
    });

    it("しきい値未満の連続失敗はインクリメントしブロックしない", () => {
      const s1 = registerFailure(null, T0, config);
      const s2 = registerFailure(s1, T0 + 1_000, config);
      expect(s2.failureCount).toBe(2);
      expect(s2.lockedUntil).toBeNull();
      expect(isLocked(s2, T0 + 1_000).locked).toBe(false);
    });
  });

  describe("異常系", () => {
    it("ちょうどしきい値に達するとロックする（境界）", () => {
      let s: AttemptState | null = null;
      s = registerFailure(s, T0, config); // 1
      s = registerFailure(s, T0 + 1_000, config); // 2
      s = registerFailure(s, T0 + 2_000, config); // 3 = maxFailures
      expect(s.failureCount).toBe(3);
      expect(s.lockedUntil).toBe(T0 + 2_000 + config.lockMs);
      expect(isLocked(s, T0 + 2_000).locked).toBe(true);
    });
  });

  describe("境界値", () => {
    it("窓を過ぎた失敗はカウンタをリセットして 1 から数え直す", () => {
      const s1 = registerFailure(null, T0, config);
      // windowMs ちょうど経過 → 失効
      const s2 = registerFailure(s1, T0 + config.windowMs, config);
      expect(s2.failureCount).toBe(1);
      expect(s2.firstFailureAt).toBe(T0 + config.windowMs);
    });

    it("窓の直前（境界内）はカウントを継続する", () => {
      const s1 = registerFailure(null, T0, config);
      const s2 = registerFailure(s1, T0 + config.windowMs - 1, config);
      expect(s2.failureCount).toBe(2);
    });

    it("ロック解除後の失敗は新しい窓で数え直す", () => {
      let s: AttemptState | null = null;
      s = registerFailure(s, T0, config);
      s = registerFailure(s, T0 + 1_000, config);
      s = registerFailure(s, T0 + 2_000, config); // ロック
      const unlockAt = s.lockedUntil!;
      const after = registerFailure(s, unlockAt, config);
      expect(after.failureCount).toBe(1);
      expect(after.lockedUntil).toBeNull();
    });
  });
});

describe("レート制限の一連の流れ（受け入れ条件）", () => {
  it("正常系: しきい値内で失敗→成功（状態クリア）でログインできる状態に戻る", () => {
    // 2 回失敗（しきい値 3 未満）
    let s: AttemptState | null = registerFailure(null, T0, config);
    s = registerFailure(s, T0 + 1_000, config);
    expect(isLocked(s, T0 + 1_000).locked).toBe(false);
    // 成功時は状態をクリア（= null 相当）。次回は満タン。
    const cleared: AttemptState | null = null;
    expect(remainingAttempts(cleared, T0 + 2_000, config)).toBe(config.maxFailures);
  });

  it("異常系→解除: 連続失敗でブロックし、時間経過で解除される", () => {
    let s: AttemptState | null = null;
    for (let i = 0; i < config.maxFailures; i++) {
      s = registerFailure(s, T0 + i * 1_000, config);
    }
    const at = T0 + (config.maxFailures - 1) * 1_000;
    expect(isLocked(s, at).locked).toBe(true);
    // lockMs 経過後は解除
    expect(isLocked(s, s!.lockedUntil!).locked).toBe(false);
  });
});

describe("remainingAttempts", () => {
  it("境界値: 状態なしは満タン", () => {
    expect(remainingAttempts(null, T0, config)).toBe(3);
  });

  it("境界値: 1 回失敗で残り 2", () => {
    const s = registerFailure(null, T0, config);
    expect(remainingAttempts(s, T0, config)).toBe(2);
  });

  it("境界値: しきい値到達で残り 0", () => {
    let s: AttemptState | null = null;
    for (let i = 0; i < config.maxFailures; i++) {
      s = registerFailure(s, T0 + i * 1_000, config);
    }
    expect(remainingAttempts(s, T0 + 2_000, config)).toBe(0);
  });
});
