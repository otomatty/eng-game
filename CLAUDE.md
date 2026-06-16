# CLAUDE.md — AI 実装ガイド

このファイルは、このリポジトリで作業する AI エージェント（Claude Code 等）および開発者が
**必ず最初に読む**実装ルールです。詳細は [`docs/development-guidelines.md`](docs/development-guidelines.md) を参照してください。

---

## 0. 大原則

このリポジトリでの実装は、例外なく次の 3 ステップを**この順序で**踏みます。

```
① 仕様検討（Spec） → ② テスト実装（Test） → ③ 本実装（Implementation）
```

各ステップを飛ばしたり順序を入れ替えたりしないでください。
「とりあえず本実装してからテストを書く」ことは禁止です（テストが実装に引きずられ、観点が漏れるため）。

---

## 1. 実装フロー（仕様検討 → テスト実装 → 本実装）

### ① 仕様検討（Spec）

本実装に着手する前に、必ず**仕様を言語化**します。

- **何を作るか／作らないか**（スコープと非スコープ）を明確にする。
- **入力・出力・副作用**（DB 更新・Cookie・リダイレクト等）を列挙する。
- **観点表**を作る。最低限、次の 3 種を洗い出す。
  - **正常系（happy path）**: 期待どおりの入力で期待どおりの結果。
  - **異常系（error path）**: 不正入力・権限不足・存在しないリソース・DB 競合など。
  - **境界値（boundary）**: 0 / 空配列 / 最小・最大 / 重複 / null・undefined / 上限・下限。
- 既存の [PRD](README.md) やドメインロジック（[`src/lib/domain.ts`](src/lib/domain.ts)）との整合を確認する。
- 仕様が曖昧な場合は、**勝手に決めず**にユーザーへ確認する。

> 仕様検討の成果は、PR 説明・コミットメッセージ・テストの `describe`/`it` 名として残します。
> 独立したテストファイルの冒頭コメントに観点表を書いてもよいです。

### ② テスト実装（Test）

仕様で洗い出した観点を、**本実装より先に**テストへ落とし込みます（テストファースト）。

- `describe` / `it`（または `test`）名は**日本語で仕様を説明**する（例: `想定単価は到達済み単価帯の最大値を返す`）。
- ①で洗い出した **正常系・異常系・境界値**を、原則すべてテストケースにする。
- この時点でテストは**失敗する（Red）**のが正しい状態です。
- ロジックは可能な限り**純粋関数**として切り出し、DB やネットワークに依存させない（テスト容易性）。
  - 純粋ロジックは [`src/lib/domain-logic.ts`](src/lib/domain-logic.ts) のように副作用のない関数へ分離する。
  - DB を伴う統合テストが必要なら、インメモリ SQLite（`:memory:`）等を用いる。

### ③ 本実装（Implementation）

テストを**通す（Green）**ための最小限の実装を行い、その後リファクタ（Refactor）します。

- テストが全て通ること、`npm run typecheck` / `npm run lint` が通ることを確認する。
- 仕様外の機能を勝手に足さない（YAGNI）。
- 既存のコードスタイル・命名・コメントの粒度に合わせる。

---

## 2. 着手前後で必ず実行するコマンド

作業の区切りごと、そして**コミット前に必ず**ローカルで以下を実行し、すべて緑であることを確認します。
これは CI（GitHub Actions）と同一のチェックです。

```bash
npm run lint        # LintCheck   : ESLint（厳格ルール）
npm run typecheck   # Typecheck   : tsc --noEmit（厳格な型）
npm run test        # Test        : Vitest（正常系・異常系・境界値）
npm run build       # Buildcheck  : next build
```

まとめて実行する場合:

```bash
npm run verify      # 上記 4 つを順に実行
```

**CI が落ちる変更をプッシュしないでください。** ローカルで `npm run verify` が通ってからコミット・プッシュします。

---

## 3. コーディング規約（要点）

詳細は [`docs/development-guidelines.md`](docs/development-guidelines.md)。違反は Lint / Typecheck で機械的に弾かれます。

- **React**: 関数コンポーネント + フック。`'use client'` は本当に必要な箇所だけ。Server Components を既定とする。
  Hooks のルール（`react-hooks/rules-of-hooks`, `exhaustive-deps`）を厳守。`key` を適切に付ける。
- **型**: `any` 禁止。`as` での無理なキャスト禁止。`noUncheckedIndexedAccess` 前提で配列・オブジェクトアクセスは
  `undefined` の可能性を必ず処理する。公開関数は引数・戻り値の型を明示する。
- **非同期**: Promise の握り潰し禁止（`no-floating-promises`）。`await` 忘れに注意。
- **入力検証**: 外部入力（フォーム・API）は **Zod** でスキーマ検証してから使う。
- **アクセシビリティ**: `jsx-a11y` ルールを満たす（alt、ラベル、role 等）。

---

## 4. ブランチ / コミット

- 開発ブランチで作業し、CI が緑になってからプッシュする。
- コミットメッセージは Conventional Commits（`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`, `ci:`）。
- 1 コミットは 1 つの意味のある単位（仕様・テスト・実装を分けてコミットするのが望ましい）。
