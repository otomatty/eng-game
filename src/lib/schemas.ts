import { z } from "zod";

/**
 * サーバーアクションが受け取る外部入力（フォーム）の Zod スキーマ。
 *
 * 副作用を持たない純粋なモジュールとして分離し、単体テスト可能にする
 * （CLAUDE.md 3章「入力検証」/ Issue #3）。
 *
 * フォームの値は基本的に文字列（`FormData`）で渡るため、数値・真偽値は
 * `z.coerce` / `z.preprocess` で型変換しつつ、範囲・列挙・文字数を検証する。
 */

// ---- 文字数などの上限値（マジックナンバーの集約） ----
export const LIMITS = {
  title: 120,
  name: 100,
  category: 50,
  description: 2000,
  submission: 5000,
  answer: 200,
  reviewNote: 1000,
  email: 255,
  passwordMin: 8,
  passwordMax: 72, // bcrypt が扱えるバイト長の目安
  rewardPoints: 1_000_000,
  estimatedRate: 100_000,
  sortOrder: 100_000,
} as const;

// ---- 再利用する部品スキーマ ----

/** 必須テキスト（前後空白をトリムし、1..max 文字） */
function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label}は必須です`)
    .max(max, `${label}は${max}文字以内で入力してください`);
}

/** 任意テキスト（トリムし、0..max 文字。未指定は空文字） */
function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label}は${max}文字以内で入力してください`)
    .default("");
}

/** カテゴリ（未指定・空なら「一般」にフォールバック） */
const categorySchema = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .trim()
    .max(LIMITS.category, `カテゴリは${LIMITS.category}文字以内で入力してください`)
    .transform((v) => v || "一般"),
);

/** 整数（範囲つき）。フォームの文字列を数値へ強制変換する。 */
function intInRange(min: number, max: number, label: string) {
  return z.coerce
    .number()
    .int(`${label}は整数で入力してください`)
    .min(min, `${label}は${min}以上で入力してください`)
    .max(max, `${label}は${max}以下で入力してください`);
}

/** 必須の正の整数 ID（セレクト・隠しフィールド由来） */
function requiredId(label: string) {
  return z.coerce.number().int().positive(`${label}を選択してください`);
}

/** 任意の ID（空文字・未指定は undefined） */
const optionalId = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().int().positive().optional(),
);

/** 任意のチームID（空文字・未指定は null） */
const optionalTeamId = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.union([z.coerce.number().int().positive(), z.null()]),
);

/** スキルID配列（チェックボックス由来。未指定は空配列） */
const skillIds = z
  .array(z.coerce.number().int().positive())
  .default([]);

/** チェックボックス（"on" / true のときのみ真） */
function checkbox() {
  return z.preprocess((v) => v === "on" || v === true, z.boolean());
}

/** メールアドレス（小文字化して形式検証） */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "メールアドレスを入力してください")
  .max(LIMITS.email, `メールアドレスは${LIMITS.email}文字以内で入力してください`)
  .email("メールアドレスの形式が正しくありません");

// ---- 列挙（PRD ドメイン値） ----
export const verificationEnum = z.enum(["self", "approval", "test"], {
  message: "検証方式が不正です",
});
export const roleEnum = z.enum(["engineer", "admin"], {
  message: "ロールが不正です",
});
export const questStatusEnum = z.enum(
  ["in_progress", "submitted", "approved", "completed", "rejected"],
  { message: "状態が不正です" },
);

// ============ 管理: クエスト ============

export const saveQuestSchema = z.object({
  id: optionalId,
  title: requiredText("タイトル", LIMITS.title),
  description: optionalText("説明", LIMITS.description),
  category: categorySchema,
  rewardPoints: intInRange(0, LIMITS.rewardPoints, "獲得ポイント"),
  verification: verificationEnum.default("self"),
  isPublished: checkbox(),
  skillIds,
});

export const toggleQuestPublishSchema = z.object({
  id: requiredId("クエスト"),
  publish: z.preprocess((v) => v === "true" || v === true, z.boolean()),
});

export const idOnlySchema = z.object({ id: requiredId("対象") });

// ============ 管理: クリア承認 ============

export const approveAttemptSchema = z.object({
  attemptId: requiredId("申請"),
});

