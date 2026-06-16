import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { questSkills, skills } from "@/db/schema";
import { requireUser } from "@/lib/guards";
import { getRecommendedQuests, getRateTierStatus } from "@/lib/domain";
import { getAcquiredSkillCount, getUserRank } from "@/lib/queries";
import { QuestCard, StatCard } from "@/components/ui";

export default async function HomePage() {
  const user = await requireUser();
  const db = getDb();

  const [skillCount, rank, recommended, tierStatus] = await Promise.all([
    getAcquiredSkillCount(user.id),
    getUserRank(user.id),
    getRecommendedQuests(user.id, 3),
    getRateTierStatus(user.id),
  ]);

  // 推奨クエストの習得スキル名を取得
  const questIds = recommended.map((q) => q.id);
  const skillRows = questIds.length
    ? await db
        .select({ questId: questSkills.questId, name: skills.name })
        .from(questSkills)
        .innerJoin(skills, eq(questSkills.skillId, skills.id))
        .where(inArray(questSkills.questId, questIds))
    : [];
  const skillsByQuest = new Map<number, string[]>();
  for (const r of skillRows) {
    const arr = skillsByQuest.get(r.questId) ?? [];
    arr.push(r.name);
    skillsByQuest.set(r.questId, arr);
  }

  const reachedTiers = tierStatus.filter((t) => t.reached);
  const currentTier = reachedTiers[reachedTiers.length - 1];
  const nextTier = tierStatus.find((t) => !t.reached);

  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "こんばんは" : hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";

  return (
    <div className="space-y-8">
      {/* 禅ステータス: 現在地を静かに提示 */}
      <section className="rounded-3xl border border-zen-line bg-gradient-to-br from-white to-zen-accentSoft/40 p-8 text-center">
        <p className="text-sm text-zen-sub">
          {greeting}、{user.name} さん
        </p>
        <p className="mt-4 text-4xl font-semibold tracking-tight text-zen-accent">
          {user.currentEstimatedRate > 0
            ? `${user.currentEstimatedRate} 万円`
            : "—"}
        </p>
        <p className="mt-1 text-xs text-zen-sub">
          現在の想定単価（月額）
          {currentTier && ` ・ ${currentTier.name}`}
        </p>
      </section>

      {/* サマリ */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="習得スキル" value={skillCount} unit="個" />
        <StatCard
          label="累積ポイント"
          value={user.totalPoints.toLocaleString()}
          unit="pt"
        />
        <StatCard
          label="個人ランキング"
          value={rank ? `${rank}` : "—"}
          unit={rank ? "位" : ""}
        />
      </section>

      {/* 次の単価帯までの距離 */}
      {nextTier && (
        <section className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zen-sub">次に到達できる単価帯</p>
              <p className="mt-1 font-medium">
                {nextTier.name}（{nextTier.estimatedRate} 万円）
              </p>
            </div>
            <Link href="/rates" className="btn-ghost text-xs">
              詳しく見る
            </Link>
          </div>
          <p className="mt-3 text-sm text-zen-sub">
            あと <span className="font-semibold text-zen-ink">{nextTier.missingCount}</span> スキルで到達:{" "}
            {nextTier.requiredSkills
              .filter((s) => !s.acquired)
              .map((s) => s.name)
              .join(" / ")}
          </p>
        </section>
      )}

      {/* 次の一手レコメンド */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">次の一手</h2>
          <Link href="/quests" className="text-sm text-zen-accent">
            すべてのクエスト →
          </Link>
        </div>
        {recommended.length === 0 ? (
          <div className="card text-sm text-zen-sub">
            挑戦できるクエストはすべて完了しました。新しいクエストの公開をお待ちください。
          </div>
        ) : (
          <div className="grid gap-3">
            {recommended.map((q) => (
              <QuestCard
                key={q.id}
                id={q.id}
                title={q.title}
                category={q.category}
                rewardPoints={q.rewardPoints}
                verification={q.verification}
                description={q.description}
                skills={skillsByQuest.get(q.id)}
                recommended
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
