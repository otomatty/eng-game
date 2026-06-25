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

// ============ テスト型クエストの採点（純粋関数） ============

export type QuestionKind = "single" | "text";

export interface GradableChoice {
  id: number;
  isCorrect: boolean;
}

export interface GradableQuestion {
  id: number;
  kind: QuestionKind;
  /** kind=text の正解文字列（大小文字・前後空白を無視して比較）。single では未使用。 */
  correctText: string;
  /** kind=single の選択肢。text では空配列。 */
  choices: GradableChoice[];
}

export interface QuestionResult {
  questionId: number;
  correct: boolean;
}

export interface TestGradingResult {
  /** 設問数 */
  total: number;
  /** 正答数 */
  correct: number;
  /** 合格に必要な正答数（しきい値から算出） */
  requiredCorrect: number;
  /** 合否 */
  passed: boolean;
  /** 設問ごとの正誤（正解そのものは含めない） */
  results: QuestionResult[];
}

/** 解答文字列を正規化する（前後空白除去・小文字化）。完全一致採点の比較に用いる。 */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 1 設問を採点する。提出値が未指定/空でも例外を投げず false を返す。
 * - text: 正規化した提出値が正解文字列と一致（正解が空なら常に不正解）。
 * - single: 提出された選択肢 id が「正解の選択肢」であれば正解。
 */
export function gradeQuestion(
  question: GradableQuestion,
  submitted: string | undefined,
): boolean {
  if (question.kind === "text") {
    const expected = normalizeAnswer(question.correctText);
    if (expected === "") return false;
    return normalizeAnswer(submitted ?? "") === expected;
  }
  // single: 提出値は選択肢 id（文字列）
  if (submitted === undefined || submitted.trim() === "") return false;
  const choiceId = Number(submitted);
  if (!Number.isInteger(choiceId)) return false;
  return question.choices.some((c) => c.id === choiceId && c.isCorrect);
}

/**
 * テスト全体を採点し、合否を判定する純粋関数。
 *
 * - `submission` は「設問 id → 提出値」のマップ（single は選択肢 id 文字列、text は入力文字列）。
 * - `passThreshold` は合格に必要な正答率（%）。必要正答数 = ceil(total * threshold/100)。
 * - 設問が 0 件のテストは合格にしない（未設定テストの素通りを防ぐ）。
 */
export function gradeTest(
  questions: readonly GradableQuestion[],
  submission: Readonly<Record<number, string | undefined>>,
  passThreshold: number,
): TestGradingResult {
  const results: QuestionResult[] = questions.map((q) => ({
    questionId: q.id,
    correct: gradeQuestion(q, submission[q.id]),
  }));
  const correct = results.filter((r) => r.correct).length;
  const total = questions.length;
  // しきい値は 1..100 に丸める（0% で全問不正解でも合格、を防ぐ）。
  const threshold = Math.max(1, Math.min(100, Math.round(passThreshold)));
  const requiredCorrect =
    total === 0 ? 0 : Math.max(1, Math.ceil((total * threshold) / 100));
  const passed = total > 0 && correct >= requiredCorrect;
  return { total, correct, requiredCorrect, passed, results };
}

export interface ParsedChoice {
  label: string;
  isCorrect: boolean;
}

/**
 * 管理画面の選択肢入力（1 行 1 選択肢、行頭 `*` が正解マーク）をパースする純粋関数。
 *
 * 例:
 *   ```
 *   *正しい答え
 *   間違い1
 *   間違い2
 *   ```
 * → [{label:"正しい答え", isCorrect:true}, {label:"間違い1", ...}, ...]
 *
 * - 空行（空白のみ含む）は無視する。
 * - 行頭の `*`（および直後の空白）を正解マークとして取り除く。
 * - ラベル前後の空白はトリムする。
 */
export function parseChoiceLines(raw: string): ParsedChoice[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const isCorrect = line.startsWith("*");
      const label = (isCorrect ? line.slice(1) : line).trim();
      return { label, isCorrect };
    })
    .filter((choice) => choice.label.length > 0);
}
