import { SideNav, type NavItem } from "@/components/nav";
import { requireUser } from "@/lib/guards";

const items: NavItem[] = [
  { href: "/home", label: "ホーム", icon: "🏠" },
  { href: "/quests", label: "クエスト", icon: "⚔️" },
  { href: "/skills", label: "スキルツリー", icon: "🌳" },
  { href: "/rates", label: "単価レンジ", icon: "📈" },
  { href: "/ranking", label: "ランキング", icon: "🏆" },
  { href: "/profile", label: "プロフィール", icon: "👤" },
];

export default async function EngineerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <SideNav items={items} title="エンジニア" userName={user.name} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
        {children}
      </main>
    </div>
  );
}
