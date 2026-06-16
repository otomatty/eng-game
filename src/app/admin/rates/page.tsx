import { db } from "@/db";
import { rateTierSkills, rateTiers, skills } from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import {
  deleteRateTierAction,
  saveRateTierAction,
} from "@/app/actions/admin";
import { PageHeader } from "@/components/ui";

type TierRow = typeof rateTiers.$inferSelect;

export default async function AdminRatesPage() {
  await requireAdmin();

  const tiers = await db.select().from(rateTiers).orderBy(rateTiers.sortOrder);
  const allSkills = await db
    .select()
    .from(skills)
    .orderBy(skills.category, skills.name);
  const ts = await db.select().from(rateTierSkills);

  const skillsByTier = new Map<number, number[]>();
  for (const r of ts) {
    const arr = skillsByTier.get(r.rateTierId) ?? [];
    arr.push(r.skillId);
    skillsByTier.set(r.rateTierId, arr);
  }

  return (
    <div>
      <PageHeader
        title="単価レンジ管理"
        subtitle="スキルの組み合わせと想定単価（到達条件は全スキル習得）"
      />

      <details className="card mb-6">
        <summary className="cursor-pointer text-sm font-medium text-zen-accent">
          ＋ 新しい単価帯を追加
        </summary>
        <div className="mt-4">
          <TierForm skills={allSkills} />
        </div>
      </details>

      <div className="space-y-3">
        {tiers.map((t) => (
          <details key={t.id} className="card">
            <summary className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {t.name}
                  <span className="ml-2 text-sm text-zen-accent">
                    {t.estimatedRate}万円
                  </span>
                </p>
                <p className="text-xs text-zen-sub">
                  条件スキル {(skillsByTier.get(t.id) ?? []).length} 個 ・ 並び順{" "}
                  {t.sortOrder}
                </p>
              </div>
            </summary>
            <div className="mt-4 border-t border-zen-line pt-4">
              <TierForm
                skills={allSkills}
                tier={t}
                selectedSkillIds={skillsByTier.get(t.id) ?? []}
              />
              <form action={deleteRateTierAction} className="mt-3">
                <input type="hidden" name="id" value={t.id} />
                <button className="btn-danger text-xs">この単価帯を削除</button>
              </form>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function TierForm({
  skills: allSkills,
  tier,
  selectedSkillIds = [],
}: {
  skills: (typeof skills.$inferSelect)[];
  tier?: TierRow;
  selectedSkillIds?: number[];
}) {
  const selected = new Set(selectedSkillIds);
  return (
    <form action={saveRateTierAction} className="space-y-3">
      {tier && <input type="hidden" name="id" value={tier.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">単価帯名</label>
          <input
            name="name"
            className="input"
            defaultValue={tier?.name}
            required
          />
        </div>
        <div>
          <label className="label">想定単価（万円）</label>
          <input
            name="estimatedRate"
            type="number"
            min={0}
            className="input"
            defaultValue={tier?.estimatedRate ?? 40}
          />
        </div>
        <div>
          <label className="label">並び順</label>
          <input
            name="sortOrder"
            type="number"
            className="input"
            defaultValue={tier?.sortOrder ?? 0}
          />
        </div>
      </div>
      <div>
        <label className="label">説明</label>
        <input
          name="description"
          className="input"
          defaultValue={tier?.description}
        />
      </div>
      <div>
        <label className="label">到達条件スキル（すべて習得で到達）</label>
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
      <button className="btn-primary">{tier ? "更新する" : "作成する"}</button>
    </form>
  );
}
