import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import path from "node:path";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL ?? path.join(process.cwd(), "data", "app.db");
const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

function hash(pw: string) {
  return bcrypt.hashSync(pw, 10);
}

/** シード内で必須の参照を取り出す（存在しなければ即エラー） */
function req<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`seed: "${label}" が見つかりません`);
  }
  return value;
}

function main() {
  console.log("🌱 seeding...");

  // 既存データをクリア（冪等な再シード）
  sqlite.exec(`
    DELETE FROM rate_tier_skills;
    DELETE FROM rate_tiers;
    DELETE FROM quest_attempts;
    DELETE FROM quest_skills;
    DELETE FROM quests;
    DELETE FROM user_skills;
    DELETE FROM skill_dependencies;
    DELETE FROM skills;
    DELETE FROM sessions;
    DELETE FROM users;
    DELETE FROM teams;
    DELETE FROM sqlite_sequence;
  `);

  // --- チーム ---
  const insertedTeams = db
    .insert(schema.teams)
    .values([{ name: "Alpha チーム" }, { name: "Beta チーム" }])
    .returning()
    .all();
  const teamA = req(insertedTeams[0], "teamA");
  const teamB = req(insertedTeams[1], "teamB");

  // --- スキル ---
  const skillDefs: Record<string, { category: string; description: string }> = {
    "HTML/CSS": { category: "フロントエンド", description: "Webページの構造とスタイリングの基礎" },
    JavaScript: { category: "フロントエンド", description: "ブラウザで動く言語の基礎" },
    TypeScript: { category: "フロントエンド", description: "型安全なJavaScript" },
    React: { category: "フロントエンド", description: "コンポーネント指向UIライブラリ" },
    "Next.js": { category: "フロントエンド", description: "Reactのフルスタックフレームワーク" },
    "Git": { category: "共通", description: "バージョン管理の基礎" },
    SQL: { category: "バックエンド", description: "リレーショナルDBの操作" },
    "Node.js": { category: "バックエンド", description: "サーバーサイドJavaScript実行環境" },
    "REST API設計": { category: "バックエンド", description: "Web APIの設計" },
    Docker: { category: "インフラ", description: "コンテナによる実行環境の標準化" },
    "CI/CD": { category: "インフラ", description: "継続的インテグレーション/デリバリ" },
    "クラウド基礎": { category: "インフラ", description: "クラウドインフラの基礎概念" },
    "テスト設計": { category: "共通", description: "自動テストの設計と実装" },
    "アーキテクチャ設計": { category: "バックエンド", description: "スケーラブルな設計" },
  };

  const skillIds: Record<string, number> = {};
  for (const [name, def] of Object.entries(skillDefs)) {
    const row = db
      .insert(schema.skills)
      .values({ name, category: def.category, description: def.description })
      .returning()
      .get();
    skillIds[name] = row.id;
  }

  // --- スキル前提関係（前提 -> 開放）---
  const deps: [string, string][] = [
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
  for (const [pre, unlocked] of deps) {
    db.insert(schema.skillDependencies)
      .values({
        prerequisiteSkillId: req(skillIds[pre], pre),
        unlockedSkillId: req(skillIds[unlocked], unlocked),
      })
      .run();
  }

  // --- 単価帯（RateTier）---
  const tierDefs: {
    name: string;
    rate: number;
    order: number;
    desc: string;
    skills: string[];
  }[] = [
    { name: "ジュニア", rate: 40, order: 1, desc: "基礎を習得し、指示のもと開発できる", skills: ["HTML/CSS", "JavaScript", "Git"] },
    { name: "ミドル", rate: 60, order: 2, desc: "一人称で機能開発を担える", skills: ["TypeScript", "React", "SQL"] },
    { name: "シニア", rate: 80, order: 3, desc: "設計・レビューを主導できる", skills: ["Next.js", "REST API設計", "テスト設計"] },
    { name: "リード", rate: 100, order: 4, desc: "アーキテクチャと運用基盤を牽引できる", skills: ["アーキテクチャ設計", "CI/CD", "クラウド基礎"] },
  ];
  for (const t of tierDefs) {
    const tier = db
      .insert(schema.rateTiers)
      .values({ name: t.name, estimatedRate: t.rate, sortOrder: t.order, description: t.desc })
      .returning()
      .get();
    for (const s of t.skills) {
      db.insert(schema.rateTierSkills)
        .values({ rateTierId: tier.id, skillId: req(skillIds[s], s) })
        .run();
    }
  }

  // --- クエスト ---
  const questDefs: {
    title: string;
    desc: string;
    category: string;
    points: number;
    verification: "self" | "approval" | "test";
    published: boolean;
    skills: string[];
  }[] = [
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

  const questIdByTitle: Record<string, number> = {};
  for (const q of questDefs) {
    const row = db
      .insert(schema.quests)
      .values({
        title: q.title,
        description: q.desc,
        category: q.category,
        rewardPoints: q.points,
        verification: q.verification,
        isPublished: q.published,
      })
      .returning()
      .get();
    questIdByTitle[q.title] = row.id;
    for (const s of q.skills) {
      db.insert(schema.questSkills)
        .values({ questId: row.id, skillId: req(skillIds[s], s) })
        .run();
    }
  }

  // --- ユーザー ---
  const pw = hash("password");
  db
    .insert(schema.users)
    .values({ name: "運営 管理者", email: "admin@example.com", passwordHash: pw, role: "admin", teamId: teamA.id })
    .run();

  const engineerDefs: { name: string; email: string; team: number; skills: string[]; points: number }[] = [
    { name: "佐藤 太郎", email: "taro@example.com", team: teamA.id, skills: ["HTML/CSS", "JavaScript", "Git", "TypeScript"], points: 450 },
    { name: "鈴木 花子", email: "hanako@example.com", team: teamA.id, skills: ["HTML/CSS", "JavaScript", "Git", "TypeScript", "React", "SQL"], points: 850 },
    { name: "高橋 次郎", email: "jiro@example.com", team: teamB.id, skills: ["HTML/CSS", "Git"], points: 200 },
    { name: "田中 美咲", email: "misaki@example.com", team: teamB.id, skills: ["HTML/CSS", "JavaScript", "Git", "TypeScript", "React", "SQL", "Next.js", "REST API設計", "テスト設計", "Node.js"], points: 1600 },
    { name: "渡辺 健", email: "ken@example.com", team: teamA.id, skills: [], points: 0 },
  ];

  for (const e of engineerDefs) {
    const u = db
      .insert(schema.users)
      .values({ name: e.name, email: e.email, passwordHash: pw, role: "engineer", teamId: e.team, totalPoints: e.points })
      .returning()
      .get();
    for (const s of e.skills) {
      db.insert(schema.userSkills).values({ userId: u.id, skillId: req(skillIds[s], s) }).run();
    }
    // 想定単価を計算
    const acquired = new Set(e.skills.map((s) => req(skillIds[s], s)));
    let best = 0;
    for (const t of tierDefs) {
      if (t.skills.length > 0 && t.skills.every((s) => acquired.has(req(skillIds[s], s))) && t.rate > best) {
        best = t.rate;
      }
    }
    sqlite.prepare("UPDATE users SET current_estimated_rate = ? WHERE id = ?").run(best, u.id);
  }

  // --- サンプルの承認待ち申請 ---
  const jiroRow = sqlite.prepare("SELECT id FROM users WHERE email = ?").get("jiro@example.com") as { id: number };
  db.insert(schema.questAttempts)
    .values({
      userId: jiroRow.id,
      questId: req(questIdByTitle["JavaScript で電卓を作る"], "JavaScript で電卓を作る"),
      status: "submitted",
      submission: "https://github.com/example/calculator （電卓アプリを作りました）",
      submittedAt: new Date(),
    })
    .run();

  console.log("✅ seed complete");
  console.log("   管理者:  admin@example.com / password");
  console.log("   エンジニア: taro@example.com 他 / password");
}

try {
  main();
  sqlite.close();
} catch (e: unknown) {
  console.error(e);
  sqlite.close();
  process.exit(1);
}
