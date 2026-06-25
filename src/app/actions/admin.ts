"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  questAttempts,
  questQuestionChoices,
  questQuestions,
  questSkills,
  quests,
  rateTierSkills,
  rateTiers,
  skillDependencies,
  skills,
  teams,
  users,
} from "@/db/schema";
import { parseChoiceLines } from "@/lib/domain-logic";
import { requireAdmin } from "@/lib/guards";
import { completeQuestForUser, recomputeEstimatedRate } from "@/lib/domain";
import { hashPassword, invalidateUserSessions } from "@/lib/auth";
import { formString, formStrings, type ActionResult } from "@/lib/form";
import {
  addDependencySchema,
  adminResetPasswordSchema,
  approveAttemptSchema,
  createTeamSchema,
  createUserSchema,
  firstError,
  idOnlySchema,
  rejectAttemptSchema,
  saveQuestSchema,
  saveQuestionSchema,
  saveRateTierSchema,
  saveSkillSchema,
  toggleQuestPublishSchema,
  updateUserSchema,
} from "@/lib/schemas";

// ============ クエスト ============

export async function saveQuestAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = saveQuestSchema.safeParse({
    id: formString(fd, "id"),
    title: formString(fd, "title"),
    description: formString(fd, "description"),
    category: formString(fd, "category"),
    rewardPoints: formString(fd, "rewardPoints"),
    verification: formString(fd, "verification", "self"),
    passThreshold: formString(fd, "passThreshold"),
    isPublished: fd.get("isPublished"),
    skillIds: formStrings(fd, "skillIds"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { id, skillIds, ...data } = parsed.data;

  const db = getDb();
  let questId: number;
  if (id) {
    await db.update(quests).set(data).where(eq(quests.id, id));
    questId = id;
    await db.delete(questSkills).where(eq(questSkills.questId, id));
  } else {
    const row = await db.insert(quests).values(data).returning();
    const inserted = row[0];
    if (!inserted) return { error: "クエストの作成に失敗しました" };
    questId = inserted.id;
  }
  if (skillIds.length > 0) {
    await db
      .insert(questSkills)
      .values(skillIds.map((skillId) => ({ questId, skillId })))
      .onConflictDoNothing();
  }
  revalidatePath("/admin/quests");
  return {};
}

export async function deleteQuestAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = idOnlySchema.safeParse({ id: formString(fd, "id") });
  if (!parsed.success) return;
  const db = getDb();
  await db.delete(quests).where(eq(quests.id, parsed.data.id));
  revalidatePath("/admin/quests");
}

export async function toggleQuestPublishAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = toggleQuestPublishSchema.safeParse({
    id: formString(fd, "id"),
    publish: formString(fd, "publish"),
  });
  if (!parsed.success) return;
  const db = getDb();
  await db
    .update(quests)
    .set({ isPublished: parsed.data.publish })
    .where(eq(quests.id, parsed.data.id));
  revalidatePath("/admin/quests");
}

// ============ テスト型クエストの設問 ============

/**
 * テスト型クエストへ設問を追加する（Issue #7）。
 * - single（選択式）: 「1 行 1 つ・行頭 * が正解」のテキストを選択肢へ展開する。
 * - text（完全一致）: 正解文字列を設問行へ保存する。
 * 正解情報は `quest_questions` / `quest_question_choices` にのみ保持し、UI へは露出しない。
 */
