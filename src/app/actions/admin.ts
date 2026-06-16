"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  questAttempts,
  questSkills,
  quests,
  rateTierSkills,
  rateTiers,
  skillDependencies,
  skills,
  teams,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/guards";
import { completeQuestForUser, recomputeEstimatedRate } from "@/lib/domain";
import { hashPassword } from "@/lib/auth";
import { formString } from "@/lib/form";

function ints(fd: FormData, key: string): number[] {
  return fd
    .getAll(key)
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));
}

// ============ クエスト ============

export async function saveQuestAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id")) || null;
  const data = {
    title: formString(fd, "title").trim(),
    description: formString(fd, "description").trim(),
    category: formString(fd, "category", "一般").trim() || "一般",
    rewardPoints: Math.max(0, Number(fd.get("rewardPoints")) || 0),
    verification: formString(fd, "verification", "self") as
      | "self"
      | "approval"
      | "test",
    isPublished: fd.get("isPublished") === "on",
  };
  if (!data.title) throw new Error("タイトルは必須です");

  const skillIds = ints(fd, "skillIds");

  let questId: number;
  if (id) {
    await db.update(quests).set(data).where(eq(quests.id, id));
    questId = id;
    await db.delete(questSkills).where(eq(questSkills.questId, id));
  } else {
    const row = await db.insert(quests).values(data).returning();
    const inserted = row[0];
    if (!inserted) throw new Error("クエストの作成に失敗しました");
    questId = inserted.id;
  }
  if (skillIds.length > 0) {
    await db
      .insert(questSkills)
      .values(skillIds.map((skillId) => ({ questId, skillId })))
      .onConflictDoNothing();
  }
  revalidatePath("/admin/quests");
}

export async function deleteQuestAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  await db.delete(quests).where(eq(quests.id, id));
  revalidatePath("/admin/quests");
}

export async function toggleQuestPublishAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const publish = fd.get("publish") === "true";
  await db.update(quests).set({ isPublished: publish }).where(eq(quests.id, id));
  revalidatePath("/admin/quests");
}

// ============ クリア承認 ============

export async function approveAttemptAction(fd: FormData) {
  const admin = await requireAdmin();
  const attemptId = Number(fd.get("attemptId"));
  const attempt = (
    await db.select().from(questAttempts).where(eq(questAttempts.id, attemptId)).limit(1)
  )[0];
  if (attempt?.status !== "submitted") return;

  await db
    .update(questAttempts)
    .set({ status: "approved", approverId: admin.id, approvedAt: new Date() })
    .where(eq(questAttempts.id, attemptId));

  await completeQuestForUser(attempt.userId, attempt.questId);
  revalidatePath("/admin/approvals");
  revalidatePath("/admin");
}

export async function rejectAttemptAction(fd: FormData) {
  const admin = await requireAdmin();
  const attemptId = Number(fd.get("attemptId"));
  const note = formString(fd, "reviewNote").trim();
  await db
    .update(questAttempts)
    .set({ status: "rejected", approverId: admin.id, reviewNote: note })
    .where(
      and(eq(questAttempts.id, attemptId), eq(questAttempts.status, "submitted")),
    );
  revalidatePath("/admin/approvals");
  revalidatePath("/admin");
}

// ============ スキル & ツリー ============

export async function saveSkillAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id")) || null;
  const data = {
    name: formString(fd, "name").trim(),
    category: formString(fd, "category", "一般").trim() || "一般",
    description: formString(fd, "description").trim(),
  };
  if (!data.name) throw new Error("スキル名は必須です");
  if (id) {
    await db.update(skills).set(data).where(eq(skills.id, id));
  } else {
    await db.insert(skills).values(data);
  }
  revalidatePath("/admin/skills");
}

export async function deleteSkillAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  await db.delete(skills).where(eq(skills.id, id));
  revalidatePath("/admin/skills");
}

