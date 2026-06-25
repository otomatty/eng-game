/**
 * D1 投入用シードデータと、それを冪等な SQL へ変換する純粋ロジック。
 *
 * Cloudflare D1 はリクエストスコープのバインディング経由でしかアクセスできないため、
 * 旧来の better-sqlite3 ランタイムシードは使えない。代わりにここで静的 SQL を生成し、
 * `wrangler d1 execute --file` でローカル/リモートの D1 に投入する。
 *
 * 副作用はもたない（bcrypt ハッシュは呼び出し側で計算して渡す）。
 * ID は決定的に採番し、ジャンクションテーブルの参照を安定させる。
 */

export type SqlPrimitive = string | number | boolean | null;

/** 値を SQLite のリテラルへ変換する（文字列はクォート＋'' エスケープ） */
export function sqlValue(value: SqlPrimitive): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

function insertRow(
  table: string,
  columns: string[],
  values: SqlPrimitive[],
): string {
  const cols = columns.map((c) => `\`${c}\``).join(", ");
  const vals = values.map(sqlValue).join(", ");
  return `INSERT INTO \`${table}\` (${cols}) VALUES (${vals});`;
}

// ---- データ定義 -----------------------------------------------------------

export interface SkillDef {
  category: string;
  description: string;
}

/** スキル定義（挿入順に id を 1 から採番） */
export const SKILL_DEFS: Record<string, SkillDef> = {
  "HTML/CSS": { category: "フロントエンド", description: "Webページの構造とスタイリングの基礎" },
  JavaScript: { category: "フロントエンド", description: "ブラウザで動く言語の基礎" },
  TypeScript: { category: "フロントエンド", description: "型安全なJavaScript" },
  React: { category: "フロントエンド", description: "コンポーネント指向UIライブラリ" },
  "Next.js": { category: "フロントエンド", description: "Reactのフルスタックフレームワーク" },
  Git: { category: "共通", description: "バージョン管理の基礎" },
  SQL: { category: "バックエンド", description: "リレーショナルDBの操作" },
  "Node.js": { category: "バックエンド", description: "サーバーサイドJavaScript実行環境" },
  "REST API設計": { category: "バックエンド", description: "Web APIの設計" },
  Docker: { category: "インフラ", description: "コンテナによる実行環境の標準化" },
  "CI/CD": { category: "インフラ", description: "継続的インテグレーション/デリバリ" },
  "クラウド基礎": { category: "インフラ", description: "クラウドインフラの基礎概念" },
  "テスト設計": { category: "共通", description: "自動テストの設計と実装" },
  "アーキテクチャ設計": { category: "バックエンド", description: "スケーラブルな設計" },
};

export const TEAMS: { id: number; name: string }[] = [
  { id: 1, name: "Alpha チーム" },
  { id: 2, name: "Beta チーム" },
];

/** スキル前提関係 [前提, 開放] */
export const SKILL_DEPENDENCIES: [string, string][] = [
  ["HTML/CSS", "JavaScript"],
  ["JavaScript", "TypeScript"],
  ["JavaScript", "React"],
  ["TypeScript", "React"],
  ["React", "Next.js"],
  ["JavaScript", "Node.js"],
  ["Node.js", "REST API設計"],
  ["SQL", "REST API設計"],
  ["Git", "CI/CD"],
  ["Docker", "CI/CD"],
  ["クラウド基礎", "Docker"],
  ["REST API設計", "アーキテクチャ設計"],
  ["テスト設計", "アーキテクチャ設計"],
];

export interface TierDef {
  name: string;
  rate: number;
  order: number;
  desc: string;
  skills: string[];
}

export const TIER_DEFS: TierDef[] = [
  { name: "ジュニア", rate: 40, order: 1, desc: "基礎を習得し、指示のもと開発できる", skills: ["HTML/CSS", "JavaScript", "Git"] },
  { name: "ミドル", rate: 60, order: 2, desc: "一人称で機能開発を担える", skills: ["TypeScript", "React", "SQL"] },
  { name: "シニア", rate: 80, order: 3, desc: "設計・レビューを主導できる", skills: ["Next.js", "REST API設計", "テスト設計"] },
  { name: "リード", rate: 100, order: 4, desc: "アーキテクチャと運用基盤を牽引できる", skills: ["アーキテクチャ設計", "CI/CD", "クラウド基礎"] },
];

export interface QuestDef {
  title: string;
  desc: string;
  category: string;
  points: number;
  verification: "self" | "approval" | "test";
  published: boolean;
  skills: string[];
  /** テスト型の合格基準（正答率 %）。未指定は 100（全問正解）。 */
  passThreshold?: number;
}

