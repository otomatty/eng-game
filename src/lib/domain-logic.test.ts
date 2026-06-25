import { describe, it, expect } from "vitest";
import {
  buildPrerequisiteMap,
  clampPercent,
  computeSkillNodeFlags,
  gradeQuestion,
  gradeTest,
  normalizeAnswer,
  parseChoiceLines,
  scoreQuestsByTargetSkills,
  selectBestRate,
  type GradableQuestion,
  type QuestSkillInput,
  type RateTierInput,
  type RateTierSkillInput,
  type SkillDependencyInput,
} from "./domain-logic";

/**
 * 観点表（仕様検討の成果）:
 * - selectBestRate: 正常系=最大到達単価 / 異常系=条件未設定は非到達 / 境界値=到達なし=0
 * - computeSkillNodeFlags: 正常系=前提充足で開放可 / 異常系=習得済みは開放対象外 / 境界値=前提なし
 * - scoreQuestsByTargetSkills: 正常系=合致数でソート / 異常系=除外・非合致 / 境界値=空入力
 * - clampPercent: 境界値=下限/上限/NaN
 */

describe("selectBestRate", () => {
  const tiers: RateTierInput[] = [
    { id: 1, estimatedRate: 40 },
    { id: 2, estimatedRate: 60 },
    { id: 3, estimatedRate: 80 },
  ];
  const tierSkills: RateTierSkillInput[] = [
    { rateTierId: 1, skillId: 10 },
    { rateTierId: 2, skillId: 10 },
    { rateTierId: 2, skillId: 20 },
    { rateTierId: 3, skillId: 30 },
  ];

  describe("正常系", () => {
    it("必要スキルを全て満たす単価帯のうち最大の estimatedRate を返す", () => {
      const acquired = new Set([10, 20]);
      expect(selectBestRate(tiers, tierSkills, acquired)).toBe(60);
    });

    it("低い単価帯のみ満たす場合はその単価帯の値を返す", () => {
      const acquired = new Set([10]);
      expect(selectBestRate(tiers, tierSkills, acquired)).toBe(40);
    });

    it("複数の高単価帯を満たすとき最大値（=昇順でない到達でも最大）を返す", () => {
      const acquired = new Set([10, 20, 30]);
      expect(selectBestRate(tiers, tierSkills, acquired)).toBe(80);
    });
  });

  describe("異常系", () => {
    it("条件スキルが未設定の単価帯は到達扱いにしない", () => {
      const tiersWithEmpty: RateTierInput[] = [{ id: 99, estimatedRate: 200 }];
      const acquired = new Set([10, 20, 30]);
      // tierId 99 に対応する rateTierSkills が無い → 到達しない
      expect(selectBestRate(tiersWithEmpty, [], acquired)).toBe(0);
    });

    it("必要スキルを一部しか満たさない単価帯は到達扱いにしない", () => {
      const acquired = new Set([10]); // tier2 は 10,20 が必要だが 20 が無い
      expect(selectBestRate(tiers, tierSkills, acquired)).toBe(40);
    });
  });

  describe("境界値", () => {
    it("習得スキルが空なら 0 を返す", () => {
      expect(selectBestRate(tiers, tierSkills, new Set())).toBe(0);
    });

    it("単価帯が空なら 0 を返す", () => {
      expect(selectBestRate([], tierSkills, new Set([10, 20, 30]))).toBe(0);
    });
  });
});

describe("buildPrerequisiteMap / computeSkillNodeFlags", () => {
  const deps: SkillDependencyInput[] = [
    { prerequisiteSkillId: 1, unlockedSkillId: 2 },
    { prerequisiteSkillId: 2, unlockedSkillId: 3 },
    { prerequisiteSkillId: 4, unlockedSkillId: 3 }, // 3 は 2 と 4 の両方が前提
  ];
  const prereqMap = buildPrerequisiteMap(deps);

  describe("正常系", () => {
    it("前提を全て満たす未習得スキルは unlockable になる", () => {
      const acquired = new Set([1]);
      const node = computeSkillNodeFlags(2, prereqMap, acquired);
      expect(node).toEqual({
        acquired: false,
        unlockable: true,
        prerequisiteIds: [1],
      });
    });

    it("複数前提のうち全て満たせば unlockable になる", () => {
      const acquired = new Set([2, 4]);
      const node = computeSkillNodeFlags(3, prereqMap, acquired);
      expect(node.unlockable).toBe(true);
      expect(node.prerequisiteIds.sort()).toEqual([2, 4]);
    });
  });

  describe("異常系", () => {
    it("習得済みスキルは unlockable にならない", () => {
      const acquired = new Set([1, 2]);
      const node = computeSkillNodeFlags(2, prereqMap, acquired);
      expect(node.acquired).toBe(true);
      expect(node.unlockable).toBe(false);
    });

    it("前提を一部しか満たさないスキルは unlockable にならない", () => {
      const acquired = new Set([2]); // 3 は 2 と 4 が前提だが 4 が無い
      const node = computeSkillNodeFlags(3, prereqMap, acquired);
      expect(node.unlockable).toBe(false);
    });
  });

  describe("境界値", () => {
    it("前提が無いスキルは習得していなければ即 unlockable", () => {
      const node = computeSkillNodeFlags(1, prereqMap, new Set());
      expect(node).toEqual({
        acquired: false,
        unlockable: true,
        prerequisiteIds: [],
      });
    });
  });
});

