import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", async () => (await import("./server-mocks")).serverOnlyMock);
vi.mock("@opennextjs/cloudflare", async () => (await import("./server-mocks")).cloudflareMock);
vi.mock("next/cache", async () => (await import("./server-mocks")).nextCacheMock);
vi.mock("next/headers", async () => (await import("./server-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./server-mocks")).nextNavigationMock);

import { and, eq } from "drizzle-orm";
import { questAttempts } from "@/db/schema";
import { approveAttemptAction, rejectAttemptAction } from "@/app/actions/admin";
import { submitForApprovalAction } from "@/app/actions/quests";
import { setupHarness } from "./harness";
import { catchRedirect } from "./server-mocks";

/**
 * 承認フローの統合テスト（Issue #8）。
 *
 * 観点:
 * - 正常系: 承認でクリア確定（ポイント・スキル・単価更新）、差し戻しで rejected。
 * - 異常系: engineer による承認/差し戻しは /home へリダイレクト（権限不足）。
 *           submitted でない記録・存在しない記録は何も変えない。
 * - 境界: 同じ提出を二重承認してもポイントは二重加算されない。
 */

const h = setupHarness();

/** engineer が承認型クエストを提出し、submitted の attempt を作る。 */
async function submitApprovalQuest(opts: {
  rewardPoints?: number;
  skillIds?: number[];
}) {
  const engineer = await h.createUser({ role: "engineer" });
  await h.login(engineer.id);
  const quest = await h.createQuest({
    verification: "approval",
    rewardPoints: opts.rewardPoints ?? 100,
    skillIds: opts.skillIds ?? [],
  });
  await submitForApprovalAction(
    (() => {
      const fd = new FormData();
      fd.set("questId", String(quest.id));
      fd.set("submission", "成果物");
      return fd;
    })(),
  );
  const attempt = (
    await h
      .db()
      .select()
      .from(questAttempts)
      .where(
        and(
          eq(questAttempts.userId, engineer.id),
          eq(questAttempts.questId, quest.id),
        ),
      )
  )[0];
  if (!attempt) throw new Error("提出に失敗");
  return { engineer, quest, attempt };
}

function attemptForm(attemptId: number, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("attemptId", String(attemptId));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("承認: approveAttemptAction", () => {
  it("admin が承認するとクリア確定し、ポイント・スキル・単価が更新される", async () => {
    const skill = await h.createSkill("Kubernetes");
    const { engineer, quest, attempt } = await submitApprovalQuest({
      rewardPoints: 150,
      skillIds: [skill.id],
    });
    await h.createRateTier({ estimatedRate: 90, skillIds: [skill.id] });
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);

    await approveAttemptAction(attemptForm(attempt.id));

    const updated = (
      await h.db().select().from(questAttempts).where(eq(questAttempts.id, attempt.id))
    )[0];
    expect(updated?.status).toBe("approved");
    expect(updated?.approverId).toBe(admin.id);

    const after = await h.getUser(engineer.id);
    expect(after?.totalPoints).toBe(150);
    expect(after?.currentEstimatedRate).toBe(90);
    expect(await h.getAcquiredSkillIds(engineer.id)).toEqual([skill.id]);
    void quest;
  });

  it("境界: 同じ提出を二重承認してもポイントは二重加算されない", async () => {
    const { engineer, attempt } = await submitApprovalQuest({ rewardPoints: 100 });
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);

    await approveAttemptAction(attemptForm(attempt.id));
    await approveAttemptAction(attemptForm(attempt.id)); // 2回目は submitted でないので無視

    expect((await h.getUser(engineer.id))?.totalPoints).toBe(100);
  });

  it("境界: 同じ提出を同時に承認してもポイントは1回だけ付与される（原子的 claim）", async () => {
    const skill = await h.createSkill("Terraform");
    const { engineer, attempt } = await submitApprovalQuest({
      rewardPoints: 120,
      skillIds: [skill.id],
    });
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);

    await Promise.all([
      approveAttemptAction(attemptForm(attempt.id)),
      approveAttemptAction(attemptForm(attempt.id)),
      approveAttemptAction(attemptForm(attempt.id)),
    ]);

    expect((await h.getUser(engineer.id))?.totalPoints).toBe(120);
    expect(await h.getAcquiredSkillIds(engineer.id)).toEqual([skill.id]);
    const updated = (
      await h.db().select().from(questAttempts).where(eq(questAttempts.id, attempt.id))
    )[0];
    expect(updated?.status).toBe("approved");
  });

  it("異常系: submitted でない記録は承認しても状態が変わらない", async () => {
    const engineer = await h.createUser({ role: "engineer" });
    const quest = await h.createQuest({ verification: "approval", rewardPoints: 100 });
    const [attempt] = await h
      .db()
      .insert(questAttempts)
      .values({ userId: engineer.id, questId: quest.id, status: "in_progress" })
      .returning();
    if (!attempt) throw new Error("attempt の作成に失敗");
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);

    await approveAttemptAction(attemptForm(attempt.id));

    const updated = (
      await h.db().select().from(questAttempts).where(eq(questAttempts.id, attempt.id))
    )[0];
    expect(updated?.status).toBe("in_progress");
    expect((await h.getUser(engineer.id))?.totalPoints).toBe(0);
  });

  it("異常系: 存在しない attemptId を承認しても何も起こらない（例外を投げない）", async () => {
    const engineer = await h.createUser({ role: "engineer" });
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);

    await expect(
      approveAttemptAction(attemptForm(999999)),
    ).resolves.toBeUndefined();

    expect((await h.getUser(engineer.id))?.totalPoints).toBe(0);
    expect(
      await h.db().select().from(questAttempts),
    ).toHaveLength(0);
  });

  it("異常系: engineer が承認アクションを呼ぶと /home へリダイレクトし、状態は変わらない", async () => {
    const { attempt } = await submitApprovalQuest({ rewardPoints: 100 });
    const otherEngineer = await h.createUser({ role: "engineer" });
    await h.login(otherEngineer.id);

    const dest = await catchRedirect(() =>
      approveAttemptAction(attemptForm(attempt.id)),
    );
    expect(dest).toBe("/home");

    const updated = (
      await h.db().select().from(questAttempts).where(eq(questAttempts.id, attempt.id))
    )[0];
    expect(updated?.status).toBe("submitted");
  });
});

