import { describe, it, expect } from "vitest";
import {
  LIMITS,
  addDependencySchema,
  adminResetPasswordSchema,
  changePasswordSchema,
  createTeamSchema,
  createUserSchema,
  firstError,
  loginSchema,
  questIdSchema,
  rejectAttemptSchema,
  roleEnum,
  saveQuestSchema,
  saveQuestionSchema,
  saveRateTierSchema,
  saveSkillSchema,
  submitForApprovalSchema,
  takeTestSchema,
  testAnswerValueSchema,
  toggleQuestPublishSchema,
  updateUserSchema,
  verificationEnum,
} from "./schemas";

/**
 * 観点表（仕様検討の成果 / Issue #3）
 *
 * 各サーバーアクションの外部入力スキーマについて、以下を検証する。
 * - 正常系: 妥当な入力でパース成功し、想定どおりの型へ変換される。
 * - 異常系: 列挙外・型不一致・必須欠落・負数・上限超過でエラーになる。
 * - 境界値: 0 / 空文字 / 最大長ちょうど / 前後空白のトリム / 全角数字。
 */

describe("saveQuestSchema（クエスト作成・更新）", () => {
  const valid = {
    title: "TypeScript 入門",
    description: "型の基礎を学ぶ",
    category: "プログラミング",
    rewardPoints: "100",
    verification: "self",
    skillIds: ["1", "2"],
  };

  describe("正常系", () => {
    it("妥当な入力をパースし、数値・配列へ変換する", () => {
      const r = saveQuestSchema.parse(valid);
      expect(r.title).toBe("TypeScript 入門");
      expect(r.rewardPoints).toBe(100);
      expect(r.verification).toBe("self");
      expect(r.skillIds).toEqual([1, 2]);
      expect(r.isPublished).toBe(false);
    });

    it("チェックボックス isPublished='on' を true に変換する", () => {
      const r = saveQuestSchema.parse({ ...valid, isPublished: "on" });
      expect(r.isPublished).toBe(true);
    });

    it("id 未指定は undefined（新規作成）になる", () => {
      expect(saveQuestSchema.parse(valid).id).toBeUndefined();
    });

    it("id 指定時は正の整数へ変換する（更新）", () => {
      expect(saveQuestSchema.parse({ ...valid, id: "7" }).id).toBe(7);
    });
  });

  describe("異常系", () => {
    it("タイトルが空だとエラー", () => {
      expect(saveQuestSchema.safeParse({ ...valid, title: "" }).success).toBe(
        false,
      );
    });

    it("検証方式が列挙外だとエラー", () => {
      expect(
        saveQuestSchema.safeParse({ ...valid, verification: "unknown" }).success,
      ).toBe(false);
    });

    it("獲得ポイントが負数だとエラー", () => {
      expect(
        saveQuestSchema.safeParse({ ...valid, rewardPoints: "-1" }).success,
      ).toBe(false);
    });

    it("獲得ポイントが上限超過だとエラー", () => {
      expect(
        saveQuestSchema.safeParse({
          ...valid,
          rewardPoints: String(LIMITS.rewardPoints + 1),
        }).success,
      ).toBe(false);
    });

    it("獲得ポイントが小数だとエラー", () => {
      expect(
        saveQuestSchema.safeParse({ ...valid, rewardPoints: "10.5" }).success,
      ).toBe(false);
    });
  });

  describe("境界値", () => {
    it("獲得ポイント 0 は許可される", () => {
      expect(saveQuestSchema.parse({ ...valid, rewardPoints: "0" }).rewardPoints).toBe(
        0,
      );
    });

    it("タイトルの前後空白はトリムされる", () => {
      expect(saveQuestSchema.parse({ ...valid, title: "  abc  " }).title).toBe(
        "abc",
      );
    });

    it("タイトルが最大長ちょうどは許可される", () => {
      const title = "あ".repeat(LIMITS.title);
      expect(saveQuestSchema.parse({ ...valid, title }).title).toBe(title);
    });

    it("タイトルが最大長+1 だとエラー", () => {
      const title = "あ".repeat(LIMITS.title + 1);
      expect(saveQuestSchema.safeParse({ ...valid, title }).success).toBe(false);
    });

    it("カテゴリが空文字なら「一般」にフォールバックする", () => {
      expect(saveQuestSchema.parse({ ...valid, category: "" }).category).toBe(
        "一般",
      );
    });

    it("全角数字の獲得ポイントはエラー（半角数値のみ許可）", () => {
      expect(
        saveQuestSchema.safeParse({ ...valid, rewardPoints: "１００" }).success,
      ).toBe(false);
    });

    it("skillIds 未指定は空配列になる", () => {
      const { skillIds: _omit, ...rest } = valid;
      void _omit;
      expect(saveQuestSchema.parse(rest).skillIds).toEqual([]);
    });
  });
});

