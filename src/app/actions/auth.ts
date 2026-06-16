"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { formString, type ActionResult } from "@/lib/form";
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

  const db = getDb();
  const user = (
    await db.select().from(users).where(eq(users.email, email)).limit(1)
  )[0];

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }

  await createSession(user.id);
  redirect(user.role === "admin" ? "/admin" : "/home");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
