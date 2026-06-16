import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { questAttempts } from "@/db/schema";
import { SideNav, type NavItem } from "@/components/nav";
import { requireAdmin } from "@/lib/guards";

const items: NavItem[] = [
  { href: "/admin", label: "ダッシュボード", icon: "📊" },
  { href: "/admin/quests", label: "クエスト管理", icon: "⚔️" },
  { href: "/admin/approvals", label: "クリア承認", icon: "✅" },
  { href: "/admin/skills", label: "スキル管理", icon: "🌳" },
  { href: "/admin/rates", label: "単価レンジ管理", icon: "📈" },
  { href: "/admin/users", label: "ユーザー管理", icon: "👥" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  const pending = (
    await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(questAttempts)
      .where(eq(questAttempts.status, "submitted"))
  )[0]?.c;

  return (
    <div className="flex min-h-screen">
      <SideNav
        items={items}
        title="管理者"
        userName={admin.name}
        badge={pending ? String(pending) : undefined}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
        {children}
      </main>
    </div>
  );
}
