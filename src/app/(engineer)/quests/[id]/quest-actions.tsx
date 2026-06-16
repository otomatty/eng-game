"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  selfCompleteAction,
  startQuestAction,
  submitForApprovalAction,
  takeTestAction,
} from "@/app/actions/quests";

interface Props {
  questId: number;
  verification: "self" | "approval" | "test";
  status?: string;
  reviewNote?: string;
  submission?: string;
}

export function QuestActions({
  questId,
  verification,
  status,
  reviewNote,
  submission,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [text, setText] = useState(submission ?? "");
  const [answer, setAnswer] = useState("");

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

      {verification === "test" && (
        <div className="space-y-2">
          <label className="label" htmlFor="test-answer">テストの解答</label>
          <input
            id="test-answer"
            className="input"
            placeholder="解答を入力（デモ: pass で合格）"
            value={answer}
            onChange={(e) => { setAnswer(e.target.value); }}
          />
          <button
            className="btn-primary w-full"
            disabled={pending || !answer.trim()}
            onClick={() => {
              const f = fd();
              f.set("answer", answer);
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
