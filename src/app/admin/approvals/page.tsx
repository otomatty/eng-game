import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { questAttempts, quests, skills, questSkills, users } from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import { approveAttemptAction, rejectAttemptAction } from "@/app/actions/admin";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

export default async function ApprovalsPage() {
  await requireAdmin();
  const db = getDb();

  const pending = await db
    .select({
      id: questAttempts.id,
      submission: questAttempts.submission,
      submittedAt: questAttempts.submittedAt,
      userName: users.name,
      questId: quests.id,
      questTitle: quests.title,
      rewardPoints: quests.rewardPoints,
    })
    .from(questAttempts)
    .innerJoin(users, eq(questAttempts.userId, users.id))
    .innerJoin(quests, eq(questAttempts.questId, quests.id))
    .where(eq(questAttempts.status, "submitted"))
    .orderBy(desc(questAttempts.submittedAt));

  // 各クエストの習得スキル
  const qs = await db
    .select({ questId: questSkills.questId, name: skills.name })
    .from(questSkills)
    .innerJoin(skills, eq(questSkills.skillId, skills.id));
  const skillsByQuest = new Map<number, string[]>();
  for (const r of qs) {
    const arr = skillsByQuest.get(r.questId) ?? [];
    arr.push(r.name);
    skillsByQuest.set(r.questId, arr);
  }

  return (
    <div>
      <PageHeader
        title="クリア承認"
        subtitle={`承認待ち ${pending.length} 件`}
      />

      {pending.length === 0 ? (
        <div className="card text-sm text-zen-sub">
          承認待ちの申請はありません。
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((p) => (
            <div key={p.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{p.questTitle}</p>
                  <p className="text-xs text-zen-sub">
                    申請者: {p.userName} ・{" "}
                    {p.submittedAt?.toLocaleString("ja-JP")}
                  </p>
                  <p className="mt-1 text-xs text-zen-sub">
                    承認すると +{p.rewardPoints}pt ・ スキル付与:{" "}
                    {(skillsByQuest.get(p.questId) ?? []).join(" / ") || "なし"}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-zen-bg p-3 text-sm">
                <p className="mb-1 text-xs text-zen-sub">提出物</p>
                <p className="whitespace-pre-wrap break-words">{p.submission}</p>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <form action={approveAttemptAction} className="sm:shrink-0">
                  <input type="hidden" name="attemptId" value={p.id} />
                  <button className="btn-primary w-full sm:w-auto">
                    承認する
                  </button>
                </form>
                <ActionForm action={rejectAttemptAction} className="flex-1">
                  <div className="flex gap-2">
                    <input type="hidden" name="attemptId" value={p.id} />
                    <input
                      name="reviewNote"
                      className="input"
                      placeholder="差し戻し理由（任意）"
                    />
                    <button className="btn-danger shrink-0">差し戻し</button>
                  </div>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
