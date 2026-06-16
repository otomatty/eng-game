import { getDb } from "@/db";
import { questSkills, quests, skills } from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import {
  deleteQuestAction,
  saveQuestAction,
  toggleQuestPublishAction,
} from "@/app/actions/admin";
import { PageHeader, VerificationBadge } from "@/components/ui";

type QuestRow = typeof quests.$inferSelect;

export default async function AdminQuestsPage() {
  await requireAdmin();
  const db = getDb();

  const allQuests = await db.select().from(quests).orderBy(quests.id);
  const allSkills = await db.select().from(skills).orderBy(skills.category, skills.name);
  const qs = await db.select().from(questSkills);

  const skillsByQuest = new Map<number, number[]>();
  for (const r of qs) {
    const arr = skillsByQuest.get(r.questId) ?? [];
    arr.push(r.skillId);
    skillsByQuest.set(r.questId, arr);
  }
  const skillName = new Map(allSkills.map((s) => [s.id, s.name]));

  return (
    <div>
      <PageHeader title="クエスト管理" subtitle="学習課題の作成・編集" />

      <details className="card mb-6">
        <summary className="cursor-pointer text-sm font-medium text-zen-accent">
          ＋ 新しいクエストを作成
        </summary>
        <div className="mt-4">
          <QuestForm skills={allSkills} />
        </div>
      </details>

      <div className="space-y-3">
        {allQuests.map((q) => (
          <details key={q.id} className="card">
            <summary className="flex cursor-pointer items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill">{q.category}</span>
                  <VerificationBadge type={q.verification} />
                  {q.isPublished ? (
                    <span className="badge bg-emerald-50 text-emerald-700">
                      公開中
                    </span>
                  ) : (
                    <span className="badge bg-zen-bg text-zen-sub">非公開</span>
                  )}
                </div>
                <p className="mt-1 truncate font-medium">{q.title}</p>
                <p className="text-xs text-zen-sub">
                  +{q.rewardPoints}pt ・ 習得:{" "}
                  {(skillsByQuest.get(q.id) ?? [])
                    .map((id) => skillName.get(id))
                    .join(" / ") || "なし"}
                </p>
              </div>
            </summary>

            <div className="mt-4 border-t border-zen-line pt-4">
              <div className="mb-4 flex flex-wrap gap-2">
                <form action={toggleQuestPublishAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <input
                    type="hidden"
                    name="publish"
                    value={String(!q.isPublished)}
                  />
                  <button className="btn-ghost text-xs">
                    {q.isPublished ? "非公開にする" : "公開する"}
                  </button>
                </form>
                <form action={deleteQuestAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <button className="btn-danger text-xs">削除</button>
                </form>
              </div>
              <QuestForm
                skills={allSkills}
                quest={q}
                selectedSkillIds={skillsByQuest.get(q.id) ?? []}
              />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function QuestForm({
  skills: allSkills,
  quest,
  selectedSkillIds = [],
}: {
  skills: (typeof skills.$inferSelect)[];
  quest?: QuestRow;
  selectedSkillIds?: number[];
}) {
  const selected = new Set(selectedSkillIds);
  return (
    <form action={saveQuestAction} className="space-y-3">
      {quest && <input type="hidden" name="id" value={quest.id} />}
      <div>
        <label className="label" htmlFor="quest-title">タイトル</label>
        <input
          id="quest-title"
          name="title"
          className="input"
          defaultValue={quest?.title}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="quest-description">説明</label>
        <textarea
          id="quest-description"
          name="description"
          className="input min-h-20"
          defaultValue={quest?.description}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="quest-category">カテゴリ</label>
          <input
            id="quest-category"
            name="category"
            className="input"
            defaultValue={quest?.category ?? "一般"}
          />
        </div>
        <div>
          <label className="label" htmlFor="quest-rewardPoints">獲得ポイント</label>
          <input
            id="quest-rewardPoints"
            name="rewardPoints"
            type="number"
            min={0}
            className="input"
            defaultValue={quest?.rewardPoints ?? 100}
          />
        </div>
        <div>
          <label className="label" htmlFor="quest-verification">検証方式</label>
          <select
            id="quest-verification"
            name="verification"
            className="input"
            defaultValue={quest?.verification ?? "self"}
          >
            <option value="self">自己申告</option>
            <option value="approval">成果物提出＋承認</option>
            <option value="test">テスト合格</option>
          </select>
        </div>
      </div>
      <div>
        <p className="label">習得スキル（クリアで付与）</p>
        <div className="flex flex-wrap gap-2">
          {allSkills.map((s) => (
            <label
              key={s.id}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zen-line bg-white px-2.5 py-1 text-xs has-[:checked]:border-zen-accent has-[:checked]:bg-zen-accentSoft has-[:checked]:text-zen-accent"
            >
              <input
                type="checkbox"
                name="skillIds"
                value={s.id}
                defaultChecked={selected.has(s.id)}
                className="accent-zen-accent"
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPublished"
          defaultChecked={quest?.isPublished ?? false}
          className="accent-zen-accent"
        />
        公開する
      </label>
      <div>
        <button className="btn-primary">
          {quest ? "更新する" : "作成する"}
        </button>
      </div>
    </form>
  );
}
