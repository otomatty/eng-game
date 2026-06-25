import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * PRD 8章 データモデルに対応する Drizzle スキーマ。
 * Cloudflare D1（SQLite 互換）を対象とする。
 */

// 共通: 作成日時
const createdAt = integer("created_at", { mode: "timestamp" })
  .notNull()
  .default(sql`(unixepoch())`);

// チーム（チームランキング用）
export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt,
});

// ユーザー（ロール・所属チーム・累積ポイント・想定単価）
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["engineer", "admin"] })
    .notNull()
    .default("engineer"),
  teamId: integer("team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  totalPoints: integer("total_points").notNull().default(0),
  // 想定単価（万円/月）。スキル習得に応じて更新される導出値のキャッシュ。
  currentEstimatedRate: integer("current_estimated_rate").notNull().default(0),
  createdAt,
});

// セッション（メール+パスワード内部認証）
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // ランダムトークン
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt,
});

// ログイン試行のレート制限（IP+メール単位の失敗カウンタ・窓・ロック / Issue #5）
export const loginAttempts = sqliteTable("login_attempts", {
  // `${ip}|${email}` のキー
  id: text("id").primaryKey(),
  // 現在の窓における連続失敗回数
  failureCount: integer("failure_count").notNull().default(0),
  // 現在の窓の起点（最初の失敗時刻）
  firstFailureAt: integer("first_failure_at", { mode: "timestamp" }).notNull(),
  // ロック解除時刻（ロック中でなければ null）
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// スキル（名前・カテゴリ）
export const skills = sqliteTable("skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull().default("一般"),
  description: text("description").notNull().default(""),
  createdAt,
});

// スキルの前提関係（スキルツリーの枝、Skill 自己参照 N–N）
export const skillDependencies = sqliteTable(
  "skill_dependencies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // 前提スキル（これを習得すると…）
    prerequisiteSkillId: integer("prerequisite_skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    // 開放されるスキル（…これが開放される）
    unlockedSkillId: integer("unlocked_skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("skill_dep_unique").on(
      t.prerequisiteSkillId,
      t.unlockedSkillId,
    ),
  ],
);

// ユーザーの習得スキル（習得日）
export const userSkills = sqliteTable(
  "user_skills",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    acquiredAt: integer("acquired_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] })],
);

// クエスト（付与ポイント・検証方式・公開状態）
export const quests = sqliteTable("quests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("一般"),
  rewardPoints: integer("reward_points").notNull().default(0),
  // 検証方式: 自己申告 / 成果物提出＋承認 / テスト合格
  verification: text("verification", {
    enum: ["self", "approval", "test"],
  })
    .notNull()
    .default("self"),
  isPublished: integer("is_published", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt,
});

// クエストとクリアで習得するスキルの対応（N–N）
export const questSkills = sqliteTable(
  "quest_skills",
  {
    questId: integer("quest_id")
      .notNull()
      .references(() => quests.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.questId, t.skillId] })],
);

// 挑戦・クリア記録（状態・提出物・承認情報）
export const questAttempts = sqliteTable("quest_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  questId: integer("quest_id")
    .notNull()
    .references(() => quests.id, { onDelete: "cascade" }),
  // in_progress: 挑戦中 / submitted: 承認待ち / approved: 承認済(=完了)
  // completed: 完了 / rejected: 差し戻し
  status: text("status", {
    enum: ["in_progress", "submitted", "approved", "completed", "rejected"],
  })
    .notNull()
    .default("in_progress"),
  submission: text("submission").notNull().default(""),
  reviewNote: text("review_note").notNull().default(""),
  approverId: integer("approver_id").references(() => users.id, {
    onDelete: "set null",
  }),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  createdAt,
});

// 単価帯（想定単価額）
export const rateTiers = sqliteTable("rate_tiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // 想定単価（万円/月）
  estimatedRate: integer("estimated_rate").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt,
});

// 単価帯への到達に必要なスキル（N–N）
export const rateTierSkills = sqliteTable(
  "rate_tier_skills",
  {
    rateTierId: integer("rate_tier_id")
      .notNull()
      .references(() => rateTiers.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.rateTierId, t.skillId] })],
);

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type QuestAttempt = typeof questAttempts.$inferSelect;
export type RateTier = typeof rateTiers.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
