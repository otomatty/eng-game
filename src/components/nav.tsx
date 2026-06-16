"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };

export function SideNav({
  items,
  title,
  userName,
  badge,
}: {
  items: NavItem[];
  title: string;
  userName: string;
  badge?: string;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* PC: 左サイドバー */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zen-line bg-zen-surface px-4 py-6 md:flex">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zen-accent text-white">
              禅
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">
                Engineer Quest
              </p>
              <p className="text-[11px] text-zen-sub">{title}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/home" &&
                item.href !== "/admin" &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  active
                    ? "bg-zen-accentSoft font-medium text-zen-accent"
                    : "text-zen-sub hover:bg-zen-bg hover:text-zen-ink"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
                {badge && item.href.includes("approval") && (
                  <span className="ml-auto rounded-full bg-zen-gold px-1.5 text-[10px] text-white">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-zen-line pt-4">
          <p className="px-3 text-xs text-zen-sub">{userName}</p>
          <form action="/api/logout" method="post">
            <button className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm text-zen-sub hover:bg-zen-bg">
              ログアウト
            </button>
          </form>
        </div>
      </aside>

      {/* モバイル: 下部タブ */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-zen-line bg-zen-surface md:hidden">
        {items.slice(0, 5).map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/home" &&
              item.href !== "/admin" &&
              pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
                active ? "text-zen-accent" : "text-zen-sub"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