describe("toggleQuestPublishSchema（公開トグル）", () => {
  it("publish='true' を真偽値に変換する", () => {
    const r = toggleQuestPublishSchema.parse({ id: "3", publish: "true" });
    expect(r).toEqual({ id: 3, publish: true });
  });
  it("publish='false' は false になる", () => {
    expect(
      toggleQuestPublishSchema.parse({ id: "3", publish: "false" }).publish,
    ).toBe(false);
  });
  it("id が 0 だとエラー（正の整数が必須）", () => {
    expect(
      toggleQuestPublishSchema.safeParse({ id: "0", publish: "true" }).success,
    ).toBe(false);
  });
});

describe("rejectAttemptSchema（差し戻し）", () => {
  it("理由は任意（未指定は空文字）", () => {
    expect(rejectAttemptSchema.parse({ attemptId: "1" }).reviewNote).toBe("");
  });
  it("attemptId が数値でないとエラー", () => {
    expect(rejectAttemptSchema.safeParse({ attemptId: "abc" }).success).toBe(
      false,
    );
  });
  it("理由が上限超過だとエラー", () => {
    expect(
      rejectAttemptSchema.safeParse({
        attemptId: "1",
        reviewNote: "x".repeat(LIMITS.reviewNote + 1),
      }).success,
    ).toBe(false);
  });
});

describe("saveSkillSchema（スキル作成・更新）", () => {
  it("正常系: 妥当な入力をパースする", () => {
    const r = saveSkillSchema.parse({
      name: "Git",
      category: "ツール",
      description: "バージョン管理",
    });
    expect(r.name).toBe("Git");
    expect(r.description).toBe("バージョン管理");
  });
  it("異常系: スキル名が空だとエラー", () => {
    expect(saveSkillSchema.safeParse({ name: "  " }).success).toBe(false);
  });
  it("境界値: 説明未指定は空文字になる", () => {
    expect(saveSkillSchema.parse({ name: "Git" }).description).toBe("");
  });
});

describe("addDependencySchema（前提関係）", () => {
  it("正常系: 異なるスキルIDを受け付ける", () => {
    const r = addDependencySchema.parse({
      prerequisiteSkillId: "1",
      unlockedSkillId: "2",
    });
    expect(r).toEqual({ prerequisiteSkillId: 1, unlockedSkillId: 2 });
  });
  it("異常系: 前提と開放が同一だとエラー", () => {
    expect(
      addDependencySchema.safeParse({
        prerequisiteSkillId: "1",
        unlockedSkillId: "1",
      }).success,
    ).toBe(false);
  });
  it("境界値: 未選択（空文字）だとエラー", () => {
    expect(
      addDependencySchema.safeParse({
        prerequisiteSkillId: "",
        unlockedSkillId: "2",
      }).success,
    ).toBe(false);
  });
});

describe("saveRateTierSchema（単価帯）", () => {
  const valid = {
    name: "ミドル",
    description: "",
    estimatedRate: "60",
    sortOrder: "1",
    skillIds: ["1"],
  };
  it("正常系: 数値へ変換される", () => {
    const r = saveRateTierSchema.parse(valid);
    expect(r.estimatedRate).toBe(60);
    expect(r.sortOrder).toBe(1);
    expect(r.skillIds).toEqual([1]);
  });
  it("異常系: 想定単価が負数だとエラー", () => {
    expect(
      saveRateTierSchema.safeParse({ ...valid, estimatedRate: "-5" }).success,
    ).toBe(false);
  });
  it("境界値: 想定単価 0 は許可される", () => {
    expect(
      saveRateTierSchema.parse({ ...valid, estimatedRate: "0" }).estimatedRate,
    ).toBe(0);
  });
});

