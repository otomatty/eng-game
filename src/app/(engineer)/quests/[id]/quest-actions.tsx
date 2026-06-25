"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  selfCompleteAction,
  startQuestAction,
  submitForApprovalAction,
  takeTestAction,
} from "@/app/actions/quests";

/** 表示用の選択肢（正解情報は含めない）。 */
export interface DisplayChoice {
  id: number;
  label: string;
}

/** 表示用の設問（正解情報は含めない / Issue #7）。 */
export interface DisplayQuestion {
  id: number;
  prompt: string;
  kind: "single" | "text";
  choices: DisplayChoice[];
}

interface Props {
  questId: number;
  verification: "self" | "approval" | "test";
  status?: string;
  reviewNote?: string;
  submission?: string;
  questions?: DisplayQuestion[];
}

export function QuestActions({
  questId,
  verification,
  status,
  reviewNote,
  submission,
  questions = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [text, setText] = useState(submission ?? "");
  // 設問 id -> 提出値（single は選択肢 id 文字列、text は入力文字列）
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const setAnswer = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };
  const allAnswered =
    questions.length > 0 &&
    questions.every((q) => (answers[q.id] ?? "").trim() !== "");

  const completed = status === "completed" || status === "approved";
  const submitted = status === "submitted";

  function run(fn: () => Promise<unknown>) {
    setMessage(null);
    startTransition(async () => {
      const res = (await fn()) as { error?: string } | undefined;
      if (res?.error) setMessage(res.error);
      router.refresh();
    });
  }

  function fd() {
    const f = new FormData();
    f.set("questId", String(questId));
    return f;
  }

  if (completed) {
    return (
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        ✓ このクエストはクリア済みです。ポイントとスキルを獲得しました。
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
        ⏳ 承認待ちです。管理者の確認をお待ちください。
        {submission && (
          <p className="mt-2 text-xs text-amber-600/80">提出: {submission}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {status === "rejected" && reviewNote && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          差し戻されました。理由: {reviewNote}
        </div>
      )}

      {verification === "self" && (
        <button
          className="btn-primary w-full"
          disabled={pending}
          onClick={() => { run(() => selfCompleteAction(fd())); }}
        >
          {pending ? "処理中…" : "クリアを申告する"}
        </button>
      )}

      {verification === "approval" && (
        <div className="space-y-2">
          <label className="label" htmlFor="submission-text">成果物のURL / 説明</label>
          <textarea
            id="submission-text"
            className="input min-h-24"
            placeholder="例: https://github.com/... 作ったものの説明を添えてください"
            value={text}
            onChange={(e) => { setText(e.target.value); }}
          />
          <button
            className="btn-primary w-full"
            disabled={pending || !text.trim()}
            onClick={() => {
              const f = fd();
              f.set("submission", text);
              run(() => submitForApprovalAction(f));
            }}
          >
            {pending ? "送信中…" : "提出して承認を依頼する"}
          </button>
        </div>
      )}

      {verification === "test" && questions.length === 0 && (
        <div className="rounded-xl bg-zen-bg px-4 py-3 text-sm text-zen-sub">
          このテストにはまだ設問が設定されていません。管理者にお問い合わせください。
        </div>
      )}

      {verification === "test" && questions.length > 0 && (
        <div className="space-y-5">
          {questions.map((q, index) => (
            <fieldset key={q.id} className="space-y-2">
              <legend className="label">
                問{index + 1}. {q.prompt}
              </legend>
              {q.kind === "single" ? (
                <div className="space-y-1.5">
                  {q.choices.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-zen-line bg-white px-3 py-2 text-sm has-[:checked]:border-zen-accent has-[:checked]:bg-zen-accentSoft"
                    >
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        value={c.id}
                        checked={answers[q.id] === String(c.id)}
                        onChange={() => { setAnswer(q.id, String(c.id)); }}
                        className="accent-zen-accent"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  className="input"
                  placeholder="解答を入力"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => { setAnswer(q.id, e.target.value); }}
                />
              )}
            </fieldset>
          ))}
          <button
            className="btn-primary w-full"
            disabled={pending || !allAnswered}
            onClick={() => {
              const f = fd();
              for (const q of questions) {
                f.set(`q_${q.id}`, answers[q.id] ?? "");
              }
              run(() => takeTestAction(f));
            }}
          >
            {pending ? "判定中…" : "テストを提出する"}
          </button>
        </div>
      )}

      {!status && (
        <button
          className="btn-ghost w-full"
          disabled={pending}
          onClick={() => { run(() => startQuestAction(fd())); }}
        >
          まず「挑戦中」にする
        </button>
      )}

      {message && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {message}
        </p>
      )}
    </div>
  );
}
