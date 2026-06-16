"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { questAttempts, quests } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { completeQuestForUser } from "@/lib/domain";
import { formString, type ActionResult } from "@/lib/form";
import {
  firstError,
  questIdSchema,
  submitForApprovalSchema,
  takeTestSchema,
} from "@/lib/schemas";

async function loadQuest(questId: number) {
  const db = getDb();
  const q = (
    await db.select().from(quests).where(eq(quests.id, questId)).limit(1)
  )[0];
  if (!q?.isPublished) throw new Error("クエストが見つかりません");
  return q;
}

/** 最新の挑戦記録を取得 */
async function latestAttempt(userId: number, questId: number) {
  const db = getDb();
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
export async function startQuestAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  const parsed = questIdSchema.safeParse({
    questId: formString(formData, "questId"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const questId = parsed.data.questId;
  await loadQuest(questId);

  const existing = await latestAttempt(user.id, questId);
  if (
    existing &&
    ["in_progress", "submitted", "completed", "approved"].includes(
      existing.status,
    )
  ) {
    revalidatePath(`/quests/${questId}`);
    return {};
  }

  await db.insert(questAttempts).values({
    userId: user.id,
    questId,
    status: "in_progress",
  });
  revalidatePath(`/quests/${questId}`);
  return {};
}

/** 自己申告型: 即時クリア */
export async function selfCompleteAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  const parsed = questIdSchema.safeParse({
    questId: formString(formData, "questId"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const questId = parsed.data.questId;
  const quest = await loadQuest(questId);
  if (quest.verification !== "self")
    return { error: "自己申告型ではありません" };

  const existing = await latestAttempt(user.id, questId);
  if (existing && ["completed", "approved"].includes(existing.status)) return {};

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
  return {};
}

/** 成果物提出型: 提出して承認待ちにする */
export async function submitForApprovalAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const db = getDb();
  const parsed = submitForApprovalSchema.safeParse({
    questId: formString(formData, "questId"),
    submission: formString(formData, "submission"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { questId, submission } = parsed.data;
  const quest = await loadQuest(questId);
  if (quest.verification !== "approval")
    return { error: "承認型ではありません" };

  const existing = await latestAttempt(user.id, questId);
  if (existing && ["completed", "approved"].includes(existing.status)) return {};

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
  return {};
}

/**
 * テスト型: 合否判定でクリア確定。
 * MVPでは簡易テスト（正解キーワードの一致）で合否判定する。
 */
export async function takeTestAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const db = getDb();
  const parsed = takeTestSchema.safeParse({
    questId: formString(formData, "questId"),
    answer: formString(formData, "answer"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { questId, answer } = parsed.data;
  const quest = await loadQuest(questId);
  if (quest.verification !== "test")
    return { error: "テスト型ではありません" };

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
