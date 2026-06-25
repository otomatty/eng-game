import "server-only";
import { and, eq, inArray } from "drizzle-orm";
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

/**
 * 累積ポイントを「完了/承認済みクエストの reward_points 合計」から再計算して
 * users.total_points に書き戻す（導出値のキャッシュ）。
 *
 * 加算ではなく毎回集計し直すため、何度呼んでも同じ値に収束する（冪等・再実行可能）。
 * これにより claim 後の報酬確定が途中で失敗しても、次回以降の確定で取りこぼしなく回復でき、
 * 二重加算も起き得ない（同一クエストは reward_points を 1 回だけ計上）。
 */
export async function recomputeTotalPoints(userId: number): Promise<number> {
  const db = getDb();
  // 完了/承認済みの「クエスト」集合（重複挑戦は DISTINCT で 1 回に畳む）
  const completed = await db
    .selectDistinct({ questId: questAttempts.questId })
    .from(questAttempts)
    .where(
      and(
        eq(questAttempts.userId, userId),
        inArray(questAttempts.status, ["completed", "approved"]),
      ),
    );
  const questIds = completed.map((r) => r.questId);

  let total = 0;
  if (questIds.length > 0) {
    const rows = await db
      .select({ reward: quests.rewardPoints })
      .from(quests)
      .where(inArray(quests.id, questIds));
    total = rows.reduce((sum, r) => sum + r.reward, 0);
  }

  await db.update(users).set({ totalPoints: total }).where(eq(users.id, userId));
  return total;
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
 * クエスト報酬を確定する（スキル習得＋ポイント再計算＋単価再計算）。
 *
 * 完了の確定（claim）に成功した呼び出しから呼ぶことを想定するが、各ステップは
 * **すべて冪等**（スキルは重複無視、ポイント・単価は集計し直し）なので、
 * 同じ (userId, questId) に対して何度実行しても二重付与は起きない。これにより、
 * claim 後の確定が途中で失敗しても、次回のアクションで再実行して取りこぼしを回復できる。
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

  // ポイントを完了済みクエストから集計し直す（冪等・二重加算なし）
  await recomputeTotalPoints(userId);

  // 単価を再計算
  await recomputeEstimatedRate(userId);
}
