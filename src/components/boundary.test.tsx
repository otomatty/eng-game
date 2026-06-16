import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorView, NotFoundView, LoadingView } from "./boundary";

/**
 * 観点表:
 * - ErrorView:
 *   - 正常系: 見出し・汎用メッセージを表示し、「再試行」で reset が呼ばれる。
 *   - 異常系（本番安全）: 本番(NODE_ENV!=="development")では error.message を露出しない。
 *   - 境界値: digest があれば表示し、なければ表示しない。開発時は詳細(message)を表示する。
 * - NotFoundView: 見出しとホームリンクを表示する。
 * - LoadingView: role=status のローダーと（境界値として）任意ラベルを表示する。
 */

describe("ErrorView", () => {
  describe("正常系", () => {
    it("エラー見出しと汎用メッセージを表示する", () => {
      render(<ErrorView error={new Error("boom")} reset={vi.fn()} />);
      expect(screen.getByText("問題が発生しました")).toBeInTheDocument();
      expect(
        screen.getByText(/もう一度お試しください/),
      ).toBeInTheDocument();
    });

    it("「再試行」ボタン押下で reset が呼ばれる", async () => {
      const reset = vi.fn();
      render(<ErrorView error={new Error("boom")} reset={reset} />);
      await userEvent.click(screen.getByRole("button", { name: "再試行" }));
      expect(reset).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系（本番安全）", () => {
    it("本番環境では error.message を露出しない", () => {
      // vitest 既定の NODE_ENV は "test"（= 非 development）
      render(
        <ErrorView error={new Error("内部スタックトレース")} reset={vi.fn()} />,
      );
      expect(
        screen.queryByText("内部スタックトレース"),
      ).not.toBeInTheDocument();
    });
  });

  describe("境界値", () => {
    it("開発環境では詳細(message)を表示する", () => {
      vi.stubEnv("NODE_ENV", "development");
      render(<ErrorView error={new Error("詳細メッセージ")} reset={vi.fn()} />);
      expect(screen.getByText("詳細メッセージ")).toBeInTheDocument();
      vi.unstubAllEnvs();
    });

    it("digest があればエラーIDを表示する", () => {
      const error: Error & { digest?: string } = Object.assign(
        new Error("boom"),
        { digest: "abc123" },
      );
      render(<ErrorView error={error} reset={vi.fn()} />);
      expect(screen.getByText(/エラーID: abc123/)).toBeInTheDocument();
    });

    it("digest がなければエラーIDを表示しない", () => {
      render(<ErrorView error={new Error("boom")} reset={vi.fn()} />);
      expect(screen.queryByText(/エラーID:/)).not.toBeInTheDocument();
    });
  });
});

describe("NotFoundView", () => {
  it("見出しとホームリンクを表示する", () => {
    render(<NotFoundView />);
    expect(screen.getByText("ページが見つかりません")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "ホームへ戻る" });
    expect(link).toHaveAttribute("href", "/");
  });
});

describe("LoadingView", () => {
  it("role=status のローダーと既定ラベルを表示する", () => {
    render(<LoadingView />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("任意のラベルを表示する（境界値）", () => {
    render(<LoadingView label="クエストを準備中…" />);
    expect(screen.getByText("クエストを準備中…")).toBeInTheDocument();
  });
});