describe("createUserSchema（ユーザー作成）", () => {
  const valid = {
    name: "山田太郎",
    email: "Yamada@Example.com",
    password: "password123",
    role: "engineer",
    teamId: "2",
  };
  it("正常系: メールを小文字化し、teamId を数値へ変換する", () => {
    const r = createUserSchema.parse(valid);
    expect(r.email).toBe("yamada@example.com");
    expect(r.teamId).toBe(2);
    expect(r.role).toBe("engineer");
  });
  it("正常系: teamId 空文字は null（未所属）になる", () => {
    expect(createUserSchema.parse({ ...valid, teamId: "" }).teamId).toBeNull();
  });
  it("異常系: メール形式が不正だとエラー", () => {
    expect(
      createUserSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });
  it("異常系: ロールが列挙外だとエラー", () => {
    expect(
      createUserSchema.safeParse({ ...valid, role: "superuser" }).success,
    ).toBe(false);
  });
  it("境界値: パスワードが下限未満だとエラー", () => {
    expect(
      createUserSchema.safeParse({
        ...valid,
        password: "a".repeat(LIMITS.passwordMin - 1),
      }).success,
    ).toBe(false);
  });
  it("境界値: 氏名必須欠落（空文字）だとエラー", () => {
    expect(createUserSchema.safeParse({ ...valid, name: "" }).success).toBe(
      false,
    );
  });
});

describe("updateUserSchema（ユーザー更新）", () => {
  it("正常系: id・role・teamId を変換する", () => {
    const r = updateUserSchema.parse({ id: "5", role: "admin", teamId: "" });
    expect(r).toEqual({ id: 5, role: "admin", teamId: null });
  });
  it("異常系: id 欠落（空文字）だとエラー", () => {
    expect(
      updateUserSchema.safeParse({ id: "", role: "admin" }).success,
    ).toBe(false);
  });
});

describe("createTeamSchema（チーム作成）", () => {
  it("正常系: 妥当なチーム名を受け付ける", () => {
    expect(createTeamSchema.parse({ name: "Alpha" }).name).toBe("Alpha");
  });
  it("異常系: 空白のみだとエラー", () => {
    expect(createTeamSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("questIdSchema（挑戦開始・自己申告）", () => {
  it("正常系: questId を正の整数へ変換する", () => {
    expect(questIdSchema.parse({ questId: "12" }).questId).toBe(12);
  });
  it("異常系: questId が 0 だとエラー", () => {
    expect(questIdSchema.safeParse({ questId: "0" }).success).toBe(false);
  });
});

describe("submitForApprovalSchema（成果物提出）", () => {
  it("正常系: 提出物をトリムして受け付ける", () => {
    const r = submitForApprovalSchema.parse({
      questId: "1",
      submission: "  https://example.com  ",
    });
    expect(r.submission).toBe("https://example.com");
  });
  it("異常系: 提出物が空だとエラー", () => {
    expect(
      submitForApprovalSchema.safeParse({ questId: "1", submission: "   " })
        .success,
    ).toBe(false);
  });
});

describe("takeTestSchema（テスト解答提出）", () => {
  it("正常系: クエスト ID を数値化する", () => {
    expect(takeTestSchema.parse({ questId: "3" }).questId).toBe(3);
  });
  it("異常系: クエスト ID が不正なら失敗する", () => {
    expect(takeTestSchema.safeParse({ questId: "0" }).success).toBe(false);
  });
});

describe("testAnswerValueSchema（設問ごとの提出値）", () => {
  it("正常系: 前後空白をトリムする", () => {
    expect(testAnswerValueSchema.parse("  10 ")).toBe("10");
  });
  it("境界値: 未指定は空文字になる", () => {
    expect(testAnswerValueSchema.parse(undefined)).toBe("");
  });
  it("異常系: 上限超過は失敗する", () => {
    expect(testAnswerValueSchema.safeParse("a".repeat(201)).success).toBe(false);
  });
});

describe("saveQuestionSchema（設問の保存）", () => {
  describe("single（選択式）", () => {
    it("正常系: 選択肢2つ以上＋正解1つで成功する", () => {
      const r = saveQuestionSchema.safeParse({
        questId: "1",
        prompt: "正しいものは？",
        kind: "single",
        choicesRaw: "*正解\n不正解",
      });
      expect(r.success).toBe(true);
    });
    it("異常系: 選択肢が1つだけだと失敗する", () => {
      const r = saveQuestionSchema.safeParse({
        questId: "1",
        prompt: "Q",
        kind: "single",
        choicesRaw: "*正解のみ",
      });
      expect(r.success).toBe(false);
    });
    it("異常系: 正解マーク（*）が無いと失敗する", () => {
      const r = saveQuestionSchema.safeParse({
        questId: "1",
        prompt: "Q",
        kind: "single",
        choicesRaw: "選択肢A\n選択肢B",
      });
      expect(r.success).toBe(false);
    });
    it("境界値: 選択肢が上限を超えると失敗する", () => {
      const lines = ["*正解", ...Array.from({ length: 10 }, (_, i) => `x${i}`)];
      const r = saveQuestionSchema.safeParse({
        questId: "1",
        prompt: "Q",
        kind: "single",
        choicesRaw: lines.join("\n"),
      });
      expect(r.success).toBe(false);
    });
  });

  describe("text（完全一致）", () => {
    it("正常系: 正解文字列があれば成功する", () => {
      const r = saveQuestionSchema.safeParse({
        questId: "1",
        prompt: "SQL のキーワードは？",
        kind: "text",
        correctText: "SELECT",
      });
      expect(r.success).toBe(true);
    });
    it("異常系: 正解文字列が空だと失敗する", () => {
      const r = saveQuestionSchema.safeParse({
        questId: "1",
        prompt: "Q",
        kind: "text",
        correctText: "   ",
      });
      expect(r.success).toBe(false);
    });
  });

  it("異常系: 設問文が空だと失敗する", () => {
    const r = saveQuestionSchema.safeParse({
      questId: "1",
      prompt: "",
      kind: "text",
      correctText: "x",
    });
    expect(r.success).toBe(false);
  });
});

describe("saveQuestSchema の passThreshold（合格基準）", () => {
  const base = {
    title: "T",
    rewardPoints: "100",
    verification: "test",
    isPublished: "on",
  };
  it("正常系: 数値文字列を 1..100 の整数として受け取る", () => {
    expect(saveQuestSchema.parse({ ...base, passThreshold: "60" }).passThreshold).toBe(60);
  });
  it("境界値: 空・未指定は 100（全問正解）に既定化する", () => {
    expect(saveQuestSchema.parse({ ...base, passThreshold: "" }).passThreshold).toBe(100);
    expect(saveQuestSchema.parse(base).passThreshold).toBe(100);
  });
  it("異常系: 0 や 101 は範囲外で失敗する", () => {
    expect(saveQuestSchema.safeParse({ ...base, passThreshold: "0" }).success).toBe(false);
    expect(saveQuestSchema.safeParse({ ...base, passThreshold: "101" }).success).toBe(false);
  });
});

describe("loginSchema（ログイン）", () => {
  it("正常系: メールを小文字化する", () => {
    const r = loginSchema.parse({ email: "ADMIN@x.com", password: "pw" });
    expect(r.email).toBe("admin@x.com");
  });
  it("異常系: パスワード欠落（空文字）だとエラー", () => {
    expect(
      loginSchema.safeParse({ email: "a@x.com", password: "" }).success,
    ).toBe(false);
  });
  it("異常系: メール形式不正だとエラー", () => {
    expect(loginSchema.safeParse({ email: "bad", password: "pw" }).success).toBe(
      false,
    );
  });
});

describe("changePasswordSchema（本人によるパスワード変更）", () => {
  const valid = {
    currentPassword: "oldpassword",
    newPassword: "newpassword1",
    confirmPassword: "newpassword1",
  };
  it("正常系: 妥当な入力をそのまま受け付ける", () => {
    const r = changePasswordSchema.parse(valid);
    expect(r.currentPassword).toBe("oldpassword");
    expect(r.newPassword).toBe("newpassword1");
  });
  it("境界値: 新パスワードが最小長ちょうどなら受け付ける", () => {
    const pw = "a".repeat(LIMITS.passwordMin);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpassword",
        newPassword: pw,
        confirmPassword: pw,
      }).success,
    ).toBe(true);
  });
  it("異常系: 新パスワードがポリシー（最小長）未満だと拒否", () => {
    const pw = "a".repeat(LIMITS.passwordMin - 1);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpassword",
        newPassword: pw,
        confirmPassword: pw,
      }).success,
    ).toBe(false);
  });
  it("異常系: 確認用パスワードが不一致だと拒否", () => {
    expect(
      changePasswordSchema.safeParse({
        ...valid,
        confirmPassword: "different1",
      }).success,
    ).toBe(false);
  });
  it("境界値: 現在のパスワードと同一（同一PWへの変更）だと拒否", () => {
    const same = "samepassword";
    const r = changePasswordSchema.safeParse({
      currentPassword: same,
      newPassword: same,
      confirmPassword: same,
    });
    expect(r.success).toBe(false);
  });
  it("異常系: 現在のパスワード未入力（空文字）だと拒否", () => {
    expect(
      changePasswordSchema.safeParse({ ...valid, currentPassword: "" }).success,
    ).toBe(false);
  });
  it("境界値: 新パスワードが72バイトちょうど（全角24文字）なら許可", () => {
    // "あ" は UTF-8 で3バイト。24文字 = 72バイト（bcrypt 上限ちょうど）。
    const pw = "あ".repeat(24);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpassword",
        newPassword: pw,
        confirmPassword: pw,
      }).success,
    ).toBe(true);
  });
  it("異常系: 新パスワードが72バイト超（全角25文字=75バイト）だと拒否", () => {
    // bcrypt が72バイトで切り捨てるため、バイト長で弾く（文字数ではなく）。
    const pw = "あ".repeat(25);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpassword",
        newPassword: pw,
        confirmPassword: pw,
      }).success,
    ).toBe(false);
  });
});

