import { describe, expect, it, vi } from "vitest";

// サーバーアクションが依存する Next.js / Cloudflare のリクエスト依存モジュールを
// インメモリのモックへ差し替える（実体は ./server-mocks）。
vi.mock("server-only", async () => (await import("./server-mocks")).serverOnlyMock);
vi.mock("@opennextjs/cloudflare", async () => (await import("./server-mocks")).cloudflareMock);
vi.mock("next/cache", async () => (await import("./server-mocks")).nextCacheMock);
vi.mock("next/headers", async () => (await import("./server-mocks")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./server-mocks")).nextNavigationMock);

import { eq } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { loginAction, logoutAction, changePasswordAction } from "@/app/actions/auth";
import { createTeamAction } from "@/app/actions/admin";
import { selfCompleteAction } from "@/app/actions/quests";
import { setupHarness } from "./harness";
import {
  catchRedirect,
  getSessionCookie,
  setSessionCookie,
} from "./server-mocks";

/**
 * 認証フローの統合テスト（Issue #8）。
 *
 * 観点:
 * - 正常系: 正しい資格情報でログイン → セッション発行（Cookie + DB 行）、ロール別リダイレクト。
 * - 異常系: パスワード不一致・存在しないメールでは失敗を返しセッションを作らない。
 * - 失効: ログアウト・期限切れ・パスワード変更で既存セッションが無効化される。
 * - 認可: 未ログインは /login、engineer による admin アクションは /home へリダイレクト。
 */

const h = setupHarness();

function loginForm(email: string, password: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

describe("認証: ログイン", () => {
  it("正しい資格情報でログインするとセッションが発行され、engineer は /home へリダイレクトする", async () => {
    const user = await h.createUser({
      email: "engineer@example.com",
      password: "password123",
      role: "engineer",
    });

    const dest = await catchRedirect(() =>
      loginAction(undefined, loginForm("engineer@example.com", "password123")),
    );
    expect(dest).toBe("/home");

    // Cookie が設定され、DB にセッション行が存在する
    const token = getSessionCookie();
    expect(token).toBeTruthy();
    const rows = await h
      .db()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(token);
  });

  it("admin でログインすると /admin へリダイレクトする", async () => {
    await h.createUser({
      email: "admin@example.com",
      password: "password123",
      role: "admin",
    });
    const dest = await catchRedirect(() =>
      loginAction(undefined, loginForm("admin@example.com", "password123")),
    );
    expect(dest).toBe("/admin");
  });

  it("メールは大文字小文字を区別せずログインできる", async () => {
    await h.createUser({ email: "case@example.com", password: "password123" });
    const dest = await catchRedirect(() =>
      loginAction(undefined, loginForm("CASE@Example.com", "password123")),
    );
    expect(dest).toBe("/home");
  });

  it("パスワードが不一致のときはエラーを返し、セッションを発行しない", async () => {
    const user = await h.createUser({
      email: "wrong@example.com",
      password: "password123",
    });
    const result = await loginAction(
      undefined,
      loginForm("wrong@example.com", "badpassword"),
    );
    expect(result.error).toBeTruthy();
    expect(getSessionCookie()).toBeUndefined();
    const rows = await h
      .db()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(0);
  });

  it("存在しないメールではエラーを返す（ユーザーの有無を区別しない文言）", async () => {
    const result = await loginAction(
      undefined,
      loginForm("nobody@example.com", "password123"),
    );
    expect(result.error).toBeTruthy();
    expect(getSessionCookie()).toBeUndefined();
  });

  it("入力が不正（メール形式でない）なときは検証エラーを返す", async () => {
    const result = await loginAction(
      undefined,
      loginForm("not-an-email", "password123"),
    );
    expect(result.error).toBeTruthy();
  });
});

describe("認証: セッションの発行と失効", () => {
  it("発行されたセッションで getCurrentUser が本人を返す（パスワードハッシュは含めない）", async () => {
    const user = await h.createUser({ name: "本人", role: "engineer" });
    await h.login(user.id);

    const current = await getCurrentUser();
    expect(current?.id).toBe(user.id);
    expect(current?.name).toBe("本人");
    expect(current).not.toHaveProperty("passwordHash");
  });

  it("ログアウトするとセッション行と Cookie が削除され、getCurrentUser が null になる", async () => {
    const user = await h.createUser();
    await h.login(user.id);

    await catchRedirect(() => logoutAction());

    expect(getSessionCookie()).toBeUndefined();
    const rows = await h
      .db()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(rows).toHaveLength(0);
    expect(await getCurrentUser()).toBeNull();
  });

  it("期限切れのセッションは無効として扱われる（境界: 過去日時）", async () => {
    const user = await h.createUser();
    await h.login(user.id, new Date(Date.now() - 1000));
    expect(await getCurrentUser()).toBeNull();
  });

  it("不明なトークンの Cookie では getCurrentUser が null を返す", async () => {
    await h.createUser();
    setSessionCookie("not-a-real-token");
    expect(await getCurrentUser()).toBeNull();
  });

  it("パスワード変更で既存セッションが全て失効し、本人には新セッションが再発行される", async () => {
    const user = await h.createUser({ password: "password123" });
    // 別端末の既存セッションを2つ用意
    await h.login(user.id);
    await h.login(user.id);
    const before = await h
      .db()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(before).toHaveLength(2);

    const fd = new FormData();
    fd.set("currentPassword", "password123");
    fd.set("newPassword", "newpassword456");
    fd.set("confirmPassword", "newpassword456");
    const result = await changePasswordAction({}, fd);
    expect(result.success).toBeTruthy();

    // 既存2つは失効し、本人の新セッション1つだけが残る
    const after = await h
      .db()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(getSessionCookie());
  });

  it("現在のパスワードが誤っているとパスワード変更は失敗する", async () => {
    const user = await h.createUser({ password: "password123" });
    await h.login(user.id);
    const fd = new FormData();
    fd.set("currentPassword", "wrongcurrent");
    fd.set("newPassword", "newpassword456");
    fd.set("confirmPassword", "newpassword456");
    const result = await changePasswordAction({}, fd);
    expect(result.error).toBeTruthy();
  });
});

describe("認証: 認可（ガード）", () => {
  it("未ログインで要ログインのアクションを呼ぶと /login へリダイレクトする", async () => {
    const quest = await h.createQuest({ verification: "self" });
    const fd = new FormData();
    fd.set("questId", String(quest.id));
    const dest = await catchRedirect(() => selfCompleteAction(fd));
    expect(dest).toBe("/login");
  });

  it("engineer が admin 専用アクションを呼ぶと /home へリダイレクトする", async () => {
    const engineer = await h.createUser({ role: "engineer" });
    await h.login(engineer.id);
    const fd = new FormData();
    fd.set("name", "新チーム");
    const dest = await catchRedirect(() => createTeamAction({}, fd));
    expect(dest).toBe("/home");
  });

  it("admin は admin 専用アクションを実行できる", async () => {
    const admin = await h.createUser({ role: "admin" });
    await h.login(admin.id);
    const fd = new FormData();
    fd.set("name", "新チーム");
    const result = await createTeamAction({}, fd);
    expect(result).toEqual({});
  });
});
