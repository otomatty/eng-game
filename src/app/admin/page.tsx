import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  questAttempts,
  quests,
  rateTiers,
  skills,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import { PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default async function AdminDashboard() {
  await requireAdmin();

  const [
    pendingRows,
    questRows,
    publishedRows,
    userRows,
    skillRows,
    tierRows,
  ] = await Promise.all([
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(questAttempts)
      .where(eq(questAttempts.status, "submitted")),
    db.select({ c: sql<number>`COUNT(*)` }).from(quests),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(quests)
      .where(eq(quests.isPublished, true)),
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.role, "engineer")),
    db.select({ c: sql<number>`COUNT(*)` }).from(skills),
    db.select({ c: sql<number>`COUNT(*)` }).from(rateTiers),
  ]);

  const pending = pendingRows[0]?.c ?? 0;

  // 直近の申請
  const recent = await db
    .select({
      id: questAttempts.id,
      status: questAttempts.status,
      submittedAt: questAttempts.submittedAt,
      userName: users.name,
      title: quests.title,
    })
    .from(questAttempts)
    .innerJoin(users, eq(questAttempts.userId, users.id))
    .innerJoin(quests, eq(questAttempts.questId, quests.id))
    .orderBy(desc(questAttempts.id))
    .limit(8);

  return (
    <div className="space-y-8">
      <PageHeader
        title="管理ダッシュボード"
        subtitle="育成施策の運用状況"
      />

      {pending > 0 && (
        <Link
          href="/admin/approvals"
          className="flex items-center justify-between rounded-2xl border border-zen-gold/40 bg-zen-gold/10 px-5 py-4 transition hover:bg-zen-gold/20"
        >
          <span className="text-sm font-medium text-zen-ink">
            承認待ちのクリア申請が {pending} 件あります
          </span>
          <span className="text-sm text-zen-gold">承認する →</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="承認待ち" value={pending} unit="件" />
        <StatCard
          label="クエスト"
          value={questRows[0]?.c ?? 0}
          unit="件"
          hint={`公開 ${publishedRows[0]?.c ?? 0} 件`}
        />
        <StatCard label="エンジニア" value={userRows[0]?.c ?? 0} unit="名" />
        <StatCard label="スキル" value={skillRows[0]?.c ?? 0} unit="個" />
        <StatCard label="単価帯" value={tierRows[0]?.c ?? 0} unit="段階" />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">最近の申請</h2>
        {recent.length === 0 ? (
          <div className="card text-sm text-zen-sub">申請はまだありません。</div>
        ) : (
          <div className="card divide-y divide-zen-line p-0">
            {recent.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-zen-sub">{r.userName}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink href="/admin/quests" icon="⚔️" label="クエスト管理" />
        <QuickLink href="/admin/approvals" icon="✅" label="クリア承認" />
        <QuickLink href="/admin/skills" icon="🌳" label="スキル管理" />
        <QuickLink href="/admin/rates" icon="📈" label="単価レンジ管理" />
        <QuickLink href="/admin/users" icon="👥" label="ユーザー管理" />
      </section>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="card flex items-center gap-3 transition hover:border-zen-accent"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