describe("scoreQuestsByTargetSkills", () => {
  interface Quest {
    id: number;
    title: string;
  }
  const quests: Quest[] = [
    { id: 1, title: "A" },
    { id: 2, title: "B" },
    { id: 3, title: "C" },
  ];
  const questSkills: QuestSkillInput[] = [
    { questId: 1, skillId: 10 },
    { questId: 2, skillId: 10 },
    { questId: 2, skillId: 20 }, // quest2 は 2 つ合致しうる
    { questId: 3, skillId: 99 }, // 対象外スキルのみ
  ];

  describe("正常系", () => {
    it("合致数の降順、同数なら id 昇順で並ぶ", () => {
      const result = scoreQuestsByTargetSkills(
        quests,
        questSkills,
        new Set([10, 20]),
        new Set(),
      );
      expect(result.map((q) => q.id)).toEqual([2, 1]);
    });
  });

  describe("異常系", () => {
    it("除外対象（完了/挑戦中）のクエストは結果に含まれない", () => {
      const result = scoreQuestsByTargetSkills(
        quests,
        questSkills,
        new Set([10, 20]),
        new Set([2]),
      );
      expect(result.map((q) => q.id)).toEqual([1]);
    });

    it("対象スキルに 1 つも合致しないクエストは含まれない", () => {
      const result = scoreQuestsByTargetSkills(
        quests,
        questSkills,
        new Set([99]),
        new Set(),
      );
      expect(result.map((q) => q.id)).toEqual([3]);
    });
  });

  describe("境界値", () => {
    it("対象スキルが空なら結果も空", () => {
      const result = scoreQuestsByTargetSkills(
        quests,
        questSkills,
        new Set(),
        new Set(),
      );
      expect(result).toEqual([]);
    });

    it("クエストが空なら結果も空", () => {
      const result = scoreQuestsByTargetSkills(
        [],
        questSkills,
        new Set([10]),
        new Set(),
      );
      expect(result).toEqual([]);
    });
  });
});

describe("clampPercent", () => {
  describe("正常系", () => {
    it("範囲内の値は四捨五入した整数を返す", () => {
      expect(clampPercent(42.4)).toBe(42);
      expect(clampPercent(42.5)).toBe(43);
    });
  });

  describe("境界値", () => {
    it("下限: 0 未満は 0 に丸める", () => {
      expect(clampPercent(-10)).toBe(0);
    });
    it("上限: 100 超は 100 に丸める", () => {
      expect(clampPercent(150)).toBe(100);
    });
    it("ちょうど 0 / 100 はそのまま", () => {
      expect(clampPercent(0)).toBe(0);
      expect(clampPercent(100)).toBe(100);
    });
  });

  describe("異常系", () => {
    it("NaN は 0 にフォールバックする", () => {
      expect(clampPercent(Number.NaN)).toBe(0);
    });
  });
});

/**
 * 観点表（テスト型クエストの採点 / Issue #7）:
 * - normalizeAnswer: 前後空白除去・小文字化（境界=空文字・全角は素通り）
 * - gradeQuestion:
 *   - text 正常系=正解一致で合格 / 異常系=不一致・正解未設定 / 境界=大文字小文字・前後空白・undefined
 *   - single 正常系=正解選択肢で合格 / 異常系=誤選択肢・不正id / 境界=空・非数値
 * - gradeTest:
 *   - 正常系=全問正解で合格 / 異常系=一部正解でしきい値未満は不合格
 *   - 境界=しきい値ちょうど / 設問0件は不合格 / 空回答は不合格 / 0%しきい値は1問必要へ丸め
 * - parseChoiceLines: 正常系=*で正解マーク / 境界=空行無視・前後空白・空入力
 */

describe("normalizeAnswer", () => {
  it("前後の空白を除去し小文字化する", () => {
    expect(normalizeAnswer("  Pass  ")).toBe("pass");
  });
  it("空文字はそのまま空文字", () => {
    expect(normalizeAnswer("   ")).toBe("");
  });
});