export async function saveQuestionAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = saveQuestionSchema.safeParse({
    questId: formString(fd, "questId"),
    prompt: formString(fd, "prompt"),
    kind: formString(fd, "kind", "single"),
    correctText: formString(fd, "correctText"),
    choicesRaw: formString(fd, "choicesRaw"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { questId, prompt, kind, correctText, choicesRaw } = parsed.data;

  const db = getDb();
  // 対象クエストがテスト型であることを確認（種別不一致のクエストへ設問を付けない）。
  const quest = (
    await db.select().from(quests).where(eq(quests.id, questId)).limit(1)
  )[0];
  if (!quest) return { error: "クエストが見つかりません" };
  if (quest.verification !== "test")
    return { error: "テスト型クエストにのみ設問を追加できます" };

  // 末尾に追加する並び順
  const siblings = await db
    .select({ sortOrder: questQuestions.sortOrder })
    .from(questQuestions)
    .where(eq(questQuestions.questId, questId));
  const nextOrder =
    siblings.reduce((max, s) => Math.max(max, s.sortOrder), 0) + 1;

  const inserted = (
    await db
      .insert(questQuestions)
      .values({
        questId,
        prompt,
        kind,
        correctText: kind === "text" ? correctText : "",
        sortOrder: nextOrder,
      })
      .returning()
  )[0];
  if (!inserted) return { error: "設問の作成に失敗しました" };

  if (kind === "single") {
    const choices = parseChoiceLines(choicesRaw);
    await db.insert(questQuestionChoices).values(
      choices.map((c, i) => ({
        questionId: inserted.id,
        label: c.label,
        isCorrect: c.isCorrect,
        sortOrder: i + 1,
      })),
    );
  }

  revalidatePath("/admin/quests");
  return {};
}

/** 設問を削除する（選択肢は ON DELETE CASCADE で連動削除）。 */
export async function deleteQuestionAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = idOnlySchema.safeParse({ id: formString(fd, "id") });
  if (!parsed.success) return;
  const db = getDb();
  await db.delete(questQuestions).where(eq(questQuestions.id, parsed.data.id));
  revalidatePath("/admin/quests");
}

// ============ クリア承認 ============

export async function approveAttemptAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = approveAttemptSchema.safeParse({
    attemptId: formString(fd, "attemptId"),
  });
  if (!parsed.success) return;
  const db = getDb();
  const attemptId = parsed.data.attemptId;
  const attempt = (
    await db.select().from(questAttempts).where(eq(questAttempts.id, attemptId)).limit(1)
  )[0];
  if (attempt?.status !== "submitted") return;

  // 承認の確定（claim）を原子的に行う。`status = 'submitted'` を条件にした UPDATE で
  // 先勝ちの 1 件だけが 1 行更新でき、同じ提出を同時に承認しても遅れた側は 0 行更新となる。
  // この claim に「勝った」承認だけが報酬を付与するため、二重承認でも二重付与しない。
  const claimed = await db
    .update(questAttempts)
    .set({ status: "approved", approverId: admin.id, approvedAt: new Date() })
    .where(
      and(
        eq(questAttempts.id, attemptId),
        eq(questAttempts.status, "submitted"),
      ),
    )
    .returning({ id: questAttempts.id });
  if (claimed.length === 0) return;

  await completeQuestForUser(attempt.userId, attempt.questId);

  revalidatePath("/admin/approvals");
  revalidatePath("/admin");
}

