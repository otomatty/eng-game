import Link from "next/link";
import { requireUser } from "@/lib/guards";
import { getTeamRanking, getUserRanking } from "@/lib/queries";
import { PageHeader } from "@/components/ui";

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const isTeam = tab === "team";

  return (
    <div>
      <PageHeader
        title="ランキング"
        subtitle="獲得ポイントで切磋琢磨しよう"
      />

      <div className="mb-5 inline-flex rounded-xl border border-zen-line bg-white p-1">
        <Tab href="/ranking" label="個人" active={!isTeam} />
        <Tab href="/ranking?tab=team" label="チーム" active={isTeam} />
      </div>

      {isTeam ? (
        <TeamRanking myTeamId={user.teamId} />
      ) : (
        <IndividualRanking myUserId={user.id} />
      )}

      <p className="mt-6 text-center text-[11px] text-zen-sub">
        ※ ランキングは自己成長の可視化が目的です。評価・査定には用いません。
      </p>
    </div>
  );
}

function Tab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-4 py-1.5 text-sm transition ${
        active ? "bg-zen-accent text-white" : "text-zen-sub hover:text-zen-ink"
      }`}
    >
      {label}
    </Link>
  );
}

async function IndividualRanking({ myUserId }: { myUserId: number }) {
  const ranking = await getUserRanking();
  return (
    <div className="space-y-2">
      {ranking.map((r) => {
        const me = r.id === myUserId;
        return (
          <div
            key={r.id}
            className={`flex items-center gap-4 rounded-2xl border px-4 py-3 ${
              me
                ? "border-zen-accent bg-zen-accentSoft"
                : "border-zen-line bg-white"
            }`}
          >
            <RankBadge rank={r.rank} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {r.name}
                {me && <span className="ml-2 text-xs text-zen-accent">あなた</span>}
              </p>
              <p className="text-xs text-zen-sub">
                {r.teamName ?? "未所属"} ・ 想定単価 {r.estimatedRate}万円
              </p>
            </div>
            <p className="shrink-0 font-semibold text-zen-accent">
              {r.totalPoints.toLocaleString()}
              <span className="ml-0.5 text-xs font-normal text-zen-sub">pt</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

async function TeamRanking({ myTeamId }: { myTeamId: number | null }) {
  const ranking = await getTeamRanking();
  return (
    <div className="space-y-2">
      {ranking.map((r) => {
        const mine = r.teamId === myTeamId;
        return (
          <div
            key={r.teamId}
            className={`flex items-center gap-4 rounded-2xl border px-4 py-3 ${
              mine
                ? "border-zen-accent bg-zen-accentSoft"
                : "border-zen-line bg-white"
            }`}
          >
            <RankBadge rank={r.rank} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {r.teamName}
                {mine && (
                  <span className="ml-2 text-xs text-zen-accent">自チーム</span>
                )}
              </p>
              <p className="text-xs text-zen-sub">{r.memberCount} 名</p>
            </div>
            <p className="shrink-0 font-semibold text-zen-accent">
              {Number(r.totalPoints).toLocaleString()}
              <span className="ml-0.5 text-xs font-normal text-zen-sub">pt</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
      {medal ? (
        <span className="text-xl">{medal}</span>
      ) : (
        <span className="text-sm font-semibold text-zen-sub">{rank}</span>
      )}
    </div>
  );
}
