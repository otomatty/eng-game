# 開発ガイドライン（実装ルール詳細）

[`CLAUDE.md`](../CLAUDE.md) の詳細版です。このリポジトリにコードを追加・変更する全員（人間 / AI）が対象です。

---

## 1. 実装プロセス: 仕様検討 → テスト実装 → 本実装

すべての実装は次の順序で進めます。

### ① 仕様検討（Spec First）

本実装のコードを書く前に、必ず仕様を文章化します。下記テンプレートを使ってください。

```md
## 仕様: <機能名>

### 目的 / 背景
- なぜこの変更が必要か（PRD のどの要件か）

### スコープ
- やること:
- やらないこと（非スコープ）:

### インターフェース
- 入力:（型・制約）
- 出力:（型）
- 副作用:（DB 更新 / Cookie / リダイレクト / 外部 API など）

### 観点表
| # | 区分 | 入力・前提 | 期待結果 |
|---|------|-----------|----------|
| 1 | 正常系 | ... | ... |
| 2 | 異常系 | ... | ... |
| 3 | 境界値 | ... | ... |
```

#### 観点の洗い出し（最低限のチェックリスト）

- **正常系**: 代表的な入力 / 複数件 / 典型的なユースケース。
- **異常系**: 不正な型・値 / 必須欠落 / 権限不足（非管理者が管理操作）/ 存在しない ID /
  重複登録 / DB 例外 / 認証切れ。
- **境界値**: `0` / 負数 / 空文字 / 空配列 / 1 件 / 上限・下限 / `null` / `undefined` /
  最小桁・最大桁 / 重複要素。

### ② テスト実装（Test）

観点表の各行を、原則 1 つ以上のテストケースにします。

- テストファイルは対象の隣に置く: `foo.ts` → `foo.test.ts`（または `__tests__/foo.test.ts`）。
- `describe` で対象（関数 / コンポーネント）、`it` で**日本語の仕様**を表現する。
- **正常系・異常系・境界値**をそれぞれ `describe` ブロックでグルーピングすると観点が一目で分かる。
- テストファースト: この段階でテストは失敗（Red）する。

```ts
import { describe, it, expect } from "vitest";
import { selectBestRate } from "./domain-logic";

describe("selectBestRate", () => {
  describe("正常系", () => {
    it("必要スキルを全て満たす単価帯のうち最大値を返す", () => {
      // ...
    });
  });
  describe("異常系", () => {
    it("条件スキル未設定の単価帯は到達扱いにしない", () => {
      // ...
    });
  });
  describe("境界値", () => {
    it("到達単価帯が無ければ 0 を返す", () => {
      // ...
    });
  });
});
```

### ③ 本実装（Implementation）

- テストを通す最小実装 → リファクタ（Red → Green → Refactor）。
- 副作用（DB / Cookie / redirect）と純粋ロジックを分離し、ロジック側を厚くテストする。
  - 純粋ロジック: [`src/lib/domain-logic.ts`](../src/lib/domain-logic.ts)（DB 非依存・テスト容易）。
  - 副作用付き: [`src/lib/domain.ts`](../src/lib/domain.ts) などが上記を呼び出す。

---

## 2. ディレクトリと責務

```
src/
  db/             スキーマ・マイグレーション・シード（Drizzle + SQLite）
  lib/
    domain-logic.ts  純粋ドメインロジック（副作用なし／テスト対象の中心）
    domain.ts        DB を伴うドメイン処理（domain-logic を利用）
    auth.ts          認証・セッション（副作用あり）
    guards.ts        認可ガード（redirect）
    queries.ts       読み取りクエリ
  components/     再利用 UI（Server Component 既定）
  app/            App Router。actions/ にサーバーアクション。
```

- **純粋ロジックは `lib/domain-logic.ts` 等へ**切り出してユニットテストする。
- React コンポーネントの表示ロジック（分岐・整形）も可能なら純粋関数化してテストする。

---

## 3. TypeScript（厳格な型）

`tsconfig.json` で以下を有効化しています（CI の Typecheck で強制）。

- `strict`（`noImplicitAny`, `strictNullChecks` ほか）
- `noUncheckedIndexedAccess` — 配列・インデックスアクセスは `T | undefined`。**必ず存在チェック**する。
- `noUnusedLocals` / `noUnusedParameters` — 未使用は禁止（`_` 始まりの引数のみ許容）。
- `noImplicitOverride` / `noFallthroughCasesInSwitch` / `forceConsistentCasingInFileNames`

ルール:

- `any` 禁止。型が不明なら `unknown` で受けて絞り込む。
- 不要・危険な `as` 禁止。型ガード / Zod で実値から型を確定する。
- 公開（export）関数は引数・戻り値の型を明示する。
- 外部入力は **Zod** で parse してから使用する（`z.infer` で型を導出）。

