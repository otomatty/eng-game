import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zen-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="card">
      <p className="text-xs text-zen-sub">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-zen-sub">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-zen-sub">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zen-line">
      <div
        className="h-full rounded-full bg-zen-accent transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const VERIFICATION_LABEL: Record<string, string> = {
  self: "自己申告",
  approval: "承認制",
  test: "テスト",
};
const VERIFICATION_STYLE: Record<string, string> = {
  self: "bg-emerald-50 text-emerald-700",
  approval: "bg-amber-50 text-amber-700",
  test: "bg-sky-50 text-sky-700",
};

export function VerificationBadge({ type }: { type: string }) {
  return (
    <span className={`badge ${VERIFICATION_STYLE[type] ?? "bg-zen-bg text-zen-sub"}`}>
      {VERIFICATION_LABEL[type] ?? type}
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: "挑戦中",
  submitted: "承認待ち",
  approved: "完了",
  completed: "完了",
  rejected: "差し戻し",
};
const STATUS_STYLE: Record<string, string> = {
  in_progress: "bg-sky-50 text-sky-700",
  submitted: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_STYLE[status] ?? "bg-zen-bg text-zen-sub"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="card text-center text-sm text-zen-sub">{children}</div>
  );
}

export function QuestCard({
  id,
  title,
  category,
  rewardPoints,
  verification,
  description,
  skills,
  recommended,
}: {
  id: number;
  title: string;
  category: string;
  rewardPoints: number;
  verification: string;
  description?: string;
  skills?: string[];
  recommended?: boolean;
}) {
  return (
    <Link
      href={`/quests/${id}`}
      className="card block transition hover:border-zen-accent hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill">{category}</span>
            <VerificationBadge type={verification} />
            {recommended && (
              <span className="badge bg-zen-gold/15 text-zen-gold">おすすめ</span>
            )}
          </div>
          <h3 className="mt-2 truncate font-medium">{title}</h3>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-zen-sub">
              {description}
            </p>
          )}
          {skills && skills.length > 0 && (
            <p className="mt-2 text-xs text-zen-sub">
              習得: {skills.join(" / ")}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold text-zen-accent">
            +{rewardPoints}
          </p>
          <p className="text-[11px] text-zen-sub">pt</p>
        </div>
      </div>
    </Link>
  );
}
