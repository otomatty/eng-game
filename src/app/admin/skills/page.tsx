import { getDb } from "@/db";
import { skillDependencies, skills } from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import {
  addDependencyAction,
  deleteSkillAction,
  removeDependencyAction,
  saveSkillAction,
} from "@/app/actions/admin";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

type SkillRow = typeof skills.$inferSelect;

export default async function AdminSkillsPage() {
  await requireAdmin();
  const db = getDb();

  const allSkills = await db
    .select()
    .from(skills)
    .orderBy(skills.category, skills.name);
  const deps = await db.select().from(skillDependencies);
  const nameById = new Map(allSkills.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="スキル & ツリー管理"
        subtitle="スキルと前提関係（学習ルート）の設計"
      />

      {/* スキル作成 */}
      <details className="card">
        <summary className="cursor-pointer text-sm font-medium text-zen-accent">
          ＋ 新しいスキルを追加
        </summary>
        <div className="mt-4">
          <SkillForm />
        </div>
      </details>

      {/* スキル一覧 */}
      <section>
        <h2 className="mb-3 text-base font-semibold">スキル一覧</h2>
        <div className="space-y-2">
          {allSkills.map((s) => (
            <details key={s.id} className="card">
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <span className="pill mr-2">{s.category}</span>
                  <span className="font-medium">{s.name}</span>
                </div>
              </summary>
              <div className="mt-4 border-t border-zen-line pt-4">
                <SkillForm skill={s} />
                <form action={deleteSkillAction} className="mt-3">
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-danger text-xs">スキルを削除</button>
                </form>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* 前提関係 */}
      <section>
        <h2 className="mb-3 text-base font-semibold">前提関係（ツリーの枝）</h2>
        <div className="card mb-4">
          <ActionForm
            action={addDependencyAction}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex-1">
              <label className="label" htmlFor="dep-prerequisite">前提スキル</label>
              <select
                id="dep-prerequisite"
                name="prerequisiteSkillId"
                className="input"
                required
              >
                <option value="">選択…</option>
                {allSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="pb-2 text-zen-sub">→ 開放</span>
            <div className="flex-1">
              <label className="label" htmlFor="dep-unlocked">開放されるスキル</label>
              <select
                id="dep-unlocked"
                name="unlockedSkillId"
                className="input"
                required
              >
                <option value="">選択…</option>
                {allSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary">追加</button>
          </ActionForm>
        </div>

        <div className="card divide-y divide-zen-line p-0">
          {deps.length === 0 ? (
            <p className="px-5 py-4 text-sm text-zen-sub">
              前提関係はまだありません。
            </p>
          ) : (
            deps.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <p className="text-sm">
                  <span className="font-medium">
                    {nameById.get(d.prerequisiteSkillId)}
                  </span>
                  <span className="mx-2 text-zen-sub">→</span>
                  <span className="font-medium">
                    {nameById.get(d.unlockedSkillId)}
                  </span>
                </p>
                <form action={removeDependencyAction}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-xs text-red-600 hover:underline">
                    削除
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SkillForm({ skill }: { skill?: SkillRow }) {
  return (
    <ActionForm action={saveSkillAction} className="space-y-3">
      {skill && <input type="hidden" name="id" value={skill.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="skill-name">スキル名</label>
          <input
            id="skill-name"
            name="name"
            className="input"
            defaultValue={skill?.name}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="skill-category">カテゴリ</label>
          <input
            id="skill-category"
            name="category"
            className="input"
            defaultValue={skill?.category ?? "一般"}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="skill-description">説明</label>
        <input
          id="skill-description"
          name="description"
          className="input"
          defaultValue={skill?.description}
        />
      </div>
      <button className="btn-primary">{skill ? "更新" : "追加"}</button>
    </ActionForm>
  );
}
