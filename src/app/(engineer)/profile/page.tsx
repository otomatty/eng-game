import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  questAttempts,
  quests,
  skills,
  teams,
  userSkills,
} from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { getUserRank } from "@/lib/queries";
import { PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default async function ProfilePage() {
  const user = await requireUser();
  const db = getDb();

  const [team] = user.teamId
    ? await db.select().from(teams).where(eq(teams.id, user.teamId)).limit(1)
    : [undefined];

  const mySkills = await db
    .select({
      name: skills.name,
      category: skills.category,
      acquiredAt: userSkills.acquiredAt,
    })
    .from(userSkills)
    .innerJoin(skills, eq(userSkills.skillId, skills.id))
    .where(eq(userSkills.userId, user.id))
    .orderBy(desc(userSkills.acquiredAt));

  const rank = await getUserRank(user.id);

  // 完了クエスト履歴
  const attempts = await db
    .select({
      id: questAttempts.id,
      status: questAttempts.status,
      approvedAt: questAttempts.approvedAt,
      submittedAt: questAttempts.submittedAt,
      title: quests.title,
      points: quests.rewardPoints,
    })
    .from(questAttempts)
    .innerJoin(quests, eq(questAttempts.questId, quests.id))
    .where(eq(questAttempts.userId, user.id))
    .orderBy(desc(questAttempts.id))
    .limit(20);

  // カテゴリ別スキル集計
  const byCategory = new Map<string, number>();
  for (const s of mySkills) {
    byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <PageHeader title="プロフィール" subtitle="あなたの成長の記録" />

      <section className="card flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zen-accent text-2xl text-white">
          {user.name.slice(0, 1)}
        </div>
        <div>
          <p className="text-lg font-semibold">{user.name}</p>
          <p className="text-sm text-zen-sub">{user.email}</p>
          <p className="mt-1 text-xs text-zen-sub">
            {team?.name ?? "チーム未所属"} ・{" "}
            {user.role === "admin" ? "管理者" : "エンジニア"}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="想定単価" value={user.currentEstimatedRate} unit="万円" />
        <StatCard label="習得スキル" value={mySkills.length} unit="個" />
        <StatCard
          label="累積ポイント"
          value={user.totalPoints.toLocaleString()}
          unit="pt"
        />
        <StatCard label="順位" value={rank ?? "—"} unit={rank ? "位" : ""} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">習得スキル</h2>
        {mySkills.length === 0 ? (
          <div className="card text-sm text-zen-sub">
            まだスキルを習得していません。クエストに挑戦しましょう。
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(byCategory.entries()).map(([cat, count]) => (
              <div key={cat} className="card">
                <p className="mb-2 text-xs font-medium text-zen-sub">
                  {cat}（{count}）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {mySkills
                    .filter((s) => s.category === cat)
                    .map((s) => (
                      <span
                        key={s.name}
                        className="badge bg-zen-accentSoft text-zen-accent"
                      >
                        {s.name}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">最近の挑戦</h2>
        {attempts.length === 0 ? (
          <div className="card text-sm text-zen-sub">
            まだ挑戦の記録がありません。
          </div>
        ) : (
          <div className="card divide-y divide-zen-line p-0">
            {attempts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-zen-sub">
                    {(a.approvedAt ?? a.submittedAt)?.toLocaleDateString("ja-JP") ??
                      "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {["completed", "approved"].includes(a.status) && (
                    <span className="text-xs text-zen-accent">+{a.points}pt</span>
                  )}
                  <StatusBadge status={a.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
