import { describe, it, expect } from "vitest";
import {
  sqlValue,
  computeEstimatedRate,
  buildSeedSql,
  TEAMS,
  SKILL_DEFS,
  QUEST_DEFS,
  QUESTION_DEFS,
  ENGINEER_DEFS,
  TIER_DEFS,
} from "./seed-data";

/**
 * 仕様（観点表）
 *
 * D1 はリクエストスコープのバインディングのため、シードは静的 SQL を生成して
 * `wrangler d1 execute --file` で投入する。ここではその SQL を組み立てる純粋関数を検証する。
 *
 * - sqlValue: SQL リテラル化（文字列のクォート/エスケープ・数値・真偽値・null）
 *   - 正常系: 文字列→'...'、数値→そのまま、真偽値→1/0、null→NULL
 *   - 異常系/境界: シングルクォートを含む文字列のエスケープ、空文字、日本語
 * - computeEstimatedRate: 到達済み単価帯の最大 rate（条件スキル全習得で到達）
 *   - 正常系: 必要スキルをすべて満たす最上位の rate
 *   - 境界: スキル0で0、条件スキルが空の tier は到達扱いにしない、部分習得は下位のみ
 * - buildSeedSql: データセット全体を冪等な SQL へ（DELETE 先頭・全件 INSERT・ハッシュ埋め込み）
 */

describe("sqlValue: SQL リテラル化", () => {
  it("文字列をシングルクォートで囲む", () => {
    expect(sqlValue("hello")).toBe("'hello'");
  });

  it("文字列内のシングルクォートを '' にエスケープする", () => {
    expect(sqlValue("O'Brien")).toBe("'O''Brien'");
  });

  it("日本語の文字列を安全に囲む", () => {
    expect(sqlValue("アーキテクチャ設計")).toBe("'アーキテクチャ設計'");
  });

  it("空文字は空のクォートになる", () => {
    expect(sqlValue("")).toBe("''");
  });

  it("数値はそのまま出力する", () => {
    expect(sqlValue(100)).toBe("100");
    expect(sqlValue(0)).toBe("0");
  });

  it("真偽値は 1 / 0 に変換する", () => {
    expect(sqlValue(true)).toBe("1");
    expect(sqlValue(false)).toBe("0");
  });

  it("null は NULL に変換する", () => {
    expect(sqlValue(null)).toBe("NULL");
  });
});

describe("computeEstimatedRate: 想定単価の算出", () => {
  const tiers = TIER_DEFS;

  it("必要スキルをすべて満たす最上位単価帯の rate を返す", () => {
    const all = new Set(tiers.flatMap((t) => t.skills));
    const best = computeEstimatedRate(all, tiers);
    const maxRate = Math.max(...tiers.map((t) => t.rate));
    expect(best).toBe(maxRate);
  });

  it("習得スキルが無ければ 0 を返す", () => {
    expect(computeEstimatedRate(new Set<string>(), tiers)).toBe(0);
  });

  it("最下位単価帯の条件のみ満たすとその rate を返す（部分習得）", () => {
    const junior = tiers[0];
    if (!junior) throw new Error("tier 定義が空です");
    const acquired = new Set(junior.skills);
    expect(computeEstimatedRate(acquired, tiers)).toBe(junior.rate);
  });

  it("条件スキルが空の単価帯は到達扱いにしない", () => {
    const withEmpty = [{ name: "謎", rate: 999, order: 9, desc: "", skills: [] }];
    expect(computeEstimatedRate(new Set(["X"]), withEmpty)).toBe(0);
  });
});

describe("buildSeedSql: 冪等な投入 SQL の生成", () => {
  const hash = "$2a$10$DUMMYHASHDUMMYHASHDUMMYHA";
  const sql = buildSeedSql(hash);

  it("冪等性のため DELETE 文から始まる", () => {
    expect(sql.trimStart().startsWith("DELETE FROM")).toBe(true);
  });

  it("全チーム・全スキル・全クエスト・全エンジニア＋管理者を INSERT する", () => {
    expect((sql.match(/INSERT INTO `teams`/g) ?? []).length).toBe(TEAMS.length);
    expect((sql.match(/INSERT INTO `skills`/g) ?? []).length).toBe(
      Object.keys(SKILL_DEFS).length,
    );
    expect((sql.match(/INSERT INTO `quests`/g) ?? []).length).toBe(
      QUEST_DEFS.length,
    );
    // 管理者1 + エンジニア
    expect((sql.match(/INSERT INTO `users`/g) ?? []).length).toBe(
      ENGINEER_DEFS.length + 1,
    );
  });

  it("パスワードハッシュを users の INSERT に埋め込む", () => {
    expect(sql).toContain(hash);
  });

  it("管理者アカウントを含む", () => {
    expect(sql).toContain("'admin@example.com'");
  });

  it("生成した SQL にエスケープ漏れ（裸のシングルクォート連結）が無い", () => {
    // 文字列リテラルは必ず偶数個のシングルクォートで閉じられる
    const quotes = (sql.match(/'/g) ?? []).length;
    expect(quotes % 2).toBe(0);
  });

  it("テスト型クエストの設問・選択肢を INSERT する（Issue #7）", () => {
    expect((sql.match(/INSERT INTO `quest_questions`/g) ?? []).length).toBe(
      QUESTION_DEFS.length,
    );
    const choiceCount = QUESTION_DEFS.reduce(
      (sum, q) => sum + (q.kind === "single" ? (q.choices?.length ?? 0) : 0),
      0,
    );
    expect(
      (sql.match(/INSERT INTO `quest_question_choices`/g) ?? []).length,
    ).toBe(choiceCount);
  });

  it("冪等性のため設問・選択肢も DELETE 対象に含む", () => {
    expect(sql).toContain("DELETE FROM `quest_questions`;");
    expect(sql).toContain("DELETE FROM `quest_question_choices`;");
  });
});

describe("QUESTION_DEFS: 設問データの健全性", () => {
  it("各設問は既知のクエストに紐づく", () => {
    const titles = new Set(QUEST_DEFS.map((q) => q.title));
    for (const q of QUESTION_DEFS) {
      expect(titles.has(q.questTitle)).toBe(true);
    }
  });

  it("選択式は2つ以上の選択肢と正解1つ以上を持つ", () => {
    for (const q of QUESTION_DEFS.filter((q) => q.kind === "single")) {
      const choices = q.choices ?? [];
      expect(choices.length).toBeGreaterThanOrEqual(2);
      expect(choices.some((c) => c.correct)).toBe(true);
    }
  });

  it("完全一致は空でない正解文字列を持つ", () => {
    for (const q of QUESTION_DEFS.filter((q) => q.kind === "text")) {
      expect((q.correctText ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("設問が紐づくクエストはすべてテスト型である", () => {
    const verificationByTitle = new Map(
      QUEST_DEFS.map((q) => [q.title, q.verification]),
    );
    for (const q of QUESTION_DEFS) {
      expect(verificationByTitle.get(q.questTitle)).toBe("test");
    }
  });
});