export async function rejectAttemptAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = rejectAttemptSchema.safeParse({
    attemptId: formString(fd, "attemptId"),
    reviewNote: formString(fd, "reviewNote"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const db = getDb();
  await db
    .update(questAttempts)
    .set({
      status: "rejected",
      approverId: admin.id,
      reviewNote: parsed.data.reviewNote,
    })
    .where(
      and(
        eq(questAttempts.id, parsed.data.attemptId),
        eq(questAttempts.status, "submitted"),
      ),
    );
  revalidatePath("/admin/approvals");
  revalidatePath("/admin");
  return {};
}

// ============ スキル & ツリー ============

export async function saveSkillAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = saveSkillSchema.safeParse({
    id: formString(fd, "id"),
    name: formString(fd, "name"),
    category: formString(fd, "category"),
    description: formString(fd, "description"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { id, ...data } = parsed.data;

  const db = getDb();
  if (id) {
    await db.update(skills).set(data).where(eq(skills.id, id));
  } else {
    await db.insert(skills).values(data);
  }
  revalidatePath("/admin/skills");
  return {};
}

export async function deleteSkillAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = idOnlySchema.safeParse({ id: formString(fd, "id") });
  if (!parsed.success) return;
  const db = getDb();
  await db.delete(skills).where(eq(skills.id, parsed.data.id));
  revalidatePath("/admin/skills");
}

export async function addDependencyAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = addDependencySchema.safeParse({
    prerequisiteSkillId: formString(fd, "prerequisiteSkillId"),
    unlockedSkillId: formString(fd, "unlockedSkillId"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const db = getDb();
  await db
    .insert(skillDependencies)
    .values({
      prerequisiteSkillId: parsed.data.prerequisiteSkillId,
      unlockedSkillId: parsed.data.unlockedSkillId,
    })
    .onConflictDoNothing();
  revalidatePath("/admin/skills");
  return {};
}

export async function removeDependencyAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = idOnlySchema.safeParse({ id: formString(fd, "id") });
  if (!parsed.success) return;
  const db = getDb();
  await db.delete(skillDependencies).where(eq(skillDependencies.id, parsed.data.id));
  revalidatePath("/admin/skills");
}

// ============ 単価レンジ ============

export async function saveRateTierAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = saveRateTierSchema.safeParse({
    id: formString(fd, "id"),
    name: formString(fd, "name"),
    description: formString(fd, "description"),
    estimatedRate: formString(fd, "estimatedRate"),
    sortOrder: formString(fd, "sortOrder"),
    skillIds: formStrings(fd, "skillIds"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { id, skillIds, ...data } = parsed.data;

  const db = getDb();
  let tierId: number;
  if (id) {
    await db.update(rateTiers).set(data).where(eq(rateTiers.id, id));
    tierId = id;
    await db.delete(rateTierSkills).where(eq(rateTierSkills.rateTierId, id));
  } else {
    const row = await db.insert(rateTiers).values(data).returning();
    const inserted = row[0];
    if (!inserted) return { error: "単価帯の作成に失敗しました" };
    tierId = inserted.id;
  }
  if (skillIds.length > 0) {
    await db
      .insert(rateTierSkills)
      .values(skillIds.map((skillId) => ({ rateTierId: tierId, skillId })))
      .onConflictDoNothing();
  }
  // 全エンジニアの想定単価を再計算（到達条件が変わったため）
  await recomputeAllRates();
  revalidatePath("/admin/rates");
  return {};
}

export async function deleteRateTierAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = idOnlySchema.safeParse({ id: formString(fd, "id") });
  if (!parsed.success) return;
  const db = getDb();
  await db.delete(rateTiers).where(eq(rateTiers.id, parsed.data.id));
  await recomputeAllRates();
  revalidatePath("/admin/rates");
}

async function recomputeAllRates() {
  const db = getDb();
  const engineers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "engineer"));
  for (const e of engineers) {
    await recomputeEstimatedRate(e.id);
  }
}

// ============ ユーザー & チーム ============

export async function createUserAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createUserSchema.safeParse({
    name: formString(fd, "name"),
    email: formString(fd, "email"),
    password: formString(fd, "password"),
    role: formString(fd, "role", "engineer"),
    teamId: formString(fd, "teamId"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { name, email, password, role, teamId } = parsed.data;

  const db = getDb();
  const exists = (
    await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  )[0];
  if (exists) return { error: "このメールアドレスは既に登録されています" };

  await db.insert(users).values({
    name,
    email,
    passwordHash: await hashPassword(password),
    role,
    teamId,
  });
  revalidatePath("/admin/users");
  return {};
}

export async function updateUserAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = updateUserSchema.safeParse({
    id: formString(fd, "id"),
    role: formString(fd, "role", "engineer"),
    teamId: formString(fd, "teamId"),
  });
  if (!parsed.success) return;
  const db = getDb();
  await db
    .update(users)
    .set({ role: parsed.data.role, teamId: parsed.data.teamId })
    .where(eq(users.id, parsed.data.id));
  revalidatePath("/admin/users");
}

/**
 * 管理者によるパスワードリセット。
 * 対象ユーザーへ新パスワードを再設定し、当該ユーザーの既存セッションを失効させる
 * （リセット後は本人が新パスワードで再ログインする想定）。
 */
export async function adminResetPasswordAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = adminResetPasswordSchema.safeParse({
    id: formString(fd, "id"),
    newPassword: formString(fd, "newPassword"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const db = getDb();
  const target = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, parsed.data.id))
      .limit(1)
  )[0];
  if (!target) return { error: "対象のユーザーが見つかりません。" };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(users.id, target.id));
  // 対象ユーザーの既存セッションを失効（漏洩時の即時遮断・パスワード再設定の整合）
  await invalidateUserSessions(target.id);
  revalidatePath("/admin/users");
  return { success: "パスワードをリセットしました。" };
}

export async function deleteUserAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = idOnlySchema.safeParse({ id: formString(fd, "id") });
  if (!parsed.success) return;
  // 自分自身は削除できない（UI でもボタンを隠しているが二重に防ぐ）
  if (parsed.data.id === admin.id) return;
  const db = getDb();
  await db.delete(users).where(eq(users.id, parsed.data.id));
  revalidatePath("/admin/users");
}

export async function createTeamAction(
  _prev: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createTeamSchema.safeParse({ name: formString(fd, "name") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const db = getDb();
  await db.insert(teams).values({ name: parsed.data.name });
  revalidatePath("/admin/users");
  return {};
}

export async function deleteTeamAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const parsed = idOnlySchema.safeParse({ id: formString(fd, "id") });
  if (!parsed.success) return;
  const db = getDb();
  await db.delete(teams).where(eq(teams.id, parsed.data.id));
  revalidatePath("/admin/users");
}
