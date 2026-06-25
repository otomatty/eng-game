"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/form";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * サーバーアクションを `useActionState` で実行し、検証エラーを最小限に表示する
 * 共通フォーム。エラー表示の唯一のクライアント境界として再利用する
 * （UI の大幅な再設計を避ける / Issue #3）。
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          {state.success}
        </p>
      )}
    </form>
  );
}