export async function addDependencyAction(fd: FormData) {
  await requireAdmin();
  const prerequisiteSkillId = Number(fd.get("prerequisiteSkillId"));
  const unlockedSkillId = Number(fd.get("unlockedSkillId"));
  if (
    !prerequisiteSkillId ||
    !unlockedSkillId ||
    prerequisiteSkillId === unlockedSkillId
  ) {
    throw new Error("前提スキルと開放スキルは別々に指定してください");
  }
  await db
    .insert(skillDependencies)
    .values({ prerequisiteSkillId, unlockedSkillId })
    .onConflictDoNothing();
  revalidatePath("/admin/skills");
}

export async function removeDependencyAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  await db.delete(skillDependencies).where(eq(skillDependencies.id, id));
  revalidatePath("/admin/skills");
}

// ============ 単価レンジ ============

export async function saveRateTierAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id")) || null;
  const data = {
    name: formString(fd, "name").trim(),
    description: formString(fd, "description").trim(),
    estimatedRate: Math.max(0, Number(fd.get("estimatedRate")) || 0),
    sortOrder: Number(fd.get("sortOrder")) || 0,
  };
  if (!data.name) throw new Error("単価帯名は必須です");
  const skillIds = ints(fd, "skillIds");

  let tierId: number;
  if (id) {
    await db.update(rateTiers).set(data).where(eq(rateTiers.id, id));
    tierId = id;
    await db.delete(rateTierSkills).where(eq(rateTierSkills.rateTierId, id));
  } else {
    const row = await db.insert(rateTiers).values(data).returning();
    const inserted = row[0];
    if (!inserted) throw new Error("単価帯の作成に失敗しました");
    tierId = inserted.id;
  }
  if (skillIds.length > 0) {
    await db
      .insert(rateTierSkills)
      .values(skillIds.map((skillId) => ({ rateTierId: tierId, skillId })))
      .onConflictDoNothing();
  }
  // 全エンジニアの想定単価を再計算（到達条件が変わったため）
  await recomputeAllRates();
  revalidatePath("/admin/rates");
}

export async function deleteRateTierAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  await db.delete(rateTiers).where(eq(rateTiers.id, id));
  await recomputeAllRates();
  revalidatePath("/admin/rates");
}

async function recomputeAllRates() {
  const engineers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "engineer"));
  for (const e of engineers) {
    await recomputeEstimatedRate(e.id);
  }
}

// ============ ユーザー & チーム ============

export async function createUserAction(fd: FormData) {
  await requireAdmin();
  const name = formString(fd, "name").trim();
  const email = formString(fd, "email").trim().toLowerCase();
  const password = formString(fd, "password");
  const role = formString(fd, "role", "engineer") as "engineer" | "admin";
  const teamId = Number(fd.get("teamId")) || null;
  if (!name || !email || !password) {
    throw new Error("氏名・メール・パスワードは必須です");
  }
  const exists = (
    await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  )[0];
  if (exists) throw new Error("このメールアドレスは既に登録されています");

  await db.insert(users).values({
    name,
    email,
    passwordHash: await hashPassword(password),
    role,
    teamId,
  });
  revalidatePath("/admin/users");
}

export async function updateUserAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const role = formString(fd, "role", "engineer") as "engineer" | "admin";
  const teamId = Number(fd.get("teamId")) || null;
  await db.update(users).set({ role, teamId }).where(eq(users.id, id));
  revalidatePath("/admin/users");
}

export async function deleteUserAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = Number(fd.get("id"));
  if (id === admin.id) throw new Error("自分自身は削除できません");
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/admin/users");
}

export async function createTeamAction(fd: FormData) {
  await requireAdmin();
  const name = formString(fd, "name").trim();
  if (!name) throw new Error("チーム名は必須です");
  await db.insert(teams).values({ name });
  revalidatePath("/admin/users");
}

export async function deleteTeamAction(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  await db.delete(teams).where(eq(teams.id, id));
  revalidatePath("/admin/users");
}
