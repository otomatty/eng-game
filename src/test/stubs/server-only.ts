/**
 * テスト用 `server-only` スタブ（Issue #8）。
 *
 * `server-only` は Next.js のバンドラが提供する仮想モジュールで、素の Vitest/Vite
 * からは解決できない。副作用 import（`import "server-only"`）を無害化するため、
 * vitest.config.ts のエイリアスで本ファイルへ差し替える。
 */
export {};
