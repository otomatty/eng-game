"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  questAttempts,
  questQuestionChoices,
  questQuestions,
  quests,
} from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { completeQuestForUser } from "@/lib/domain";
import { gradeTest, type GradableQuestion } from "@/lib/domain-logic";
import { formString, type ActionResult } from "@/lib/form";
import {
  firstError,
  questIdSchema,
  submitForApprovalSchema,
  takeTestSchema,
  testAnswerValueSchema,
} from "@/lib/schemas";

/**
 * テスト型クエストの設問（＋選択肢）を採点用の純粋データへ整形して取得する。
 * 正解情報（correctText / isCorrect）はサーバー内部でのみ使用し、UI へは渡さない。
 */
async function loadGradableQuestions(
  questId: number,
): Promise<GradableQuestion[]> {
  const db = getDb();
  const questionRows = await db
    .select()
    .from(questQuestions)
    .where(eq(questQuestions.questId, questId))
    .orderBy(asc(questQuestions.sortOrder), asc(questQuestions.id));
  if (questionRows.length === 0) return [];

  const choiceRows = await db
    .select()
    .from(questQuestionChoices)
    .orderBy(asc(questQuestionChoices.sortOrder), asc(questQuestionChoices.id));

  return questionRows.map((q) => ({
    id: q.id,
    kind: q.kind,
    correctText: q.correctText,
    choices: choiceRows
      .filter((c) => c.questionId === q.id)
      .map((c) => ({ id: c.id, isCorrect: c.isCorrect })),
  }));
}

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

/** claim 可能（completed へ遷移できる）な挑戦状態。 */
type ClaimableStatus = "in_progress" | "rejected";

/**
 * クエスト完了を原子的に確定する（claim）。報酬を付与すべき場合のみ true を返す。
 *
 * - 既存の挑戦記録が claim 可能な状態なら、`id` と `status` を条件にした UPDATE で
 *   `completed` へ遷移させる。同時実行では先勝ちの 1 件だけが 1 行更新でき、遅れた側は
 *   `status` 条件に外れて 0 行更新となり false を返す。
 * - 既存記録が無い（または claim 不可）なら `completed` 行を INSERT する。部分ユニーク
 *   インデックス `quest_attempts_unique_completion` により、同時 INSERT は 1 件だけ成功し、
 *   競合した側は `onConflictDoNothing` で 0 行となり false を返す。
 */
async function claimCompletion(
  userId: number,
  questId: number,
  existing: Awaited<ReturnType<typeof latestAttempt>>,
  claimableStatuses: readonly ClaimableStatus[],
): Promise<boolean> {
  const db = getDb();
  if (existing) {
    // 既存記録が claim 可能（completed へ遷移できる）状態でなければ、新規 completed 行は
    // 作らない（claim 不可の状態から並行して完了行を作り報酬対象にするのを防ぐ）。
    if (!claimableStatuses.some((s) => s === existing.status)) return false;
    const updated = await db
      .update(questAttempts)
      .set({ status: "completed", approvedAt: new Date() })
      .where(
        and(
          eq(questAttempts.id, existing.id),
          inArray(questAttempts.status, [...claimableStatuses]),
        ),
      )
      .returning({ id: questAttempts.id });
    return updated.length > 0;
  }

  // 既存の claim 対象が無い場合は completed 行を新規 INSERT する。部分ユニークインデックスへの
  // `on conflict ... where ... do nothing` で、同時 INSERT は 1 件だけ成功し競合した側は 0 行になる。
  // drizzle の `onConflictDoNothing({ where })` は述語を `do nothing` の後ろに置き SQLite 構文として
  // 不正になるため、ここは生 SQL で正しい位置（conflict ターゲットの述語）に置く。
  const inserted = await db.all<{ id: number }>(sql`
    insert into quest_attempts (user_id, quest_id, status, approved_at)
    values (${userId}, ${questId}, 'completed', unixepoch())
    on conflict (user_id, quest_id) where status in ('completed', 'approved')
    do nothing
    returning id
  `);
  return inserted.length > 0;
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
  const parsed = questIdSchema.safeParse({
    questId: formString(formData, "questId"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const questId = parsed.data.questId;
  const quest = await loadQuest(questId);
  if (quest.verification !== "self")
    return { error: "自己申告型ではありません" };

  const existing = await latestAttempt(user.id, questId);
  if (existing && ["completed", "approved"].includes(existing.status)) {
    // 既に完了済み。報酬確定は冪等なので、過去の部分失敗の取りこぼしを念のため回復する。
    await completeQuestForUser(user.id, questId);
    return {};
  }

  // 完了の確定（claim）を原子的に行い、確定に「勝った」場合のみ報酬を付与する。
  // 同時クリア（ダブルクリック等）でも DB レベルで 1 回だけ確定されるため二重付与しない。
  const won = await claimCompletion(user.id, questId, existing, [
    "in_progress",
  ]);
  if (won) {
    await completeQuestForUser(user.id, questId);
  }

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
 * テスト型: 管理画面で設定された設問・正解に対して採点し、合否でクリアを確定する。
 *
 * - 採点は副作用のない純粋関数 `gradeTest`（[`domain-logic.ts`](../../lib/domain-logic.ts)）に委譲。
 * - 設問が未設定のテストは合格にしない（素通り防止）。
 * - 不合格時は正解を一切返さない（ヒント露出の排除 / Issue #7）。
 * - 既にクリア済みなら再採点せず冪等に成功を返す。
 */
export async function takeTestAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = takeTestSchema.safeParse({
    questId: formString(formData, "questId"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { questId } = parsed.data;
  const quest = await loadQuest(questId);
  if (quest.verification !== "test")
    return { error: "テスト型ではありません" };

  // 重複提出の冪等性: 既にクリア済みなら再採点しない（冪等な再確定で取りこぼしは回復）
  const existing = await latestAttempt(user.id, questId);
  if (existing && ["completed", "approved"].includes(existing.status)) {
    await completeQuestForUser(user.id, questId);
    return { ok: true };
  }

  const questions = await loadGradableQuestions(questId);
  if (questions.length === 0) {
    return { error: "このテストにはまだ設問が設定されていません。" };
  }

  // 設問ごとの提出値（`q_<questionId>`）を読み取り、長さを検証する。
  const submission: Record<number, string> = {};
  for (const q of questions) {
    const valueParsed = testAnswerValueSchema.safeParse(
      formString(formData, `q_${q.id}`),
    );
    if (!valueParsed.success) return { error: firstError(valueParsed.error) };
    submission[q.id] = valueParsed.data;
  }

  const grading = gradeTest(questions, submission, quest.passThreshold);
  if (!grading.passed) {
    // 不合格時に「今回の正答数」を返すと、選択肢を1つずつ変えてスコア差分から
    // 正解を逆算できる（オラクル攻撃）。再挑戦可能なテストでは合否のみを返し、
    // 設問数・合格基準（毎回不変で逆算に使えない静的情報）だけを案内する。
    return {
      error: `不合格です。全${grading.total}問中 ${grading.requiredCorrect} 問以上の正解で合格です。もう一度挑戦してください。`,
    };
  }

  // 合格が確定したら完了を原子的に claim し、勝った場合のみ報酬を付与する
  // （同時に複数回合格を送っても二重付与しない）。
  const won = await claimCompletion(user.id, questId, existing, [
    "in_progress",
    "rejected",
  ]);
  if (won) {
    await completeQuestForUser(user.id, questId);
  }
  revalidatePath(`/quests/${questId}`);
  revalidatePath("/home");
  return { ok: true };
}
