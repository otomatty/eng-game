import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  EmptyState,
  ProgressBar,
  StatusBadge,
  VerificationBadge,
} from "./ui";

/**
 * 観点表:
 * - ProgressBar: 正常系=幅%反映 / 境界値=下限0・上限100 / 異常系=範囲外を丸める
 * - VerificationBadge / StatusBadge: 正常系=既知ラベル / 異常系=未知値はそのまま表示（フォールバック）
 */

describe("ProgressBar", () => {
  // 内側のバー要素（幅%を持つ）を取得する
  const widthOf = (container: HTMLElement): string | undefined =>
    container.querySelector<HTMLElement>(".bg-zen-accent")?.getAttribute("style") ??
    undefined;

  describe("正常系", () => {
    it("値に応じた幅(%)をスタイルに反映する", () => {
      const { container } = render(<ProgressBar value={50} />);
      expect(widthOf(container)).toContain("width: 50%");
    });
  });

  describe("境界値", () => {
    it("0未満は0%に丸める", () => {
      const { container } = render(<ProgressBar value={-25} />);
      expect(widthOf(container)).toContain("width: 0%");
    });
    it("100超は100%に丸める", () => {
      const { container } = render(<ProgressBar value={250} />);
      expect(widthOf(container)).toContain("width: 100%");
    });
  });
});

describe("VerificationBadge", () => {
  describe("正常系", () => {
    it("既知の検証方式は日本語ラベルを表示する", () => {
      render(<VerificationBadge type="approval" />);
      expect(screen.getByText("承認制")).toBeInTheDocument();
    });
  });
  describe("異常系", () => {
    it("未知の検証方式は値をそのまま表示する（フォールバック）", () => {
      render(<VerificationBadge type="unknown_type" />);
      expect(screen.getByText("unknown_type")).toBeInTheDocument();
    });
  });
});

describe("StatusBadge", () => {
  describe("正常系", () => {
    it("既知のステータスは日本語ラベルを表示する", () => {
      render(<StatusBadge status="submitted" />);
      expect(screen.getByText("承認待ち")).toBeInTheDocument();
    });
  });
  describe("異常系", () => {
    it("未知のステータスは値をそのまま表示する（フォールバック）", () => {
      render(<StatusBadge status="???" />);
      expect(screen.getByText("???")).toBeInTheDocument();
    });
  });
});

describe("EmptyState", () => {
  it("子要素を表示する", () => {
    render(<EmptyState>データがありません</EmptyState>);
    expect(screen.getByText("データがありません")).toBeInTheDocument();
  });
});