describe("adminResetPasswordSchema（管理者によるパスワードリセット）", () => {
  it("正常系: id を数値へ変換し、新パスワードを受け付ける", () => {
    const r = adminResetPasswordSchema.parse({
      id: "7",
      newPassword: "resetpassword1",
    });
    expect(r.id).toBe(7);
    expect(r.newPassword).toBe("resetpassword1");
  });
  it("境界値: 新パスワードが最小長ちょうどなら受け付ける", () => {
    expect(
      adminResetPasswordSchema.safeParse({
        id: "1",
        newPassword: "a".repeat(LIMITS.passwordMin),
      }).success,
    ).toBe(true);
  });
  it("異常系: 新パスワードが最小長未満だと拒否", () => {
    expect(
      adminResetPasswordSchema.safeParse({
        id: "1",
        newPassword: "a".repeat(LIMITS.passwordMin - 1),
      }).success,
    ).toBe(false);
  });
  it("異常系: id 欠落（空文字）だと拒否", () => {
    expect(
      adminResetPasswordSchema.safeParse({
        id: "",
        newPassword: "resetpassword1",
      }).success,
    ).toBe(false);
  });
  it("異常系: 新パスワードが72バイト超（全角25文字）だと拒否", () => {
    expect(
      adminResetPasswordSchema.safeParse({
        id: "1",
        newPassword: "あ".repeat(25),
      }).success,
    ).toBe(false);
  });
});

describe("列挙スキーマ", () => {
  it("verificationEnum は self/approval/test のみ許可", () => {
    expect(verificationEnum.safeParse("approval").success).toBe(true);
    expect(verificationEnum.safeParse("none").success).toBe(false);
  });
  it("roleEnum は engineer/admin のみ許可", () => {
    expect(roleEnum.safeParse("admin").success).toBe(true);
    expect(roleEnum.safeParse("root").success).toBe(false);
  });
});

describe("firstError", () => {
  it("最初のエラーメッセージを返す", () => {
    const r = createTeamSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(firstError(r.error)).toBe("チーム名は必須です");
    }
  });
});
