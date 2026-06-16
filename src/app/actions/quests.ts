"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { questAttempts, quests } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { completeQuestForUser } from "@/lib/domain";
import { formNumber, formString } from "@/lib/form";

async function loadQuest(questId: number) {
  const q = (
    await db.select().from(quests).where(eq(quests.id, questId)).limit(1)
  )[0];
  if (!q?.isPublished) throw new Error("クエストが見つかりません");
  return q;
}

/** 最新の挑戦記録を取得 */
async function latestAttempt(userId: number, questId: number) {
  return (
    await db
      .select()
      .from(questAttempts)
      .where(
        and(
          eq(questAttempts.userId, userId),
          eq(questAttempts.questId, questId),
        ),
      )
      .orderBy(desc(questAttempts.id))
      .limit(1)
  )[0];
}

/** クエストに挑戦開始（in_progress の記録を作成） */
export async function startQuestAction(formData: FormData) {
  const user = await requireUser();
  const questId = formNumber(formData, "questId");
  await loadQuest(questId);

  const existing = await latestAttempt(user.id, questId);
  if (
    existing &&
    ["in_progress", "submitted", "completed", "approved"].includes(
      existing.status,
    )
  ) {
    revalidatePath(`/quests/${questId}`);
    return;
  }

  await db.insert(questAttempts).values({
    userId: user.id,
    questId,
    status: "in_progress",
  });
  revalidatePath(`/quests/${questId}`);
}

/** 自己申告型: 即時クリア */
export async function selfCompleteAction(formData: FormData) {
  const user = await requireUser();
  const questId = formNumber(formData, "questId");
  const quest = await loadQuest(questId);
  if (quest.verification !== "self") throw new Error("自己申告型ではありません");

  const existing = await latestAttempt(user.id, questId);
  if (existing && ["completed", "approved"].includes(existing.status)) return;

  if (existing?.status === "in_progress") {
    await db
      .update(questAttempts)
      .set({ status: "completed", approvedAt: new Date() })
      .where(eq(questAttempts.id, existing.id));
  } else {
    await db.insert(questAttempts).values({
      userId: user.id,
      questId,
      status: "completed",
      approvedAt: new Date(),
    });
  }

  await completeQuestForUser(user.id, questId);
  revalidatePath(`/quests/${questId}`);
  revalidatePath("/home");
}

/** 成果物提出型: 提出して承認待ちにする */
export async function submitForApprovalAction(formData: FormData) {
  const user = await requireUser();
  const questId = formNumber(formData, "questId");
  const submission = formString(formData, "submission").trim();
  const quest = await loadQuest(questId);
  if (quest.verification !== "approval")
    throw new Error("承認型ではありません");
  if (!submission) throw new Error("提出物を入力してください");

  const existing = await latestAttempt(user.id, questId);
  if (existing && ["completed", "approved"].includes(existing.status)) return;

  if (existing && ["in_progress", "rejected"].includes(existing.status)) {
    await db
      .update(questAttempts)
      .set({
        status: "submitted",
        submission,
        submittedAt: new Date(),
        reviewNote: "",
      })
      .where(eq(questAttempts.id, existing.id));
  } else {
    await db.insert(questAttempts).values({
      userId: user.id,
      questId,
      status: "submitted",
      submission,
      submittedAt: new Date(),
    });
  }
  revalidatePath(`/quests/${questId}`);
  revalidatePath("/home");
}

/**
 * テスト型: 合否判定でクリア確定。
 * MVPでは簡易テスト（正解キーワードの一致）で合否判定する。
 */
export async function takeTestAction(formData: FormData) {
  const user = await requireUser();
  const questId = formNumber(formData, "questId");
  const answer = formString(formData, "answer").trim().toLowerCase();
  const quest = await loadQuest(questId);
  if (quest.verification !== "test") throw new Error("テスト型ではありません");

  // MVP簡易判定: "pass" と入力すると合格（運用では設問・採点ロジックに置換）
  const passed = answer === "pass" || answer === "合格";
  if (!passed) {
    return { error: "不合格です。もう一度挑戦してください（ヒント: pass）。" };
  }

  const existing = await latestAttempt(user.id, questId);
  if (existing && ["completed", "approved"].includes(existing.status)) {
    return { ok: true };
  }
  if (existing && ["in_progress", "rejected"].includes(existing.status)) {
    await db
      .update(questAttempts)
      .set({ status: "completed", approvedAt: new Date() })
      .where(eq(questAttempts.id, existing.id));
  } else {
    await db.insert(questAttempts).values({
      userId: user.id,
      questId,
      status: "completed",
      approvedAt: new Date(),
    });
  }
  await completeQuestForUser(user.id, questId);
  revalidatePath(`/quests/${questId}`);
  revalidatePath("/home");
  return { ok: true };
}
