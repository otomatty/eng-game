import { describe, it, expect } from "vitest";
import {
  buildPrerequisiteMap,
  clampPercent,
  computeSkillNodeFlags,
  scoreQuestsByTargetSkills,
  selectBestRate,
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