describe("gradeQuestion", () => {
  describe("text（完全一致）", () => {
    const q: GradableQuestion = {
      id: 1,
      kind: "text",
      correctText: "SELECT",
      choices: [],
    };

    it("正常系: 正規化して一致すれば正解（大文字小文字・前後空白を無視）", () => {
      expect(gradeQuestion(q, "select")).toBe(true);
      expect(gradeQuestion(q, "  Select  ")).toBe(true);
    });

    it("異常系: 不一致は不正解", () => {
      expect(gradeQuestion(q, "update")).toBe(false);
    });

    it("異常系: 正解文字列が未設定（空）なら常に不正解", () => {
      const empty: GradableQuestion = { ...q, correctText: "  " };
      expect(gradeQuestion(empty, "")).toBe(false);
      expect(gradeQuestion(empty, "anything")).toBe(false);
    });

    it("境界値: 提出値 undefined は不正解", () => {
      expect(gradeQuestion(q, undefined)).toBe(false);
    });
  });

  describe("single（選択式）", () => {
    const q: GradableQuestion = {
      id: 2,
      kind: "single",
      correctText: "",
      choices: [
        { id: 10, isCorrect: false },
        { id: 11, isCorrect: true },
        { id: 12, isCorrect: false },
      ],
    };

    it("正常系: 正解の選択肢 id を提出すれば正解", () => {
      expect(gradeQuestion(q, "11")).toBe(true);
    });

    it("異常系: 不正解の選択肢は不正解", () => {
      expect(gradeQuestion(q, "10")).toBe(false);
    });

    it("異常系: 存在しない選択肢 id は不正解", () => {
      expect(gradeQuestion(q, "999")).toBe(false);
    });

    it("境界値: 空・非数値・undefined は不正解", () => {
      expect(gradeQuestion(q, "")).toBe(false);
      expect(gradeQuestion(q, "abc")).toBe(false);
      expect(gradeQuestion(q, undefined)).toBe(false);
    });
  });
});

describe("gradeTest", () => {
  const questions: GradableQuestion[] = [
    {
      id: 1,
      kind: "single",
      correctText: "",
      choices: [
        { id: 10, isCorrect: true },
        { id: 11, isCorrect: false },
      ],
    },
    { id: 2, kind: "text", correctText: "join", choices: [] },
  ];

  describe("正常系", () => {
    it("全問正解（しきい値100）で合格し、ポイント等の更新対象になる", () => {
      const result = gradeTest(questions, { 1: "10", 2: "JOIN" }, 100);
      expect(result.passed).toBe(true);
      expect(result.correct).toBe(2);
      expect(result.total).toBe(2);
      expect(result.requiredCorrect).toBe(2);
    });
  });

  describe("異常系", () => {
    it("一部正解でしきい値（100）未満は不合格", () => {
      const result = gradeTest(questions, { 1: "10", 2: "wrong" }, 100);
      expect(result.passed).toBe(false);
      expect(result.correct).toBe(1);
    });

    it("設問が 0 件のテストは合格にしない（未設定テストの素通り防止）", () => {
      const result = gradeTest([], {}, 100);
      expect(result.passed).toBe(false);
      expect(result.total).toBe(0);
    });

    it("空回答は全問不正解で不合格", () => {
      const result = gradeTest(questions, {}, 100);
      expect(result.passed).toBe(false);
      expect(result.correct).toBe(0);
    });
  });

  describe("境界値", () => {
    it("しきい値ちょうど（2問中1問=50%, threshold50）で合格", () => {
      const result = gradeTest(questions, { 1: "10", 2: "wrong" }, 50);
      expect(result.requiredCorrect).toBe(1);
      expect(result.passed).toBe(true);
    });

    it("しきい値直下（threshold60 で必要2問）は1問正解で不合格", () => {
      const result = gradeTest(questions, { 1: "10", 2: "wrong" }, 60);
      expect(result.requiredCorrect).toBe(2);
      expect(result.passed).toBe(false);
    });

    it("しきい値 0% は最低 1 問必要に丸める（全問不正解では合格しない）", () => {
      const result = gradeTest(questions, {}, 0);
      expect(result.requiredCorrect).toBe(1);
      expect(result.passed).toBe(false);
    });

    it("設問ごとの正誤は返すが、正解そのものは含まない", () => {
      const result = gradeTest(questions, { 1: "11", 2: "join" }, 100);
      expect(result.results).toEqual([
        { questionId: 1, correct: false },
        { questionId: 2, correct: true },
      ]);
    });
  });
});

describe("parseChoiceLines", () => {
  it("正常系: 行頭 * を正解マークとして解釈し、ラベルから取り除く", () => {
    expect(parseChoiceLines("*正しい\n間違い1\n間違い2")).toEqual([
      { label: "正しい", isCorrect: true },
      { label: "間違い1", isCorrect: false },
      { label: "間違い2", isCorrect: false },
    ]);
  });

  it("境界値: 空行・空白のみの行は無視する", () => {
    expect(parseChoiceLines("A\n\n   \nB")).toEqual([
      { label: "A", isCorrect: false },
      { label: "B", isCorrect: false },
    ]);
  });

  it("境界値: 前後の空白・* 直後の空白をトリムする", () => {
    expect(parseChoiceLines("  * 正解 \n  選択肢 ")).toEqual([
      { label: "正解", isCorrect: true },
      { label: "選択肢", isCorrect: false },
    ]);
  });

  it("境界値: 空入力は空配列", () => {
    expect(parseChoiceLines("")).toEqual([]);
    expect(parseChoiceLines("   \n  ")).toEqual([]);
  });

  it("境界値: * のみの行（ラベルが空）は除外する", () => {
    expect(parseChoiceLines("*\n*有効")).toEqual([
      { label: "有効", isCorrect: true },
    ]);
  });
});
