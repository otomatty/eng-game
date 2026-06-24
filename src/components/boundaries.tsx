import Link from "next/link";

/**
 * App Router の境界（error / not-found / loading）で共有する純粋な表示部品。
 * 副作用を持たないため、ルートの境界ファイルから薄く呼び出してテスト可能に保つ。
 */

function BoundaryShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md text-center">{children}</div>
    </div>
  );
}

export function ErrorState({
  title = "問題が発生しました",
  description = "予期しないエラーが発生しました。時間をおいて再度お試しください。",
  digest,
  onReset,
  resetLabel = "再試行",
  homeHref,
  homeLabel = "ホームへ戻る",
}: {
  title?: string;
  description?: string;
  /** Next.js が付与する参照用ダイジェスト。内部情報は含まれない。 */
  digest?: string;
  onReset?: () => void;
  resetLabel?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <BoundaryShell>
      <p className="text-3xl" aria-hidden="true">
        ⚠️
      </p>
      <h1 className="mt-3 text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-zen-sub">{description}</p>
      {digest && (
        <p className="mt-3 text-xs text-zen-sub">
          エラー ID: <span className="font-mono">{digest}</span>
        </p>
      )}
      {(onReset !== undefined || homeHref !== undefined) && (
        <div className="mt-5 flex items-center justify-center gap-3">
          {onReset && (
            <button type="button" className="btn-primary" onClick={onReset}>
              {resetLabel}
            </button>
          )}
          {homeHref && (
            <Link href={homeHref} className="btn-ghost">
              {homeLabel}
            </Link>
          )}
        </div>
      )}
    </BoundaryShell>
  );
}

export function NotFoundState({
  homeHref = "/",
  homeLabel = "ホームへ戻る",
}: {
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <BoundaryShell>
      <p className="text-4xl font-semibold tracking-tight text-zen-accent">
        404
      </p>
      <h1 className="mt-3 text-lg font-semibold tracking-tight">
        ページが見つかりません
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zen-sub">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <div className="mt-5 flex items-center justify-center">
        <Link href={homeHref} className="btn-primary">
          {homeLabel}
        </Link>
      </div>
    </BoundaryShell>
  );
}

export function LoadingState({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">{label}</span>
      <div className="h-7 w-40 animate-pulse rounded-lg bg-zen-line" />
      <div className="card space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-zen-line" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-zen-line" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-zen-line" />
      </div>
    </div>
  );
}
