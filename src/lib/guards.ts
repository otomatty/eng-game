import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./auth";

/** ログイン必須。未ログインならログイン画面へ。 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 管理者必須。 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/home");
  return user;
}
