"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { formString } from "@/lib/form";

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = formString(formData, "email").trim().toLowerCase();
  const password = formString(formData, "password");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

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
