/**
 * フォーム入力（FormData）を型安全に読み取るヘルパー。
 *
 * `FormData.get` は `string | File | null` を返すため、そのまま文字列化すると
 * File が `[object File]` になり得る。テキストフィールド前提で安全に文字列を取り出す。
 */

/** 文字列フィールドを取り出す（File / null のときは fallback） */
export function formString(formData: FormData, key: string, fallback = ""): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

/** 同名の文字列フィールドを全て取り出す（チェックボックス等の複数値向け） */
export function formStrings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((v): v is string => typeof v === "string");
}

/**
 * サーバーアクションの戻り値（フォーム状態）。
 * 入力検証に失敗したときは `error` にユーザー向けメッセージを格納する
 * （throw ではなくフォーム状態へ反映する方針へ統一 / Issue #3）。
 */
export interface ActionResult {
  error?: string;
}
