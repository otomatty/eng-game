import { requireUser } from "@/lib/guards";
import { getRateTierStatus } from "@/lib/domain";
import { PageHeader, ProgressBar } from "@/components/ui";

export default async function RatesPage() {
  const user = await requireUser();
  const tiers = await getRateTierStatus(user.id);

  const reached = tiers.filter((t) => t.reached);
  const current = reached[reached.length - 1];
  const next = tiers.find((t) => !t.reached);

  return (
    <div>
      <PageHeader
        title="単価レンジ"
        subtitle="スキルの習得が、想定単価にどうつながるか"
      />

      <div className="mb-6 rounded-3xl border border-zen-line bg-gradient-to-br from-white to-zen-accentSoft/40 p-6 text-center">
        <p className="text-xs text-zen-sub">現在の想定単価（月額）</p>
        <p className="mt-2 text-4xl font-semibold text-zen-accent">
          {user.currentEstimatedRate > 0
            ? `${user.currentEstimatedRate} 万円`
            : "—"}
        </p>
        {current && (
          <p className="mt-1 text-sm text-zen-sub">到達ランク: {current.name}</p>
        )}
        {next && (
          <p className="mt-2 text-xs text-zen-sub">
            次は「{next.name}」（{next.estimatedRate}万円）まであと {next.missingCount} スキル
          </p>
        )}
      </div>

      <div className="space-y-4">
        {tiers.map((tier) => {
          const total = tier.requiredSkills.length;
          const done = tier.requiredSkills.filter((s) => s.acquired).length;
          const pct = total === 0 ? 0 : (done / total) * 100;
          return (
            <div
              key={tier.id}
              className={`card ${tier.reached ? "border-zen-accent" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{tier.name}</h3>
                    {tier.reached && (
                      <span className="badge bg-emerald-50 text-emerald-700">
                        到達済み
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zen-sub">{tier.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-semibold text-zen-ink">
                    {tier.estimatedRate}
                    <span className="ml-0.5 text-xs font-normal text-zen-sub">
                      万円
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs text-zen-sub">
                  <span>到達条件スキル</span>
                  <span>
                    {done} / {total}
                  </span>
                </div>
                <ProgressBar value={pct} />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tier.requiredSkills.map((s) => (
                    <span
                      key={s.id}
                      className={`badge ${
                        s.acquired
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zen-bg text-zen-sub"
                      }`}
                    >
                      {s.acquired ? "✓ " : ""}
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-zen-sub">
        ※ 想定単価は運営が設定した目安です。実際の市場・客先単価とは異なる場合があります。
      </p>
    </div>
  );
}
