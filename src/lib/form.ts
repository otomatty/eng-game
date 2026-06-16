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

/** 数値フィールドを取り出す（数値化できなければ fallback） */
export function formNumber(formData: FormData, key: string, fallback = 0): number {
  const n = Number(formString(formData, key));
  return Number.isNaN(n) ? fallback : n;
}
