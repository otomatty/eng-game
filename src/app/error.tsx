"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/boundary";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 開発時のみコンソールに詳細を出す（本番では内部情報を露出させない）。
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <ErrorView error={error} reset={reset} />
    </div>
  );
}
