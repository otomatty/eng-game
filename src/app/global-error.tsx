"use client";

import { ErrorView } from "@/components/boundary";
import "./globals.css";

// ルートレイアウト自体で発生した例外を捕捉する境界。
// 自前で <html> / <body> を描画する必要がある。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">
        <div className="mx-auto w-full max-w-4xl px-4 py-10">
          <ErrorView error={error} reset={reset} />
        </div>
      </body>
    </html>
  );
}
