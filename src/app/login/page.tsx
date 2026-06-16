import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/home");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zen-accent text-2xl text-white">
            禅
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Engineer Quest
          </h1>
          <p className="mt-1 text-sm text-zen-sub">
            学びを、単価につなげる。
          </p>
        </div>

        <div className="card">
          <LoginForm />
        </div>

        <div className="mt-6 rounded-xl border border-zen-line bg-white/60 p-4 text-xs text-zen-sub">
          <p className="mb-1 font-medium text-zen-ink">デモ用アカウント</p>
          <p>管理者: admin@example.com / password</p>
          <p>エンジニア: taro@example.com / password</p>
        </div>
      </div>
    </main>
  );
}
