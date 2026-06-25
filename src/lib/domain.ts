import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  quests,
  questAttempts,
  questSkills,
  rateTiers,
  rateTierSkills,
  skillDependencies,
  skills,
  userSkills,
  users,
} from "@/db/schema";
import {
  buildPrerequisiteMap,
  computeSkillNodeFlags,
  scoreQuestsByTargetSkills,
  selectBestRate,
} from "./domain-logic";

/**
 * ドメインロジック（PRD 5章 コアループ）
 *
 * - 単価帯（RateTier）到達判定: その単価帯の必要スキルを「すべて」習得していれば到達。
 *   現在の想定単価 = 到達済み単価帯のうち最大の estimated_rate。
 * - 次の一手レコメンド: スキルツリー上で「次に開放可能なノード」
 *   （未習得 かつ 前提スキルをすべて習得済み）に紐づく未完了クエストを提示。
 */

/** ユーザーが習得済みのスキルID集合 */
export async function getAcquiredSkillIds(userId: number): Promise<Set<number>> {
  const db = getDb();
  const rows = await db
    .select({ skillId: userSkills.skillId })
    .from(userSkills)
    .where(eq(userSkills.userId, userId));
  return new Set(rows.map((r) => r.skillId));
}

/** 想定単価を再計算し、users.current_estimated_rate を更新して返す */
export async function recomputeEstimatedRate(userId: number): Promise<number> {
  const db = getDb();
  const acquired = await getAcquiredSkillIds(userId);

  const tiers = await db.select().from(rateTiers);
  const tierSkillRows = await db.select().from(rateTierSkills);

  // 条件スキルが未設定の単価帯は到達扱いにしない（誤って高単価に到達するのを防ぐ）
  const best = selectBestRate(tiers, tierSkillRows, acquired);

  await db
    .update(users)
    .set({ currentEstimatedRate: best })
    .where(eq(users.id, userId));
  return best;
}

/** 到達済み・到達可能な単価帯の状況を取得（単価レンジ画面用） */
export async function getRateTierStatus(userId: number) {
  const db = getDb();
  const acquired = await getAcquiredSkillIds(userId);
  const tiers = await db.select().from(rateTiers).orderBy(rateTiers.sortOrder);
  const tierSkillRows = await db
    .select({
      rateTierId: rateTierSkills.rateTierId,
      skillId: skills.id,
      skillName: skills.name,
    })
    .from(rateTierSkills)
    .innerJoin(skills, eq(rateTierSkills.skillId, skills.id));

  return tiers.map((tier) => {
    const reqSkills = tierSkillRows.filter((s) => s.rateTierId === tier.id);
    const missing = reqSkills.filter((s) => !acquired.has(s.skillId));
    return {
      ...tier,
      requiredSkills: reqSkills.map((s) => ({
        id: s.skillId,
        name: s.skillName,
        acquired: acquired.has(s.skillId),
      })),
      reached: reqSkills.length > 0 && missing.length === 0,
      missingCount: missing.length,
    };
  });
}

/** スキルツリー（全スキル＋前提関係＋習得状態） */
export async function getSkillTree(userId: number) {
  const db = getDb();
  const acquired = await getAcquiredSkillIds(userId);
  const allSkills = await db.select().from(skills);
  const deps = await db.select().from(skillDependencies);

  const prerequisiteMap = buildPrerequisiteMap(deps);
  const nodes = allSkills.map((s) => ({
    ...s,
    ...computeSkillNodeFlags(s.id, prerequisiteMap, acquired),
  }));

  return {
    nodes,
    edges: deps.map((d) => ({
      from: d.prerequisiteSkillId,
      to: d.unlockedSkillId,
    })),
  };
}

/** 「次の一手」レコメンド: 次に開放可能なスキルに紐づく未完了の公開クエスト */
export async function getRecommendedQuests(userId: number, limit = 3) {
  const db = getDb();
  const { nodes } = await getSkillTree(userId);
  const targetSkillIds = nodes
    .filter((n) => n.unlockable)
    .map((n) => n.id);

  // 既に完了/挑戦中のクエストは除外
  const attempts = await db
    .select({ questId: questAttempts.questId, status: questAttempts.status })
    .from(questAttempts)
    .where(eq(questAttempts.userId, userId));
  const doneOrActive = new Set(
    attempts
      .filter((a) =>
        ["completed", "approved", "submitted", "in_progress"].includes(
          a.status,
        ),
      )
      .map((a) => a.questId),
  );

  const publishedQuests = await db
    .select()
    .from(quests)
    .where(eq(quests.isPublished, true));

  const qsRows = await db.select().from(questSkills);
  const scored = scoreQuestsByTargetSkills(
    publishedQuests,
    qsRows,
    new Set(targetSkillIds),
    doneOrActive,
  );

  let result = scored.slice(0, limit);

  // 開放可能スキルに紐づくクエストが無ければ、前提不要の入門クエストで補完
  if (result.length < limit) {
    const fallback = publishedQuests
      .filter((q) => !doneOrActive.has(q.id) && !result.some((r) => r.id === q.id))
      .slice(0, limit - result.length);
    result = [...result, ...fallback];
  }
  return result;
}

/**
 * クエスト報酬を確定する（ポイント付与＋スキル習得＋単価再計算）。
 *
 * **前提**: 呼び出し側が「完了の確定（claim）」を原子的に 1 回だけ行った直後にのみ呼ぶこと。
 * 各サーバーアクションは挑戦記録の状態遷移（`in_progress`/`submitted`/`rejected` →
 * `completed`/`approved`）を条件付き UPDATE / `onConflictDoNothing` INSERT で原子的に確定し、
 * その確定に「勝った」呼び出しだけが本関数を呼ぶ。これにより二重付与防止はここでガードせず
 * 呼び出し側の原子的 claim に一元化される（同時クリア／二重承認でも 1 回だけ付与）。
 *
 * - スキル習得・単価再計算は何度実行しても同じ状態に収束する（冪等）。
 * - ポイントは `total_points + reward` の原子的インクリメントで加算し、別クエストの同時完了との
 *   read-modify-write 競合（更新ロスト）を避ける。
 */
export async function completeQuestForUser(
  userId: number,
  questId: number,
): Promise<void> {
  const db = getDb();
  const quest = (
    await db.select().from(quests).where(eq(quests.id, questId)).limit(1)
  )[0];
  if (!quest) throw new Error("クエストが見つかりません");

  // 付与スキル
  const grantRows = await db
    .select({ skillId: questSkills.skillId })
    .from(questSkills)
    .where(eq(questSkills.questId, questId));
  const grantSkillIds = grantRows.map((r) => r.skillId);

  // 既習得スキルを除外
  const acquired = await getAcquiredSkillIds(userId);
  const newSkillIds = grantSkillIds.filter((sid) => !acquired.has(sid));

  // スキル習得（重複は onConflictDoNothing で無視）
  if (newSkillIds.length > 0) {
    await db
      .insert(userSkills)
      .values(newSkillIds.map((skillId) => ({ userId, skillId })))
      .onConflictDoNothing();
  }

  // ポイント付与（原子的インクリメント。呼び出し側の claim により 1 回だけ実行される）
  if (quest.rewardPoints !== 0) {
    await db
      .update(users)
      .set({ totalPoints: sql`${users.totalPoints} + ${quest.rewardPoints}` })
      .where(eq(users.id, userId));
  }

  // 単価を再計算
  await recomputeEstimatedRate(userId);
}
