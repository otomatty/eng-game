"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/boundaries";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // エラー監視サービス（Sentry 等）の導入は別 issue。ここでは最低限ログに残す。
    console.error(error);
  }, [error]);

  return <ErrorState digest={error.digest} onReset={reset} homeHref="/" />;
}
