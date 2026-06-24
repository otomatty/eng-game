"use client";

import { useEffect } from "react";

/**
 * ルートレイアウト自体を含む致命的なエラーの境界。
 * このコンポーネントはルートレイアウトを置き換えるため、自身で <html>/<body> を描画する。
 * globals.css に依存できないため、禅・ミニマルなトーンをインラインスタイルで再現する。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f7f6f3",
          color: "#2b2b29",
          fontFamily:
            'system-ui, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            margin: "0 1rem",
            padding: "1.5rem",
            textAlign: "center",
            borderRadius: "1rem",
            border: "1px solid #e7e5df",
            backgroundColor: "#ffffff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <p style={{ fontSize: "1.875rem", margin: 0 }} aria-hidden="true">
            ⚠️
          </p>
          <h1
            style={{
              marginTop: "0.75rem",
              fontSize: "1.125rem",
              fontWeight: 600,
            }}
          >
            問題が発生しました
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#6b6a64",
            }}
          >
            予期しないエラーが発生しました。時間をおいて再度お試しください。
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.75rem",
                fontSize: "0.75rem",
                color: "#6b6a64",
              }}
            >
              エラー ID:{" "}
              <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#ffffff",
              backgroundColor: "#3f7d6e",
              border: "none",
              borderRadius: "0.75rem",
              cursor: "pointer",
            }}
          >
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}
