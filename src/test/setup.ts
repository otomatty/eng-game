import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 各テスト後に DOM をクリーンアップ（テスト間の状態リークを防ぐ）
afterEach(() => {
  cleanup();
});
