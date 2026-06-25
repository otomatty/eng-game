"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { formString, type ActionResult } from "@/lib/form";
import {
  checkLoginRateLimit,
  formatRetryAfter,
  recordLoginFailure,
  resetLoginRateLimit,
} from "@/lib/login-rate-limit";
import { loginSchema } from "@/lib/schemas";

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
