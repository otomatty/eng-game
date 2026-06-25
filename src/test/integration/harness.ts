import { afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setTestDatabase, type Database } from "@/db";
import {
  quests,
  questQuestionChoices,
  questQuestions,
  questSkills,
  rateTierSkills,
  rateTiers,
  sessions,
  skillDependencies,
  skills,
  teams,
  userSkills,
  users,
  type Quest,
  type Skill,
  type User,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createTestDb, type TestDb } from "./db";
import { resetServerMocks, setSessionCookie } from "./server-mocks";

/**
 * サーバーアクション統合テスト共通の足場（Issue #8）。
 *
 * `beforeEach` で空のインメモリ DB を生成して `getDb()` へ注入し、`afterEach` で
 * 解除・クローズする。テストデータ投入用のファクトリと、セッション発行ヘルパを
 * 提供する。各テストファイルは冒頭で `next/headers` などをモックしたうえで
 * `setupHarness()` を呼ぶ。
 */

export interface CreateUserOptions {
  name?: string;
  email?: string;
  password?: string;
  role?: "engineer" | "admin";
  teamId?: number | null;
}

export interface CreateQuestOptions {
  title?: string;
  rewardPoints?: number;
  verification?: "self" | "approval" | "test";
  passThreshold?: number;
  isPublished?: boolean;
  /** クリアで習得するスキル ID。 */
  skillIds?: number[];
}

export interface CreateRateTierOptions {
  name?: string;
  estimatedRate: number;
  sortOrder?: number;
  /** 到達に必要なスキル ID。 */
  skillIds?: number[];
}

export interface TestChoice {
  label: string;
  isCorrect: boolean;
}

export interface Harness {
  /** 現在のテスト用 DB。 */
  db: () => Database;
  createTeam: (name?: string) => Promise<number>;
  createUser: (opts?: CreateUserOptions) => Promise<User>;
  createSkill: (name?: string, category?: string) => Promise<Skill>;
  addSkillDependency: (
    prerequisiteSkillId: number,
    unlockedSkillId: number,
  ) => Promise<void>;
  createQuest: (opts?: CreateQuestOptions) => Promise<Quest>;
  /** single（選択式）設問を追加し、選択肢 ID 配列を返す。 */
  addSingleQuestion: (
    questId: number,
    prompt: string,
    choices: TestChoice[],
  ) => Promise<{ questionId: number; choiceIds: number[] }>;
  /** text（完全一致）設問を追加し、設問 ID を返す。 */
  addTextQuestion: (
    questId: number,
    prompt: string,
    correctText: string,
  ) => Promise<number>;
  createRateTier: (opts: CreateRateTierOptions) => Promise<number>;
  /** ユーザーのセッションを発行し Cookie へ設定する。トークンを返す。 */
  login: (userId: number, expiresAt?: Date) => Promise<string>;
  /** 最新のユーザー行を取得する（ポイント・単価の検証用）。 */
  getUser: (id: number) => Promise<User | undefined>;
  /** ユーザーが習得済みのスキル ID 配列。 */
  getAcquiredSkillIds: (userId: number) => Promise<number[]>;
}

let seq = 0;
function uniqueEmail(): string {
  seq += 1;
  return `user${String(seq)}@example.com`;
}