export const QUEST_DEFS: QuestDef[] = [
  { title: "はじめてのWebページ", desc: "HTMLとCSSで自己紹介ページを作ろう。", category: "フロントエンド", points: 100, verification: "self", published: true, skills: ["HTML/CSS"] },
  { title: "Gitでバージョン管理", desc: "リポジトリを作成し、コミット・ブランチ・マージを体験する。", category: "共通", points: 100, verification: "self", published: true, skills: ["Git"] },
  { title: "JavaScript で電卓を作る", desc: "DOM操作で動く電卓アプリを実装し、成果物URLを提出する。", category: "フロントエンド", points: 150, verification: "approval", published: true, skills: ["JavaScript"] },
  { title: "TypeScript 型クイズ", desc: "型に関するテストに合格しよう。", category: "フロントエンド", points: 150, verification: "test", published: true, skills: ["TypeScript"] },
  { title: "React で ToDo アプリ", desc: "状態管理を使ったToDoアプリを作り、成果物を提出する。", category: "フロントエンド", points: 200, verification: "approval", published: true, skills: ["React"] },
  { title: "SQL で集計クエリ", desc: "JOINとGROUP BYを使った集計クエリを書く。", category: "バックエンド", points: 150, verification: "test", published: true, skills: ["SQL"] },
  { title: "Node.js でAPIサーバー", desc: "ExpressでシンプルなAPIサーバーを立てる。", category: "バックエンド", points: 200, verification: "approval", published: true, skills: ["Node.js"] },
  { title: "REST API を設計する", desc: "リソース設計とエンドポイント定義を行い、ドキュメントを提出する。", category: "バックエンド", points: 250, verification: "approval", published: true, skills: ["REST API設計"] },
  { title: "Next.js でSSR", desc: "Next.jsでサーバーサイドレンダリングのページを作る。", category: "フロントエンド", points: 250, verification: "approval", published: true, skills: ["Next.js"] },
  { title: "Docker でコンテナ化", desc: "アプリをDocker化し、composeで起動する。", category: "インフラ", points: 200, verification: "approval", published: true, skills: ["Docker"] },
  { title: "CI/CD パイプライン構築", desc: "GitHub Actionsで自動テスト&デプロイを構築する。", category: "インフラ", points: 300, verification: "approval", published: true, skills: ["CI/CD"] },
  { title: "クラウド基礎を学ぶ", desc: "クラウドの基本概念に関するテストに合格する。", category: "インフラ", points: 150, verification: "test", published: true, skills: ["クラウド基礎"] },
  { title: "テストを書こう", desc: "ユニットテストを実装し、カバレッジを提出する。", category: "共通", points: 200, verification: "approval", published: true, skills: ["テスト設計"] },
  { title: "アーキテクチャ設計演習", desc: "スケーラブルなシステム設計を提案する。", category: "バックエンド", points: 350, verification: "approval", published: true, skills: ["アーキテクチャ設計"] },
  { title: "【下書き】GraphQL入門", desc: "公開前のクエスト。", category: "バックエンド", points: 200, verification: "approval", published: false, skills: [] },
];

export interface ChoiceDef {
  label: string;
  correct: boolean;
}

export interface QuestionDef {
  /** 紐づくクエストのタイトル（QUEST_DEFS の title と一致させる） */
  questTitle: string;
  prompt: string;
  kind: "single" | "text";
  /** kind=text の正解文字列 */
  correctText?: string;
  /** kind=single の選択肢 */
  choices?: ChoiceDef[];
}

/**
 * テスト型クエストの設問・正解（Issue #7）。
 * 採点はサーバー側の純粋関数で行い、正解は UI に露出させない。
 */
