"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  destroySession,
  hashPassword,
  invalidateUserSessions,
  verifyPassword,
} from "@/lib/auth";
import { requireUser } from "@/lib/guards";
import { formString, type ActionResult } from "@/lib/form";
import {
  checkLoginRateLimit,
  formatRetryAfter,
  recordLoginFailure,
  resetLoginRateLimit,
} from "@/lib/login-rate-limit";
import { changePasswordSchema, firstError, loginSchema } from "@/lib/schemas";

export async function loginAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success) {
    return { error: "メールアドレスとパスワードを正しく入力してください。" };
  }
  const { email, password } = parsed.data;

  // 総当たり対策: IP+メール単位でロック中なら検証前に弾く（Issue #5）
  const rate = await checkLoginRateLimit(email);
  if (rate.blocked) {
    return {
      error: `ログイン試行が制限されています。${formatRetryAfter(rate.retryAfterMs)}後に再度お試しください。`,
    };
  }

  const db = getDb();
  const user = (
    await db.select().from(users).where(eq(users.email, email)).limit(1)
  )[0];

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await recordLoginFailure(rate.key);
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }

  // 成功: 失敗カウンタをリセットしてからセッション発行
  await resetLoginRateLimit(rate.key);
  await createSession(user.id);
  redirect(user.role === "admin" ? "/admin" : "/home");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/**
 * ログインユーザー自身によるパスワード変更。
 *
 * - 現行パスワードを bcrypt で照合し、一致しなければ拒否する。
 * - 新パスワードはポリシー（最小長等・Zod）と確認用一致・同一PW不可を検証する。
 * - 変更後は当該ユーザーの既存セッションを全て失効させ、操作中の本人には
 *   新しいセッションを再発行して継続ログインさせる（他端末はログアウト）。
 *
 * `requireUser` で取得した本人の ID のみを対象にするため、他人のパスワードは
 * 変更できない。
 */
export async function changePasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const current = await requireUser();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formString(formData, "currentPassword"),
    newPassword: formString(formData, "newPassword"),
    confirmPassword: formString(formData, "confirmPassword"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const db = getDb();
  const user = (
    await db.select().from(users).where(eq(users.id, current.id)).limit(1)
  )[0];
  if (!user) return { error: "ユーザーが見つかりません。" };

  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { error: "現在のパスワードが正しくありません。" };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(users.id, user.id));

  // 既存セッションを失効 → 本人には新セッションを再発行（他端末は無効化）
  await invalidateUserSessions(user.id);
  await createSession(user.id);

  return {
    success: "パスワードを変更しました。他の端末のログインは無効になりました。",
  };
}