---

## 4. React ベストプラクティス

- **Server Components 既定**。`'use client'` はイベントハンドラ・ブラウザ API・状態を持つ箇所のみ。
- Hooks のルールを厳守（`react-hooks/rules-of-hooks` / `exhaustive-deps`）。
- リストレンダリングは安定した `key`（配列 index を避ける）。
- props は型を明示し、不要な `useEffect` を避ける（派生値は描画時に算出）。
- アクセシビリティ（`jsx-a11y`）: ボタン/リンクの使い分け、`alt`、フォームラベル、`role`。
- 非同期処理（サーバーアクション含む）の Promise を握り潰さない。

---

## 5. Lint（ESLint 厳格ルール）

`eslint.config.mjs`（Flat Config）で次を有効化:

- `@eslint/js` recommended
- `typescript-eslint` **strictTypeChecked** + **stylisticTypeChecked**（型情報を使った検査）
- `eslint-plugin-react` / `eslint-plugin-react-hooks` / `eslint-plugin-jsx-a11y`
- `@next/eslint-plugin-next`（Core Web Vitals）

主要な禁止事項: `no-explicit-any`, `no-floating-promises`, `no-misused-promises`,
`no-unsafe-*`, `no-unused-vars`, `consistent-type-imports` など。

> Lint エラーは `// eslint-disable` で安易に黙らせない。やむを得ない場合は理由をコメントで明記する。

---

## 6. テスト（Vitest + Testing Library）

- ランナー: **Vitest**。React は **@testing-library/react** + **jsdom**。
- 命名: `*.test.ts(x)`。`describe`/`it` は日本語で仕様を表現。
- **正常系・異常系・境界値**を必ず網羅する（観点表 → テストの対応を保つ）。
- カバレッジ目安: 純粋ドメインロジックは branch も含め高水準を維持。
  - `npm run test:coverage` で確認。
- 外部 I/O（DB/Cookie/network）はモック、または `:memory:` の SQLite で統合テスト。

### 6.1 サーバーアクションの統合テスト（コアループ / Issue #8）

`src/app/actions/*.ts` のサーバーアクションは Cloudflare D1・Cookie・ヘッダ・
リダイレクトに依存するため、純粋ロジックの単体テストとは別に **DB を伴う統合テスト**を
`src/test/integration/` に置きます。コアループ（クエストクリア → ポイント付与 →
スキル習得 → 単価再計算）や認証・承認フローの状態遷移を一気通貫で検証します。

**仕組み（テスト用 DB セットアップ）**

- 本番は Cloudflare D1（`drizzle-orm/d1`）ですが、D1 は SQLite 互換で Drizzle の
  スキーマ・クエリビルダは共通です。テストでは `better-sqlite3` の `:memory:` DB へ
  **同じ Drizzle マイグレーション**（`drizzle/migrations/`）を適用して代替します。
- `src/db/index.ts` の `getDb()` は、`setTestDatabase(db)` で注入された DB があれば
  それを優先して返します（本番経路では常に未設定）。
- 各テストは `setupHarness()`（`src/test/integration/harness.ts`）を呼ぶだけで、
  `beforeEach` で空の `:memory:` DB を生成・注入し、`afterEach` で解除・クローズします。
  Cookie/ヘッダ/リダイレクト等の Next.js 依存は `src/test/integration/server-mocks.ts`
  のインメモリ実装へ差し替えます（テストファイル冒頭の `vi.mock(...)` で参照）。
- `server-only` は Next バンドラの仮想モジュールで Vite から解決できないため、
  `vitest.config.ts` で空スタブ（`src/test/stubs/server-only.ts`）へエイリアスしています。

**実行方法**

```bash
npm run test:ci                       # 統合テストを含む全テスト（CI と同一）
npx vitest run src/test/integration   # 統合テストのみ
```

新しい DB 列・テーブルを追加したら `npm run db:generate` でマイグレーションを更新すれば、
テスト DB にも自動で反映されます（マイグレーションをそのまま適用するため）。

---

## 7. CI（GitHub Actions）

`.github/workflows/ci.yml` が push / PR で次を並列実行します。すべて緑が必須。

| ジョブ | コマンド | 内容 |
|--------|----------|------|
| LintCheck | `npm run lint` | ESLint（厳格） |
| Typecheck | `npm run typecheck` | `tsc --noEmit` |
| Test | `npm run test:ci` | Vitest |
| Buildcheck | `npm run build` | `next build` |

ローカルでは `npm run verify` で同等のチェックをまとめて実行できます。
