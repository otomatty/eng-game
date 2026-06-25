import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", async () => (await import("./server-mocks")).serverOnlyMock);
vi.mock("@opennextjs/cloudflare", async () => (await import("./server-mocks")).cloudflareMock);
vi.mock("next/cache", async () => (await import("./server-mocks")).nextCacheMock);
vi.mock("next/headers", async () => (await import("./server-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./server-mocks")).nextNavigationMock);

import { and, eq } from "drizzle-orm";
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
