import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorState, LoadingState, NotFoundState } from "./boundaries";

/**
 * 観点表（error.tsx / not-found.tsx / loading.tsx の境界 UI 部品）:
 *
 * ErrorState
 * - 正常系: タイトル・説明文を表示する。
 * - リセット導線: onReset が渡された場合のみ再試行ボタンを表示し、クリックで onReset を呼ぶ。
 * - 境界値: onReset 未指定なら再試行ボタンを表示しない。
 * - 異常系/セキュリティ: 内部情報（スタックトレース等）を渡す API を持たず、digest が渡された時のみ参照用 ID を表示する。
 *
 * NotFoundState
 * - 正常系: 404 と説明文、ホームへの導線（リンク）を表示する。
 * - 境界値: homeHref を指定するとリンク先が変わる。
 *
 * LoadingState
 * - 正常系: role="status" のローディング領域とラベルを表示する。
 * - 境界値: label を指定するとラベル文言が変わる。
 */

describe("ErrorState", () => {
  describe("正常系", () => {
    it("タイトルと説明文を表示する", () => {
      render(<ErrorState title="問題が発生しました" description="説明文です" />);
      expect(screen.getByText("問題が発生しました")).toBeInTheDocument();
      expect(screen.getByText("説明文です")).toBeInTheDocument();
    });
  });

  describe("リセット導線", () => {
    it("onReset が渡されると再試行ボタンを表示し、クリックで onReset を呼ぶ", async () => {
      const user = userEvent.setup();
      const onReset = vi.fn();
      render(<ErrorState onReset={onReset} resetLabel="再試行" />);
      const button = screen.getByRole("button", { name: "再試行" });
      await user.click(button);
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe("境界値", () => {
    it("onReset が未指定なら再試行ボタンを表示しない", () => {
      render(<ErrorState />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("異常系/セキュリティ", () => {
    it("digest が渡された時のみ参照用 ID を表示する", () => {
      const { rerender } = render(<ErrorState />);
      expect(screen.queryByText(/エラー ID/)).not.toBeInTheDocument();
      rerender(<ErrorState digest="abc123" />);
      expect(screen.getByText(/abc123/)).toBeInTheDocument();
    });
  });
});

describe("NotFoundState", () => {
  describe("正常系", () => {
    it("404 とホームへの導線を表示する", () => {
      render(<NotFoundState />);
      expect(screen.getByText("404")).toBeInTheDocument();
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/");
    });
  });

  describe("境界値", () => {
    it("homeHref を指定するとリンク先が変わる", () => {
      render(<NotFoundState homeHref="/home" />);
      expect(screen.getByRole("link")).toHaveAttribute("href", "/home");
    });
  });
});

describe("LoadingState", () => {
  describe("正常系", () => {
    it("role=status のローディング領域とラベルを表示する", () => {
      render(<LoadingState />);
      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-busy", "true");
      expect(screen.getByText("読み込み中…")).toBeInTheDocument();
    });
  });

  describe("境界値", () => {
    it("label を指定するとラベル文言が変わる", () => {
      render(<LoadingState label="クエストを読み込み中…" />);
      expect(screen.getByText("クエストを読み込み中…")).toBeInTheDocument();
    });
  });
});
