import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", async () => (await import("./server-mocks")).serverOnlyMock);
vi.mock("@opennextjs/cloudflare", async () => (await import("./server-mocks")).cloudflareMock);
vi.mock("next/cache", async () => (await import("./server-mocks")).nextCacheMock);
vi.mock("next/headers", async () => (await import("./server-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./server-mocks")).nextNavigationMock);

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { questAttempts, questQuestions } from "@/db/schema";
import {
  selfCompleteAction,
  submitForApprovalAction,
  takeTestAction,
} from "@/app/actions/quests";
import { setupHarness } from "./harness";

/**
 * コアループの統合テスト（Issue #8）。
 * クエストクリア → ポイント付与 → スキル習得 → 単価再計算 までを一気通貫で検証する。
 *
 * 観点:
 * - 正常系: 各検証方式（self / approval / test）でクリアするとポイント・スキル・単価が更新される。
 * - 異常系: 種別不一致・存在しない/非公開クエスト・テスト不合格では状態が変わらない。
 * - 境界: 既完了クエストの再クリアでポイントが二重加算されない（冪等性）、再提出。
 */

const h = setupHarness();

function questForm(questId: number, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("questId", String(questId));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

async function attemptsFor(userId: number, questId: number) {
  return h
    .db()
    .select()
    .from(questAttempts)
    .where(
      and(eq(questAttempts.userId, userId), eq(questAttempts.questId, questId)),
    );
}

describe("コアループ: 自己申告型クエスト", () => {
  it("クリアするとポイント付与・スキル習得・単価再計算が行われる", async () => {
    const skill = await h.createSkill("TypeScript");
    await h.createRateTier({ estimatedRate: 60, skillIds: [skill.id] });
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({
      verification: "self",
      rewardPoints: 120,
      skillIds: [skill.id],
    });

    const res = await selfCompleteAction(questForm(quest.id));
    expect(res).toEqual({});

    const after = await h.getUser(user.id);
    expect(after?.totalPoints).toBe(120); // ポイント付与
    expect(await h.getAcquiredSkillIds(user.id)).toEqual([skill.id]); // スキル習得
    expect(after?.currentEstimatedRate).toBe(60); // 単価再計算

    const attempts = await attemptsFor(user.id, quest.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe("completed");
  });

  it("挑戦中(in_progress)の記録があればそれを完了に更新する（新規行を増やさない）", async () => {
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({ verification: "self", rewardPoints: 50 });
    await h
      .db()
      .insert(questAttempts)
      .values({ userId: user.id, questId: quest.id, status: "in_progress" });

    await selfCompleteAction(questForm(quest.id));

    const attempts = await attemptsFor(user.id, quest.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe("completed");
    expect((await h.getUser(user.id))?.totalPoints).toBe(50);
  });

  it("境界: 既にクリア済みのクエストを再クリアしてもポイントは二重加算されない", async () => {
    const skill = await h.createSkill("Go");
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({
      verification: "self",
      rewardPoints: 100,
      skillIds: [skill.id],
    });

    await selfCompleteAction(questForm(quest.id));
    await selfCompleteAction(questForm(quest.id)); // 再クリア（冪等）

    expect((await h.getUser(user.id))?.totalPoints).toBe(100);
    expect(await h.getAcquiredSkillIds(user.id)).toEqual([skill.id]);
    expect(await attemptsFor(user.id, quest.id)).toHaveLength(1);
  });

  it("異常系: 種別不一致（承認型を self でクリア）はエラーを返し状態を変えない", async () => {
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({ verification: "approval", rewardPoints: 100 });

    const res = await selfCompleteAction(questForm(quest.id));
    expect(res.error).toBeTruthy();
    expect((await h.getUser(user.id))?.totalPoints).toBe(0);
    expect(await attemptsFor(user.id, quest.id)).toHaveLength(0);
  });

  it("異常系: 非公開クエストはクリアできない", async () => {
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({ verification: "self", isPublished: false });

    await expect(selfCompleteAction(questForm(quest.id))).rejects.toThrow();
    expect((await h.getUser(user.id))?.totalPoints).toBe(0);
  });

  it("境界: 単価の必要スキルを満たさない場合は単価が上がらない", async () => {
    const skillA = await h.createSkill("A");
    const skillB = await h.createSkill("B");
    // 単価帯は A と B の両方が必要
    await h.createRateTier({ estimatedRate: 80, skillIds: [skillA.id, skillB.id] });
    const user = await h.createUser();
    await h.login(user.id);
    // A だけを習得するクエスト
    const quest = await h.createQuest({ verification: "self", skillIds: [skillA.id] });

    await selfCompleteAction(questForm(quest.id));

    expect((await h.getUser(user.id))?.currentEstimatedRate).toBe(0);
  });
});

describe("コアループ: 成果物提出 → 承認待ち", () => {
  it("提出すると承認待ち(submitted)になり、まだポイント・スキルは付与されない", async () => {
    const skill = await h.createSkill("Docker");
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({
      verification: "approval",
      rewardPoints: 100,
      skillIds: [skill.id],
    });

    const res = await submitForApprovalAction(
      questForm(quest.id, { submission: "成果物URL" }),
    );
    expect(res).toEqual({});

    const attempts = await attemptsFor(user.id, quest.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe("submitted");
    expect(attempts[0]?.submission).toBe("成果物URL");
    // 承認前は未付与
    expect((await h.getUser(user.id))?.totalPoints).toBe(0);
    expect(await h.getAcquiredSkillIds(user.id)).toEqual([]);
  });

  it("境界: 差し戻し後に再提出すると同じ記録が submitted に戻る（行を増やさない）", async () => {
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({ verification: "approval" });
    // 差し戻し状態の記録を用意
    await h
      .db()
      .insert(questAttempts)
      .values({
        userId: user.id,
        questId: quest.id,
        status: "rejected",
        reviewNote: "やり直し",
      });

    await submitForApprovalAction(questForm(quest.id, { submission: "再提出" }));

    const attempts = await attemptsFor(user.id, quest.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe("submitted");
    expect(attempts[0]?.reviewNote).toBe(""); // 再提出でレビューメモはクリア
  });

  it("異常系: 種別不一致（self を承認提出）はエラーを返す", async () => {
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({ verification: "self" });
    const res = await submitForApprovalAction(
      questForm(quest.id, { submission: "x" }),
    );
    expect(res.error).toBeTruthy();
  });
});

describe("コアループ: テスト型クエスト", () => {
  async function setupTestQuest(passThreshold = 100) {
    const skill = await h.createSkill("SQL");
    const quest = await h.createQuest({
      verification: "test",
      rewardPoints: 90,
      passThreshold,
      skillIds: [skill.id],
    });
    const { choiceIds } = await h.addSingleQuestion(quest.id, "1+1は?", [
      { label: "2", isCorrect: true },
      { label: "3", isCorrect: false },
    ]);
    const textQId = await h.addTextQuestion(quest.id, "言語は?", "sql");
    return { skill, quest, correctChoiceId: choiceIds[0]!, wrongChoiceId: choiceIds[1]!, textQId };
  }

  it("全問正解で合格するとクリア確定し、ポイント・スキル・単価が更新される", async () => {
    const { skill, quest, correctChoiceId, textQId } = await setupTestQuest();
    await h.createRateTier({ estimatedRate: 70, skillIds: [skill.id] });
    const user = await h.createUser();
    await h.login(user.id);

    const res = await takeTestAction(
      questForm(quest.id, {
        [`q_${String(await firstQuestionId(quest.id))}`]: String(correctChoiceId),
        [`q_${String(textQId)}`]: "SQL",
      }),
    );
    expect(res.ok).toBe(true);

    const after = await h.getUser(user.id);
    expect(after?.totalPoints).toBe(90);
    expect(after?.currentEstimatedRate).toBe(70);
    expect(await h.getAcquiredSkillIds(user.id)).toEqual([skill.id]);
    const attempts = await attemptsFor(user.id, quest.id);
    expect(attempts[0]?.status).toBe("completed");
  });

  it("異常系: 不合格のときは合否のみ返し、ポイント・スキルは付与されない", async () => {
    const { quest, wrongChoiceId, textQId } = await setupTestQuest();
    const user = await h.createUser();
    await h.login(user.id);

    const res = await takeTestAction(
      questForm(quest.id, {
        [`q_${String(await firstQuestionId(quest.id))}`]: String(wrongChoiceId),
        [`q_${String(textQId)}`]: "wrong",
      }),
    );
    expect(res.ok).toBeUndefined();
    expect(res.error).toBeTruthy();
    expect((await h.getUser(user.id))?.totalPoints).toBe(0);
    expect(await h.getAcquiredSkillIds(user.id)).toEqual([]);
    // 不合格時に完了記録を作らない
    const attempts = await attemptsFor(user.id, quest.id);
    expect(attempts.every((a) => a.status !== "completed")).toBe(true);
  });

  it("異常系: 設問が未設定のテストは合格にしない", async () => {
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({ verification: "test", rewardPoints: 50 });
    const res = await takeTestAction(questForm(quest.id));
    expect(res.error).toBeTruthy();
    expect((await h.getUser(user.id))?.totalPoints).toBe(0);
  });

  it("境界: 既に合格済みなら再採点せず冪等に成功を返す（ポイント二重加算なし）", async () => {
    const { quest, correctChoiceId, textQId } = await setupTestQuest();
    const user = await h.createUser();
    await h.login(user.id);
    const firstQ = await firstQuestionId(quest.id);

    await takeTestAction(
      questForm(quest.id, {
        [`q_${String(firstQ)}`]: String(correctChoiceId),
        [`q_${String(textQId)}`]: "SQL",
      }),
    );
    // 2回目（答えを送らなくても合格済みなので成功）
    const res = await takeTestAction(questForm(quest.id));
    expect(res.ok).toBe(true);
    expect((await h.getUser(user.id))?.totalPoints).toBe(90);
    expect(await attemptsFor(user.id, quest.id)).toHaveLength(1);
  });

  async function firstQuestionId(questId: number): Promise<number> {
    const rows = await h
      .db()
      .select()
      .from(questQuestions)
      .where(eq(questQuestions.questId, questId));
    const single = rows.find((r) => r.kind === "single");
    if (!single) throw new Error("single 設問が見つからない");
    return single.id;
  }
});

describe("コアループ: 同時実行・原子性（claim）", () => {
  it("DB制約: 同一 user×quest の completed 記録は2件目を弾く（部分ユニークインデックス）", async () => {
    const user = await h.createUser();
    const quest = await h.createQuest();
    await h
      .db()
      .insert(questAttempts)
      .values({ userId: user.id, questId: quest.id, status: "completed" });

    await expect(
      h
        .db()
        .insert(questAttempts)
        .values({ userId: user.id, questId: quest.id, status: "completed" }),
    ).rejects.toThrow();
  });

  it("DB制約: completed と approved も併存できない（同一 user×quest）", async () => {
    const user = await h.createUser();
    const quest = await h.createQuest();
    await h
      .db()
      .insert(questAttempts)
      .values({ userId: user.id, questId: quest.id, status: "approved" });

    await expect(
      h
        .db()
        .insert(questAttempts)
        .values({ userId: user.id, questId: quest.id, status: "completed" }),
    ).rejects.toThrow();
  });

  it("境界: 同一クエストへの同時セルフ完了でもポイントは1回だけ付与され、完了記録も1件", async () => {
    const skill = await h.createSkill("Rust");
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({
      verification: "self",
      rewardPoints: 100,
      skillIds: [skill.id],
    });

    await Promise.all([
      selfCompleteAction(questForm(quest.id)),
      selfCompleteAction(questForm(quest.id)),
      selfCompleteAction(questForm(quest.id)),
    ]);

    expect((await h.getUser(user.id))?.totalPoints).toBe(100);
    expect(await h.getAcquiredSkillIds(user.id)).toEqual([skill.id]);
    const completed = (await attemptsFor(user.id, quest.id)).filter(
      (a) => a.status === "completed",
    );
    expect(completed).toHaveLength(1);
  });

  it("境界: 別クエストの同時完了でポイントが両方加算される（原子的インクリメントで更新ロストしない）", async () => {
    const user = await h.createUser();
    await h.login(user.id);
    const q1 = await h.createQuest({ verification: "self", rewardPoints: 30 });
    const q2 = await h.createQuest({ verification: "self", rewardPoints: 70 });

    await Promise.all([
      selfCompleteAction(questForm(q1.id)),
      selfCompleteAction(questForm(q2.id)),
    ]);

    expect((await h.getUser(user.id))?.totalPoints).toBe(100);
  });

  it("境界: claim 不可な既存記録（submitted）があるときは新規 completed 行を作らず報酬も付かない", async () => {
    const user = await h.createUser();
    await h.login(user.id);
    const quest = await h.createQuest({ verification: "self", rewardPoints: 100 });
    // self フローでは通常生じないが、claim 不可状態の既存記録を用意して防御的挙動を固定する
    await h
      .db()
      .insert(questAttempts)
      .values({ userId: user.id, questId: quest.id, status: "submitted" });

    await selfCompleteAction(questForm(quest.id));

    const rows = await attemptsFor(user.id, quest.id);
    expect(rows).toHaveLength(1); // 新しい completed 行を作らない
    expect(rows[0]?.status).toBe("submitted");
    expect((await h.getUser(user.id))?.totalPoints).toBe(0);
  });

  it("migration 0004: 既存の完了重複を解消してから部分ユニークインデックスを作成できる", async () => {
    const db = h.db();
    const user = await h.createUser();
    const q1 = await h.createQuest();
    const q2 = await h.createQuest();

    // 索引を一旦外し、旧実装の競合で生じ得た「同一 user×quest の完了重複」を再現する。
    await db.run(sql`DROP INDEX quest_attempts_unique_completion`);
    await db.insert(questAttempts).values([
      { userId: user.id, questId: q1.id, status: "completed" },
      { userId: user.id, questId: q1.id, status: "approved" },
      { userId: user.id, questId: q1.id, status: "completed" },
      { userId: user.id, questId: q2.id, status: "completed" },
    ]);

    // コミット済みのマイグレーションファイル 0004 をそのまま適用（重複解消 → 索引作成）。
    // 重複が残ったままだと CREATE UNIQUE INDEX が失敗するため、本テストが通ること自体が
    // 「索引作成前に重複が解消される」ことの保証になる。
    const file = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../drizzle/migrations/0004_free_falcon.sql",
    );
    const statements = readFileSync(file, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await db.run(sql.raw(stmt));
    }

    // 各 (user, quest) につき完了記録は最古の1件だけ残る。
    const q1Rows = await db
      .select()
      .from(questAttempts)
      .where(
        and(
          eq(questAttempts.userId, user.id),
          eq(questAttempts.questId, q1.id),
        ),
      );
    expect(q1Rows).toHaveLength(1);
    const q2Rows = await db
      .select()
      .from(questAttempts)
      .where(
        and(
          eq(questAttempts.userId, user.id),
          eq(questAttempts.questId, q2.id),
        ),
      );
    expect(q2Rows).toHaveLength(1);
  });
});