export function setupHarness(): Harness {
  let current: TestDb | null = null;

  beforeEach(() => {
    resetServerMocks();
    current = createTestDb();
    setTestDatabase(current.db);
  });

  afterEach(() => {
    setTestDatabase(undefined);
    current?.close();
    current = null;
  });

  const db = (): Database => {
    if (!current) throw new Error("harness の DB が初期化されていません");
    return current.db;
  };

  async function createUser(opts: CreateUserOptions = {}): Promise<User> {
    const passwordHash = await hashPassword(opts.password ?? "password123");
    const row = (
      await db()
        .insert(users)
        .values({
          name: opts.name ?? "テストユーザー",
          email: opts.email ?? uniqueEmail(),
          passwordHash,
          role: opts.role ?? "engineer",
          teamId: opts.teamId ?? null,
        })
        .returning()
    )[0];
    if (!row) throw new Error("ユーザー作成に失敗");
    return row;
  }

  async function createSkill(name = "スキル", category = "一般"): Promise<Skill> {
    const row = (
      await db().insert(skills).values({ name, category }).returning()
    )[0];
    if (!row) throw new Error("スキル作成に失敗");
    return row;
  }

  async function createQuest(opts: CreateQuestOptions = {}): Promise<Quest> {
    const row = (
      await db()
        .insert(quests)
        .values({
          title: opts.title ?? "テストクエスト",
          rewardPoints: opts.rewardPoints ?? 100,
          verification: opts.verification ?? "self",
          passThreshold: opts.passThreshold ?? 100,
          isPublished: opts.isPublished ?? true,
        })
        .returning()
    )[0];
    if (!row) throw new Error("クエスト作成に失敗");
    const skillIds = opts.skillIds ?? [];
    if (skillIds.length > 0) {
      await db()
        .insert(questSkills)
        .values(skillIds.map((skillId) => ({ questId: row.id, skillId })));
    }
    return row;
  }

  async function addSingleQuestion(
    questId: number,
    prompt: string,
    choices: TestChoice[],
  ): Promise<{ questionId: number; choiceIds: number[] }> {
    const q = (
      await db()
        .insert(questQuestions)
        .values({ questId, prompt, kind: "single" })
        .returning()
    )[0];
    if (!q) throw new Error("設問作成に失敗");
    const inserted = await db()
      .insert(questQuestionChoices)
      .values(
        choices.map((c, i) => ({
          questionId: q.id,
          label: c.label,
          isCorrect: c.isCorrect,
          sortOrder: i + 1,
        })),
      )
      .returning();
    return { questionId: q.id, choiceIds: inserted.map((c) => c.id) };
  }

  async function addTextQuestion(
    questId: number,
    prompt: string,
    correctText: string,
  ): Promise<number> {
    const q = (
      await db()
        .insert(questQuestions)
        .values({ questId, prompt, kind: "text", correctText })
        .returning()
    )[0];
    if (!q) throw new Error("設問作成に失敗");
    return q.id;
  }

  async function createRateTier(opts: CreateRateTierOptions): Promise<number> {
    const row = (
      await db()
        .insert(rateTiers)
        .values({
          name: opts.name ?? `単価帯${String(opts.estimatedRate)}`,
          estimatedRate: opts.estimatedRate,
          sortOrder: opts.sortOrder ?? opts.estimatedRate,
        })
        .returning()
    )[0];
    if (!row) throw new Error("単価帯作成に失敗");
    const skillIds = opts.skillIds ?? [];
    if (skillIds.length > 0) {
      await db()
        .insert(rateTierSkills)
        .values(skillIds.map((skillId) => ({ rateTierId: row.id, skillId })));
    }
    return row.id;
  }

  async function createTeam(name = "チーム"): Promise<number> {
    const row = (await db().insert(teams).values({ name }).returning())[0];
    if (!row) throw new Error("チーム作成に失敗");
    return row.id;
  }

  async function addSkillDependency(
    prerequisiteSkillId: number,
    unlockedSkillId: number,
  ): Promise<void> {
    await db()
      .insert(skillDependencies)
      .values({ prerequisiteSkillId, unlockedSkillId });
  }

  async function login(userId: number, expiresAt?: Date): Promise<string> {
    const token = `session-${String(userId)}-${String((seq += 1))}`;
    await db()
      .insert(sessions)
      .values({
        id: token,
        userId,
        expiresAt: expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24),
      });
    setSessionCookie(token);
    return token;
  }

  async function getUser(id: number): Promise<User | undefined> {
    return (await db().select().from(users).where(eq(users.id, id)).limit(1))[0];
  }

  async function getAcquiredSkillIds(userId: number): Promise<number[]> {
    const rows = await db()
      .select({ skillId: userSkills.skillId })
      .from(userSkills)
      .where(eq(userSkills.userId, userId));
    // アサート用ヘルパー: DB の返却順に依存せず決定的になるよう昇順で返す。
    return rows.map((r) => r.skillId).sort((a, b) => a - b);
  }

  return {
    db,
    createTeam,
    createUser,
    createSkill,
    addSkillDependency,
    createQuest,
    addSingleQuestion,
    addTextQuestion,
    createRateTier,
    login,
    getUser,
    getAcquiredSkillIds,
  };
}
