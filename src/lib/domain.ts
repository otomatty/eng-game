import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
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
  const rows = await db
    .select({ skillId: userSkills.skillId })
    .from(userSkills)
    .where(eq(userSkills.userId, userId));
  return new Set(rows.map((r) => r.skillId));
}

/** 想定単価を再計算し、users.current_estimated_rate を更新して返す */
export async function recomputeEstimatedRate(userId: number): Promise<number> {
  const acquired = await getAcquiredSkillIds(userId);

  const tiers = await db.select().from(rateTiers);
  const tierSkillRows = await db.select().from(rateTierSkills);

  const byTier = new Map<number, number[]>();
  for (const r of tierSkillRows) {
    const arr = byTier.get(r.rateTierId) ?? [];
    arr.push(r.skillId);
    byTier.set(r.rateTierId, arr);
  }

  let best = 0;
  for (const tier of tiers) {
    const required = byTier.get(tier.id) ?? [];
    // 条件スキルが未設定の単価帯は到達条件なしとはみなさない（誤って高単価に到達するのを防ぐ）
    if (required.length === 0) continue;
    const reached = required.every((sid) => acquired.has(sid));
    if (reached && tier.estimatedRate > best) best = tier.estimatedRate;
  }

  await db
    .update(users)
    .set({ currentEstimatedRate: best })
    .where(eq(users.id, userId));
  return best;
}

/** 到達済み・到達可能な単価帯の状況を取得（単価レンジ画面用） */
export async function getRateTierStatus(userId: number) {
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
  const acquired = await getAcquiredSkillIds(userId);
  const allSkills = await db.select().from(skills);
  const deps = await db.select().from(skillDependencies);

  // 前提 → 開放 のマップ
  const prereqsOf = new Map<number, number[]>();
  for (const d of deps) {
    const arr = prereqsOf.get(d.unlockedSkillId) ?? [];
    arr.push(d.prerequisiteSkillId);
    prereqsOf.set(d.unlockedSkillId, arr);
  }

  const nodes = allSkills.map((s) => {
    const prereqs = prereqsOf.get(s.id) ?? [];
    const isAcquired = acquired.has(s.id);
    const unlockable =
      !isAcquired && prereqs.every((p) => acquired.has(p));
    return {
      ...s,
      acquired: isAcquired,
      // 未習得 かつ 前提を満たす = 次に開放可能
      unlockable,
      prerequisiteIds: prereqs,
    };
  });

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

  // クエスト → 付与スキル のマップ
  const qsRows = await db.select().from(questSkills);
  const skillsOfQuest = new Map<number, number[]>();
  for (const r of qsRows) {
    const arr = skillsOfQuest.get(r.questId) ?? [];
    arr.push(r.skillId);
    skillsOfQuest.set(r.questId, arr);
  }

  const targetSet = new Set(targetSkillIds);
  const scored = publishedQuests
    .filter((q) => !doneOrActive.has(q.id))
    .map((q) => {
      const grants = skillsOfQuest.get(q.id) ?? [];
      const matched = grants.filter((sid) => targetSet.has(sid)).length;
      return { quest: q, matched };
    })
    .filter((x) => x.matched > 0)
    .sort((a, b) => b.matched - a.matched || a.quest.id - b.quest.id);

  let result = scored.slice(0, limit).map((x) => x.quest);

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
 * クエストのクリアを確定する（ポイント付与＋スキル習得＋単価再計算）。
 * 自己申告型・承認確定時の共通処理。冪等性を考慮し、既に完了済みなら何もしない。
 */
export async function completeQuestForUser(
  userId: number,
  questId: number,
  approverId?: number,
): Promise<void> {
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

  // スキル習得
  if (newSkillIds.length > 0) {
    await db
      .insert(userSkills)
      .values(newSkillIds.map((skillId) => ({ userId, skillId })))
      .onConflictDoNothing();
  }

  // ポイント付与（このクエストでの完了が初回の場合のみ）
  const prior = await db
    .select({ id: questAttempts.id })
    .from(questAttempts)
    .where(
      and(
        eq(questAttempts.userId, userId),
        eq(questAttempts.questId, questId),
        inArray(questAttempts.status, ["completed", "approved"]),
      ),
    );
  const alreadyRewarded = prior.length > 0;

  if (!alreadyRewarded) {
    const current = (
      await db
        .select({ totalPoints: users.totalPoints })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0];
    await db
      .update(users)
      .set({ totalPoints: (current?.totalPoints ?? 0) + quest.rewardPoints })
      .where(eq(users.id, userId));
  }

  void approverId;
  // 単価を再計算
  await recomputeEstimatedRate(userId);
}
