/**
 * サーバーアクションの統合テスト用に、Next.js / Cloudflare のリクエスト依存
 * モジュールを差し替えるモック（Issue #8）。
 *
 * サーバーアクションは `next/headers`（Cookie・ヘッダ）, `next/navigation`
 * （redirect）, `next/cache`（revalidatePath）, `server-only`,
 * `@opennextjs/cloudflare`（D1 取得）に依存する。これらは実リクエストが無いと
 * 動かないため、インメモリの可変ストアで置き換える。
 *
 * 各テストファイル冒頭で `vi.mock(...)` から本モジュールを参照する。状態は
 * モジュールスコープに持ち、`resetServerMocks()` で初期化する。
 */

// ---- Cookie ストア（next/headers cookies()） ----

interface CookieRecord {
  name: string;
  value: string;
}

const cookieJar = new Map<string, string>();

const cookieStore = {
  get(name: string): CookieRecord | undefined {
    const value = cookieJar.get(name);
    return value === undefined ? undefined : { name, value };
  },
  set(name: string, value: string): void {
    cookieJar.set(name, value);
  },
  delete(name: string): void {
    cookieJar.delete(name);
  },
};

// ---- ヘッダストア（next/headers headers()） ----

const headerMap = new Map<string, string>();

const headerStore = {
  get(name: string): string | null {
    return headerMap.get(name.toLowerCase()) ?? null;
  },
};

// ---- redirect（next/navigation） ----

/**
 * redirect() の代替。Next.js 同様「以降の処理を止める」ため例外を投げ、
 * 行き先を保持する。テストは `catchRedirect` で行き先を検証する。
 */
export class RedirectError extends Error {
  constructor(public readonly destination: string) {
    super(`NEXT_REDIRECT:${destination}`);
    this.name = "RedirectError";
  }
}

/**
 * redirect を伴う処理を実行し、行き先を取り出す。
 * redirect が発生しなければ（= 想定外）テストを失敗させるため例外を投げる。
 */
export async function catchRedirect(
  run: () => Promise<unknown>,
): Promise<string> {
  try {
    await run();
  } catch (err) {
    if (err instanceof RedirectError) return err.destination;
    throw err;
  }
  throw new Error("redirect が発生しませんでした");
}

// ---- vi.mock から参照する各モジュールの差し替え実体 ----

export const nextHeadersMock = {
  cookies: () => Promise.resolve(cookieStore),
  headers: () => Promise.resolve(headerStore),
};

export const nextNavigationMock = {
  redirect: (destination: string): never => {
    throw new RedirectError(destination);
  },
};

export const nextCacheMock = {
  revalidatePath: (): void => {
    /* no-op: テストでは再検証は不要 */
  },
  revalidateTag: (): void => {
    /* no-op */
  },
};

export const serverOnlyMock = {};

export const cloudflareMock = {
  getCloudflareContext: (): never => {
    throw new Error(
      "getCloudflareContext は統合テストで呼ばれてはいけません（setTestDatabase で DB を注入してください）",
    );
  },
};

// ---- テストからの操作ヘルパー ----

/** 全モック状態を初期化する（各テストの beforeEach で呼ぶ）。 */
export function resetServerMocks(): void {
  cookieJar.clear();
  headerMap.clear();
}

/** セッション Cookie を直接セットする（ログイン済み状態の再現）。 */
export function setSessionCookie(token: string): void {
  cookieJar.set("eng_game_session", token);
}

/** 現在のセッション Cookie の値を取得する（発行確認用）。 */
export function getSessionCookie(): string | undefined {
  return cookieJar.get("eng_game_session");
}

/** リクエストヘッダをセットする（クライアント IP 等）。 */
export function setHeader(name: string, value: string): void {
  headerMap.set(name.toLowerCase(), value);
}
