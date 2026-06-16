import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { questAttempts, questSkills, quests, skills } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { PageHeader, QuestCard, StatusBadge } from "@/components/ui";

export default async function QuestListPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await requireUser();
  const { category } = await searchParams;

  const published = await db
    .select()
    .from(quests)
    .where(eq(quests.isPublished, true));

  const categories = Array.from(
    new Set(published.map((q) => q.category)),
  ).sort();

  const filtered = category
    ? published.filter((q) => q.category === category)
    : published;

  // 付与スキル
  const ids = filtered.map((q) => q.id);
  const skillRows = ids.length
    ? await db
        .select({ questId: questSkills.questId, name: skills.name })
        .from(questSkills)
        .innerJoin(skills, eq(questSkills.skillId, skills.id))
        .where(inArray(questSkills.questId, ids))
    : [];
  const skillsByQuest = new Map<number, string[]>();
  for (const r of skillRows) {
    const arr = skillsByQuest.get(r.questId) ?? [];
    arr.push(r.name);
    skillsByQuest.set(r.questId, arr);
  }

  // 自分の挑戦状況
  const myAttempts = await db
    .select()
    .from(questAttempts)
    .where(eq(questAttempts.userId, user.id));
  const statusByQuest = new Map<number, string>();
  for (const a of myAttempts) {
    // 完了 > 承認待ち/挑戦中 > 差し戻し の優先で表示
    const prev = statusByQuest.get(a.questId);
    const rank = (s: string) =>
      ["completed", "approved", "submitted", "in_progress", "rejected"].indexOf(s);
    if (prev === undefined || rank(a.status) < rank(prev)) {
      statusByQuest.set(a.questId, a.status);
    }
  }

  return (
    <div>
      <PageHeader
        title="クエスト"
        subtitle="挑戦してスキルを習得しよう"
      />

      {/* カテゴリ絞り込み */}
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip label="すべて" href="/quests" active={!category} />
        {categories.map((c) => (
          <FilterChip
            key={c}
            label={c}
            href={`/quests?category=${encodeURIComponent(c)}`}
            active={category === c}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-sm text-zen-sub">
          該当するクエストがありません。
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((q) => {
            const status = statusByQuest.get(q.id);
            return (
              <div key={q.id} className="relative">
                <QuestCard
                  id={q.id}
                  title={q.title}
                  category={q.category}
                  rewardPoints={q.rewardPoints}
                  verification={q.verification}
                  description={q.description}
                  skills={skillsByQuest.get(q.id)}
                />
                {status && (
                  <div className="pointer-events-none absolute right-4 top-4">
                    <StatusBadge status={status} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`badge border ${
        active
          ? "border-zen-accent bg-zen-accentSoft text-zen-accent"
          : "border-zen-line bg-white text-zen-sub hover:bg-zen-bg"
      }`}
    >
      {label}
    </Link>
  );
}
