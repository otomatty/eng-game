/**
 * 純粋ドメインロジック（副作用なし・DB 非依存）
 *
 * DB アクセスを伴う処理（[`domain.ts`](./domain.ts)）から「判定・計算」の中核だけを
 * 切り出したもの。ここに集約することで、正常系・異常系・境界値を単体テストで網羅できる。
 */

/** key ごとに value をまとめた Map を作る小ヘルパー */
function groupValuesByKey<T>(
  items: readonly T[],
  keyOf: (item: T) => number,
  valueOf: (item: T) => number,
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const item of items) {
    const key = keyOf(item);
    const arr = map.get(key) ?? [];
    arr.push(valueOf(item));
    map.set(key, arr);
  }
  return map;
}

export interface RateTierInput {
  id: number;
  estimatedRate: number;
}

export interface RateTierSkillInput {
  rateTierId: number;
  skillId: number;
}

/**
 * 想定単価を算出する。
 * 「必要スキルをすべて習得済み」の単価帯のうち、最大の estimatedRate を返す。
 * - 条件スキルが未設定（required が空）の単価帯は到達扱いにしない。
 * - 到達できる単価帯が無ければ 0。
 */
export function selectBestRate(
  tiers: readonly RateTierInput[],
  tierSkills: readonly RateTierSkillInput[],
  acquired: ReadonlySet<number>,
): number {
  const requiredByTier = groupValuesByKey(
    tierSkills,
    (r) => r.rateTierId,
    (r) => r.skillId,
  );

  let best = 0;
  for (const tier of tiers) {
    const required = requiredByTier.get(tier.id) ?? [];
    if (required.length === 0) continue;
    const reached = required.every((skillId) => acquired.has(skillId));
    if (reached && tier.estimatedRate > best) best = tier.estimatedRate;
  }
  return best;
}

export interface SkillDependencyInput {
  prerequisiteSkillId: number;
  unlockedSkillId: number;
}

/** 「開放されるスキル ID → その前提スキル ID 配列」の Map を作る */
export function buildPrerequisiteMap(
  deps: readonly SkillDependencyInput[],
): Map<number, number[]> {
  return groupValuesByKey(
    deps,
    (d) => d.unlockedSkillId,
    (d) => d.prerequisiteSkillId,
  );
}

export interface SkillNodeFlags {
  acquired: boolean;
  /** 未習得 かつ 前提をすべて満たす =「次に開放可能」 */
  unlockable: boolean;
  prerequisiteIds: number[];
}

/** 1 スキルの習得状態・開放可否を判定する */
export function computeSkillNodeFlags(
  skillId: number,
  prerequisiteMap: ReadonlyMap<number, number[]>,
  acquired: ReadonlySet<number>,
): SkillNodeFlags {
  const prerequisiteIds = prerequisiteMap.get(skillId) ?? [];
  const isAcquired = acquired.has(skillId);
  const unlockable =
    !isAcquired && prerequisiteIds.every((p) => acquired.has(p));
  return { acquired: isAcquired, unlockable, prerequisiteIds };
}

export interface QuestSkillInput {
  questId: number;
  skillId: number;
}

/**
 * 「次の一手」候補クエストを、対象スキルへの合致数でスコアリングして並べる。
 * - excludeQuestIds（完了/挑戦中など）は除外。
 * - 合致が 1 つ以上あるものだけを対象とし、合致数 降順 → id 昇順で安定ソート。
 */
export function scoreQuestsByTargetSkills<T extends { id: number }>(
  quests: readonly T[],
  questSkills: readonly QuestSkillInput[],
  targetSkillIds: ReadonlySet<number>,
  excludeQuestIds: ReadonlySet<number>,
): T[] {
  const skillsByQuest = groupValuesByKey(
    questSkills,
    (r) => r.questId,
    (r) => r.skillId,
  );

  return quests
    .filter((quest) => !excludeQuestIds.has(quest.id))
    .map((quest) => {
      const grants = skillsByQuest.get(quest.id) ?? [];
      const matched = grants.filter((sid) => targetSkillIds.has(sid)).length;
      return { quest, matched };
    })
    .filter((scored) => scored.matched > 0)
    .sort((a, b) => b.matched - a.matched || a.quest.id - b.quest.id)
    .map((scored) => scored.quest);
}

/** パーセンテージ値を 0〜100 の整数に丸める（プログレスバー表示用） */
export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
