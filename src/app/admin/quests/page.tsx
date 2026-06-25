import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  questQuestionChoices,
  questQuestions,
  questSkills,
  quests,
  skills,
} from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import {
  deleteQuestAction,
  deleteQuestionAction,
  saveQuestAction,
  saveQuestionAction,
  toggleQuestPublishAction,
} from "@/app/actions/admin";
import { PageHeader, VerificationBadge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

type QuestRow = typeof quests.$inferSelect;
type QuestionRow = typeof questQuestions.$inferSelect;
type ChoiceRow = typeof questQuestionChoices.$inferSelect;

export default async function AdminQuestsPage() {
  await requireAdmin();
  const db = getDb();

  const allQuests = await db.select().from(quests).orderBy(quests.id);
  const allSkills = await db.select().from(skills).orderBy(skills.category, skills.name);
  const qs = await db.select().from(questSkills);
  const allQuestions = await db
    .select()
    .from(questQuestions)
    .orderBy(asc(questQuestions.sortOrder), asc(questQuestions.id));
  const allChoices = await db
    .select()
    .from(questQuestionChoices)
    .orderBy(asc(questQuestionChoices.sortOrder), asc(questQuestionChoices.id));

  const questionsByQuest = new Map<number, QuestionRow[]>();
  for (const q of allQuestions) {
    const arr = questionsByQuest.get(q.questId) ?? [];
    arr.push(q);
    questionsByQuest.set(q.questId, arr);
  }
  const choicesByQuestion = new Map<number, ChoiceRow[]>();
  for (const c of allChoices) {
    const arr = choicesByQuestion.get(c.questionId) ?? [];
    arr.push(c);
    choicesByQuestion.set(c.questionId, arr);
  }

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

              {q.verification === "test" && (
                <QuestionsManager
                  questId={q.id}
                  questions={questionsByQuest.get(q.id) ?? []}
                  choicesByQuestion={choicesByQuestion}
                />
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

/** テスト型クエストの設問管理（一覧・削除・追加）。 */
function QuestionsManager({
  questId,
  questions,
  choicesByQuestion,
}: {
  questId: number;
  questions: QuestionRow[];
  choicesByQuestion: Map<number, ChoiceRow[]>;
}) {
  return (
    <div className="mt-6 border-t border-zen-line pt-4">
      <p className="mb-2 text-sm font-medium">
        テスト設問（{questions.length}問）
      </p>
      {questions.length === 0 ? (
        <p className="mb-3 text-xs text-amber-600">
          設問が未設定です。受験者は合格できません。下のフォームから追加してください。
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {questions.map((question, i) => (
            <li
              key={question.id}
              className="rounded-lg border border-zen-line bg-zen-bg px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    問{i + 1}. {question.prompt}
                  </p>
                  {question.kind === "single" ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-zen-sub">
                      {(choicesByQuestion.get(question.id) ?? []).map((c) => (
                        <li key={c.id}>
                          {c.isCorrect ? "✓ " : "・"}
                          <span
                            className={
                              c.isCorrect ? "font-medium text-emerald-700" : ""
                            }
                          >
                            {c.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-zen-sub">
                      完全一致の正解:{" "}
                      <span className="font-medium text-emerald-700">
                        {question.correctText}
                      </span>
                    </p>
                  )}
                </div>
                <form action={deleteQuestionAction}>
                  <input type="hidden" name="id" value={question.id} />
                  <button className="btn-ghost shrink-0 text-xs">削除</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-lg border border-zen-line bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-zen-accent">
          ＋ 設問を追加
        </summary>
        <div className="mt-3">
          <ActionForm action={saveQuestionAction} className="space-y-3">
            <input type="hidden" name="questId" value={questId} />
            <div>
              <label className="label" htmlFor={`q-prompt-${questId}`}>
                設問文
              </label>
              <textarea
                id={`q-prompt-${questId}`}
                name="prompt"
                className="input min-h-16"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor={`q-kind-${questId}`}>
                採点方式
              </label>
              <select
                id={`q-kind-${questId}`}
                name="kind"
                className="input"
                defaultValue="single"
              >
                <option value="single">選択式（正解の選択肢を選ぶ）</option>
                <option value="text">完全一致（正解の文字列）</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`q-choices-${questId}`}>
                選択肢（選択式の場合）
              </label>
              <textarea
                id={`q-choices-${questId}`}
                name="choicesRaw"
                className="input min-h-24 font-mono text-xs"
                placeholder={"1行に1つ。正解の行頭に * を付けます。\n*正しい答え\n間違いの答え1\n間違いの答え2"}
              />
              <p className="mt-1 text-xs text-zen-sub">
                1行1つ・正解の行頭に <code>*</code> を付与（2つ以上・正解1つ以上）。
              </p>
            </div>
            <div>
              <label className="label" htmlFor={`q-correct-${questId}`}>
                正解の文字列（完全一致の場合）
              </label>
              <input
                id={`q-correct-${questId}`}
                name="correctText"
                className="input"
                placeholder="大文字小文字・前後の空白は無視して判定します"
              />
            </div>
            <button className="btn-primary text-sm">設問を追加する</button>
          </ActionForm>
        </div>
      </details>
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
    <ActionForm action={saveQuestAction} className="space-y-3">
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
        <label className="label" htmlFor="quest-passThreshold">
          合格基準（正答率 %・テスト型のみ）
        </label>
        <input
          id="quest-passThreshold"
          name="passThreshold"
          type="number"
          min={1}
          max={100}
          className="input sm:max-w-40"
          defaultValue={quest?.passThreshold ?? 100}
        />
        <p className="mt-1 text-xs text-zen-sub">
          100 = 全問正解で合格 / 例: 60 = 6割以上の正答で合格。
        </p>
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
    </ActionForm>
  );
}
