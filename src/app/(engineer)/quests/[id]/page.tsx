import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  questAttempts,
  questQuestionChoices,
  questQuestions,
  questSkills,
  quests,
  skills,
} from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { getAcquiredSkillIds } from "@/lib/domain";
import { VerificationBadge } from "@/components/ui";
import { QuestActions, type DisplayQuestion } from "./quest-actions";

/**
 * テスト型クエストの設問を「表示用」に取得する。
 * 正解情報（correct_text / is_correct）は一切含めない（UI へ正解を露出させない / Issue #7）。
 */
async function loadDisplayQuestions(
  questId: number,
): Promise<DisplayQuestion[]> {
  const db = getDb();
  const questionRows = await db
    .select({
      id: questQuestions.id,
      prompt: questQuestions.prompt,
      kind: questQuestions.kind,
    })
    .from(questQuestions)
    .where(eq(questQuestions.questId, questId))
    .orderBy(asc(questQuestions.sortOrder), asc(questQuestions.id));
  if (questionRows.length === 0) return [];

  const choiceRows = await db
    .select({
      id: questQuestionChoices.id,
      questionId: questQuestionChoices.questionId,
      label: questQuestionChoices.label,
    })
    .from(questQuestionChoices)
    .orderBy(asc(questQuestionChoices.sortOrder), asc(questQuestionChoices.id));

  return questionRows.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    kind: q.kind,
    choices: choiceRows
      .filter((c) => c.questionId === q.id)
      .map((c) => ({ id: c.id, label: c.label })),
  }));
}

const VERIFICATION_HELP: Record<string, string> = {
  self: "自己申告型: ボタンを押すと即時にクリアが確定します。",
  approval: "成果物提出型: 提出物を添えて申請し、管理者の承認でクリアが確定します。",
  test: "テスト型: 合否判定に合格するとクリアが確定します。",
};

export default async function QuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const questId = Number(id);
  if (Number.isNaN(questId)) notFound();
  const db = getDb();

  const quest = (
    await db.select().from(quests).where(eq(quests.id, questId)).limit(1)
  )[0];
  if (!quest?.isPublished) notFound();

  const grantSkills = await db
    .select({ id: skills.id, name: skills.name, category: skills.category })
    .from(questSkills)
    .innerJoin(skills, eq(questSkills.skillId, skills.id))
    .where(eq(questSkills.questId, questId));

  const acquired = await getAcquiredSkillIds(user.id);

  const testQuestions =
    quest.verification === "test"
      ? await loadDisplayQuestions(quest.id)
      : [];

  const attempt = (
    await db
      .select()
      .from(questAttempts)
      .where(
        and(
          eq(questAttempts.userId, user.id),
          eq(questAttempts.questId, questId),
        ),
      )
      .orderBy(desc(questAttempts.id))
      .limit(1)
  )[0];

  return (
    <div className="space-y-6">
      <Link href="/quests" className="text-sm text-zen-sub hover:text-zen-ink">
        ← クエスト一覧へ
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill">{quest.category}</span>
          <VerificationBadge type={quest.verification} />
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {quest.title}
        </h1>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zen-sub">
          {quest.description}
        </p>

        <div className="mt-5 flex items-center gap-6 border-t border-zen-line pt-4">
          <div>
            <p className="text-xs text-zen-sub">獲得ポイント</p>
            <p className="text-xl font-semibold text-zen-accent">
              +{quest.rewardPoints} pt
            </p>
          </div>
          <div>
            <p className="text-xs text-zen-sub">習得スキル</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {grantSkills.length === 0 ? (
                <span className="text-sm text-zen-sub">—</span>
              ) : (
                grantSkills.map((s) => (
                  <span
                    key={s.id}
                    className={`badge ${
                      acquired.has(s.id)
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zen-accentSoft text-zen-accent"
                    }`}
                  >
                    {acquired.has(s.id) ? "✓ " : ""}
                    {s.name}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="mb-3 text-xs text-zen-sub">
          {VERIFICATION_HELP[quest.verification]}
        </p>
        <QuestActions
          questId={quest.id}
          verification={quest.verification}
          status={attempt?.status}
          reviewNote={attempt?.reviewNote}
          submission={attempt?.submission}
          questions={testQuestions}
        />
      </div>
    </div>
  );
}