export const QUESTION_DEFS: QuestionDef[] = [
  {
    questTitle: "TypeScript 型クイズ",
    prompt: "「文字列 または 数値」を表す TypeScript の型はどれ？",
    kind: "single",
    choices: [
      { label: "string | number", correct: true },
      { label: "string & number", correct: false },
      { label: "string, number", correct: false },
      { label: "Array<string>", correct: false },
    ],
  },
  {
    questTitle: "TypeScript 型クイズ",
    prompt: "プロパティを再代入不可（読み取り専用）にするキーワードは？（英単語で入力）",
    kind: "text",
    correctText: "readonly",
  },
  {
    questTitle: "SQL で集計クエリ",
    prompt: "集計のために行をグループ化する SQL 句はどれ？",
    kind: "single",
    choices: [
      { label: "GROUP BY", correct: true },
      { label: "ORDER BY", correct: false },
      { label: "WHERE", correct: false },
      { label: "LIMIT", correct: false },
    ],
  },
  {
    questTitle: "SQL で集計クエリ",
    prompt: "行数を数える集計関数は？（関数名のみ・英大文字小文字は不問）",
    kind: "text",
    correctText: "COUNT",
  },
  {
    questTitle: "クラウド基礎を学ぶ",
    prompt: "需要に応じて計算資源を増減できる、クラウドの特性はどれ？",
    kind: "single",
    choices: [
      { label: "スケーラビリティ", correct: true },
      { label: "オンプレミス", correct: false },
      { label: "モノリス", correct: false },
      { label: "レガシー", correct: false },
    ],
  },
  {
    questTitle: "クラウド基礎を学ぶ",
    prompt: "使った分だけ料金が発生する課金モデルはどれ？",
    kind: "single",
    choices: [
      { label: "従量課金", correct: true },
      { label: "定額買い切り", correct: false },
      { label: "リース契約", correct: false },
      { label: "無償提供", correct: false },
    ],
  },
];

export interface EngineerDef {
  name: string;
  email: string;
  teamId: number;
  skills: string[];
  points: number;
}

export const ADMIN = {
  name: "運営 管理者",
  email: "admin@example.com",
  teamId: 1,
};

export const ENGINEER_DEFS: EngineerDef[] = [
  { name: "佐藤 太郎", email: "taro@example.com", teamId: 1, skills: ["HTML/CSS", "JavaScript", "Git", "TypeScript"], points: 450 },
  { name: "鈴木 花子", email: "hanako@example.com", teamId: 1, skills: ["HTML/CSS", "JavaScript", "Git", "TypeScript", "React", "SQL"], points: 850 },
  { name: "高橋 次郎", email: "jiro@example.com", teamId: 2, skills: ["HTML/CSS", "Git"], points: 200 },
  { name: "田中 美咲", email: "misaki@example.com", teamId: 2, skills: ["HTML/CSS", "JavaScript", "Git", "TypeScript", "React", "SQL", "Next.js", "REST API設計", "テスト設計", "Node.js"], points: 1600 },
  { name: "渡辺 健", email: "ken@example.com", teamId: 1, skills: [], points: 0 },
];

// ---- 算出ロジック ---------------------------------------------------------

/** 到達済み単価帯（必要スキルを全習得）のうち最大 rate。0 始まり。 */
export function computeEstimatedRate(
  acquired: Set<string>,
  tiers: Pick<TierDef, "rate" | "skills">[],
): number {
  let best = 0;
  for (const t of tiers) {
    if (t.skills.length > 0 && t.skills.every((s) => acquired.has(s)) && t.rate > best) {
      best = t.rate;
    }
  }
  return best;
}

// ---- SQL 生成 -------------------------------------------------------------

/** スキル名 → 決定的 id（挿入順 1..N） */
function buildSkillIdMap(): Map<string, number> {
  const map = new Map<string, number>();
  let id = 1;
  for (const name of Object.keys(SKILL_DEFS)) {
    map.set(name, id++);
  }
  return map;
}

function skillId(map: Map<string, number>, name: string): number {
  const id = map.get(name);
  if (id === undefined) throw new Error(`seed: 未知のスキル "${name}"`);
  return id;
}