export const rejectAttemptSchema = z.object({
  attemptId: requiredId("申請"),
  reviewNote: optionalText("差し戻し理由", LIMITS.reviewNote),
});

// ============ 管理: スキル & ツリー ============

export const saveSkillSchema = z.object({
  id: optionalId,
  name: requiredText("スキル名", LIMITS.name),
  category: categorySchema,
  description: optionalText("説明", LIMITS.description),
});

export const addDependencySchema = z
  .object({
    prerequisiteSkillId: requiredId("前提スキル"),
    unlockedSkillId: requiredId("開放スキル"),
  })
  .refine((d) => d.prerequisiteSkillId !== d.unlockedSkillId, {
    message: "前提スキルと開放スキルは別々に指定してください",
    path: ["unlockedSkillId"],
  });

// ============ 管理: 単価帯 ============

export const saveRateTierSchema = z.object({
  id: optionalId,
  name: requiredText("単価帯名", LIMITS.name),
  description: optionalText("説明", LIMITS.description),
  estimatedRate: intInRange(0, LIMITS.estimatedRate, "想定単価"),
  sortOrder: intInRange(0, LIMITS.sortOrder, "並び順"),
  skillIds,
});

/**
 * パスワードポリシー（最小長・最大長）。
 * 新規作成・変更・リセットで共通利用する（Issue #6 / ポリシーの一元化）。
 */
const newPasswordSchema = z
  .string()
  .min(LIMITS.passwordMin, `パスワードは${LIMITS.passwordMin}文字以上で入力してください`)
  .max(LIMITS.passwordMax, `パスワードは${LIMITS.passwordMax}文字以内で入力してください`);

// ============ 管理: ユーザー & チーム ============

export const createUserSchema = z.object({
  name: requiredText("氏名", LIMITS.name),
  email: emailSchema,
  password: newPasswordSchema,
  role: roleEnum.default("engineer"),
  teamId: optionalTeamId,
});

/** 管理者によるパスワードリセット（対象ユーザーへ新パスワードを再設定） */
export const adminResetPasswordSchema = z.object({
  id: requiredId("ユーザー"),
  newPassword: newPasswordSchema,
});

export const updateUserSchema = z.object({
  id: requiredId("ユーザー"),
  role: roleEnum.default("engineer"),
  teamId: optionalTeamId,
});

export const createTeamSchema = z.object({
  name: requiredText("チーム名", LIMITS.name),
});

// ============ エンジニア: クエスト挑戦 ============

export const questIdSchema = z.object({
  questId: requiredId("クエスト"),
});

export const submitForApprovalSchema = z.object({
  questId: requiredId("クエスト"),
  submission: z
    .string()
    .trim()
    .min(1, "提出物を入力してください")
    .max(LIMITS.submission, `提出物は${LIMITS.submission}文字以内で入力してください`),
});

export const takeTestSchema = z.object({
  questId: requiredId("クエスト"),
  answer: z
    .string()
    .trim()
    .max(LIMITS.answer, `解答は${LIMITS.answer}文字以内で入力してください`)
    .transform((v) => v.toLowerCase())
    .default(""),
});

// ============ 認証 ============

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "パスワードを入力してください")
    .max(LIMITS.passwordMax, `パスワードは${LIMITS.passwordMax}文字以内で入力してください`),
});

/**
 * ログインユーザー自身によるパスワード変更。
 * - 現在のパスワード確認（空でないこと。一致確認はサーバー側で bcrypt 照合）。
 * - 新パスワードはポリシー（最小長・最大長）を満たすこと。
 * - 確認用パスワードと一致すること。
 * - 現在のパスワードと異なること（同一PWへの無意味な変更を防ぐ）。
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "現在のパスワードを入力してください")
      .max(LIMITS.passwordMax, `パスワードは${LIMITS.passwordMax}文字以内で入力してください`),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, "確認用パスワードを入力してください"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "新しいパスワードと確認用パスワードが一致しません",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "現在のパスワードと異なる新しいパスワードを設定してください",
    path: ["newPassword"],
  });

/**
 * `safeParse` の失敗結果から、ユーザー向けの最初のエラーメッセージを取り出す。
 * フォーム状態（`{ error }`）へ反映する用途。
 */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください";
}
