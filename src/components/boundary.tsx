import Link from "next/link";

/**
 * App Router の境界（error / not-found / loading）で共有する表示用コンポーネント。
 *
 * 副作用を持たず props のみで描画が決まる純粋な表示コンポーネントとして切り出し、
 * 単体テスト可能にする（境界ファイル本体は Next.js ランタイムに依存するため）。
 */

/**
 * 未捕捉例外を表示するエラービュー。
 *
 * 本番（NODE_ENV !== "development"）では `error.message` やスタックなどの
 * 内部情報を露出しない。`digest`（Next.js が払い出すエラー参照ID）のみ表示する。
 */
export function ErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const showDetail = process.env.NODE_ENV === "development";

  return (
    <div className="card mx-auto mt-16 max-w-md text-center">
      <p className="text-3xl" aria-hidden>
        ⚠️
      </p>
      <h1 className="mt-3 text-lg font-semibold tracking-tight">
        問題が発生しました
      </h1>
      <p className="mt-2 text-sm text-zen-sub">
        一時的なエラーが発生しました。お手数ですが、もう一度お試しください。
      </p>
      {showDetail && error.message && (
        <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-zen-bg p-3 text-left text-xs text-zen-sub">
          {error.message}
        </pre>
      )}
      {error.digest && (
        <p className="mt-3 text-[11px] text-zen-sub">エラーID: {error.digest}</p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            reset();
          }}
        >
          再試行
        </button>
        <Link href="/" className="btn-ghost">
          ホームへ戻る
        </Link>
      </div>
    </div>
  );
}

/** 404（未検出）を表示するビュー。 */
export function NotFoundView() {
  return (
    <div className="card mx-auto mt-16 max-w-md text-center">
      <p className="text-3xl" aria-hidden>
        🔍
      </p>
      <h1 className="mt-3 text-lg font-semibold tracking-tight">
        ページが見つかりません
      </h1>
      <p className="mt-2 text-sm text-zen-sub">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <div className="mt-5 flex justify-center">
        <Link href="/" className="btn-primary">
          ホームへ戻る
        </Link>
      </div>
    </div>
  );
}

/** 遷移中（ローディング）を表示するビュー。 */
export function LoadingView({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-zen-sub"
    >
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-zen-line border-t-zen-accent"
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}