/** シードデータ全体を冪等な SQL スクリプトへ変換する */
export function buildSeedSql(passwordHash: string): string {
  const skillIds = buildSkillIdMap();
  const lines: string[] = [];

  // 冪等な再シード: 子テーブルから順に全削除
  for (const table of [
    "rate_tier_skills",
    "rate_tiers",
    "quest_question_choices",
    "quest_questions",
    "quest_attempts",
    "quest_skills",
    "quests",
    "user_skills",
    "skill_dependencies",
    "skills",
    "sessions",
    "users",
    "teams",
  ]) {
    lines.push(`DELETE FROM \`${table}\`;`);
  }

  // チーム
  for (const t of TEAMS) {
    lines.push(insertRow("teams", ["id", "name"], [t.id, t.name]));
  }

  // スキル
  for (const [name, def] of Object.entries(SKILL_DEFS)) {
    lines.push(
      insertRow(
        "skills",
        ["id", "name", "category", "description"],
        [skillId(skillIds, name), name, def.category, def.description],
      ),
    );
  }

  // スキル前提関係
  SKILL_DEPENDENCIES.forEach(([pre, unlocked], i) => {
    lines.push(
      insertRow(
        "skill_dependencies",
        ["id", "prerequisite_skill_id", "unlocked_skill_id"],
        [i + 1, skillId(skillIds, pre), skillId(skillIds, unlocked)],
      ),
    );
  });

  // 単価帯 + 到達条件スキル
  TIER_DEFS.forEach((t, i) => {
    const tierId = i + 1;
    lines.push(
      insertRow(
        "rate_tiers",
        ["id", "name", "description", "estimated_rate", "sort_order"],
        [tierId, t.name, t.desc, t.rate, t.order],
      ),
    );
    for (const s of t.skills) {
      lines.push(
        insertRow(
          "rate_tier_skills",
          ["rate_tier_id", "skill_id"],
          [tierId, skillId(skillIds, s)],
        ),
      );
    }
  });

  // クエスト + 付与スキル
  const questIdByTitle = new Map<string, number>();
  QUEST_DEFS.forEach((q, i) => {
    const questId = i + 1;
    questIdByTitle.set(q.title, questId);
    lines.push(
      insertRow(
        "quests",
        ["id", "title", "description", "category", "reward_points", "verification", "pass_threshold", "is_published"],
        [questId, q.title, q.desc, q.category, q.points, q.verification, q.passThreshold ?? 100, q.published],
      ),
    );
    for (const s of q.skills) {
      lines.push(
        insertRow(
          "quest_skills",
          ["quest_id", "skill_id"],
          [questId, skillId(skillIds, s)],
        ),
      );
    }
  });

  // テスト型クエストの設問・選択肢（正解はDBのみに保持）
  let choiceId = 1;
  QUESTION_DEFS.forEach((question, i) => {
    const questionId = i + 1;
    const questId = questIdByTitle.get(question.questTitle);
    if (questId === undefined) {
      throw new Error(`seed: 未知のクエスト "${question.questTitle}"`);
    }
    lines.push(
      insertRow(
        "quest_questions",
        ["id", "quest_id", "prompt", "kind", "correct_text", "sort_order"],
        [
          questionId,
          questId,
          question.prompt,
          question.kind,
          question.kind === "text" ? question.correctText ?? "" : "",
          i + 1,
        ],
      ),
    );
    if (question.kind === "single") {
      (question.choices ?? []).forEach((c, ci) => {
        lines.push(
          insertRow(
            "quest_question_choices",
            ["id", "question_id", "label", "is_correct", "sort_order"],
            [choiceId++, questionId, c.label, c.correct, ci + 1],
          ),
        );
      });
    }
  });

  // 管理者（id=1）
  lines.push(
    insertRow(
      "users",
      ["id", "name", "email", "password_hash", "role", "team_id", "total_points", "current_estimated_rate"],
      [1, ADMIN.name, ADMIN.email, passwordHash, "admin", ADMIN.teamId, 0, 0],
    ),
  );

  // エンジニア（id=2..）
  ENGINEER_DEFS.forEach((e, i) => {
    const userId = i + 2;
    const rate = computeEstimatedRate(new Set(e.skills), TIER_DEFS);
    lines.push(
      insertRow(
        "users",
        ["id", "name", "email", "password_hash", "role", "team_id", "total_points", "current_estimated_rate"],
        [userId, e.name, e.email, passwordHash, "engineer", e.teamId, e.points, rate],
      ),
    );
    for (const s of e.skills) {
      lines.push(
        insertRow("user_skills", ["user_id", "skill_id"], [userId, skillId(skillIds, s)]),
      );
    }
  });

  // サンプルの承認待ち申請（高橋 次郎 が「JavaScript で電卓を作る」を提出）。
  // ENGINEER_DEFS の定義順が変わっても追従するよう動的に id を求める（管理者が id=1、エンジニアは id=2..）。
  const jiroIndex = ENGINEER_DEFS.findIndex((e) => e.name === "高橋 次郎");
  const jiroId = jiroIndex === -1 ? 4 : jiroIndex + 2;
  const calcQuestId = questIdByTitle.get("JavaScript で電卓を作る");
  if (calcQuestId !== undefined) {
    lines.push(
      `INSERT INTO \`quest_attempts\` (\`user_id\`, \`quest_id\`, \`status\`, \`submission\`, \`submitted_at\`) VALUES (${sqlValue(
        jiroId,
      )}, ${sqlValue(calcQuestId)}, 'submitted', ${sqlValue(
        "https://github.com/example/calculator （電卓アプリを作りました）",
      )}, unixepoch());`,
    );
  }

  return lines.join("\n") + "\n";
}