describe("承認: rejectAttemptAction", () => {
  it("admin が差し戻すと rejected になり、レビューメモが残る（ポイントは付与されない）", async () => {
    const { engineer, attempt } = await submitApprovalQuest({ rewardPoints: 100 });
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);

    const res = await rejectAttemptAction(
      {},
      attemptForm(attempt.id, { reviewNote: "要件未達" }),
    );
    expect(res).toEqual({});

    const updated = (
      await h.db().select().from(questAttempts).where(eq(questAttempts.id, attempt.id))
    )[0];
    expect(updated?.status).toBe("rejected");
    expect(updated?.reviewNote).toBe("要件未達");
    expect(updated?.approverId).toBe(admin.id);
    expect((await h.getUser(engineer.id))?.totalPoints).toBe(0);
  });

  it("異常系: 存在しない attemptId を差し戻しても何も起こらない", async () => {
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);

    const res = await rejectAttemptAction(
      {},
      attemptForm(999999, { reviewNote: "x" }),
    );
    expect(res).toEqual({});
    expect(await h.db().select().from(questAttempts)).toHaveLength(0);
  });

  it("異常系: engineer が差し戻しアクションを呼ぶと /home へリダイレクトする", async () => {
    const { attempt } = await submitApprovalQuest({ rewardPoints: 100 });
    const otherEngineer = await h.createUser({ role: "engineer" });
    await h.login(otherEngineer.id);

    const dest = await catchRedirect(() =>
      rejectAttemptAction({}, attemptForm(attempt.id, { reviewNote: "x" })),
    );
    expect(dest).toBe("/home");
  });

  it("差し戻し後は再提出でき、最終的に承認まで到達できる（状態遷移の一気通貫）", async () => {
    const skill = await h.createSkill("CI");
    const { engineer, quest, attempt } = await submitApprovalQuest({
      rewardPoints: 80,
      skillIds: [skill.id],
    });
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);
    await rejectAttemptAction({}, attemptForm(attempt.id, { reviewNote: "直して" }));

    // engineer が再提出
    await h.login(engineer.id);
    const fd = new FormData();
    fd.set("questId", String(quest.id));
    fd.set("submission", "修正版");
    await submitForApprovalAction(fd);
    const resubmitted = (
      await h
        .db()
        .select()
        .from(questAttempts)
        .where(eq(questAttempts.id, attempt.id))
    )[0];
    expect(resubmitted?.status).toBe("submitted");

    // admin が承認
    await h.login(admin.id);
    await approveAttemptAction(attemptForm(attempt.id));

    expect((await h.getUser(engineer.id))?.totalPoints).toBe(80);
    expect(await h.getAcquiredSkillIds(engineer.id)).toEqual([skill.id]);
  });
});
