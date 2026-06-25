-- 既存データに同一 user×quest の completed/approved 記録が複数あると（旧実装の
-- 同時クリア／二重承認の競合で生じ得る）、下の部分ユニークインデックス作成が失敗して
-- マイグレーションが止まる。インデックス作成前に、各 (user_id, quest_id) について
-- 完了済み記録を最古の 1 件（最小 id）だけ残して重複を削除する（前処理 / プリフライト）。
DELETE FROM `quest_attempts`
WHERE status in ('completed', 'approved')
  AND id NOT IN (
    SELECT MIN(id) FROM `quest_attempts`
    WHERE status in ('completed', 'approved')
    GROUP BY user_id, quest_id
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_attempts_unique_completion` ON `quest_attempts` (`user_id`,`quest_id`) WHERE status in ('completed', 'approved');
--> statement-breakpoint
-- 旧実装は completed/approved を書き込んでから報酬を確定していたため、確定前に失敗・未到達で
-- 報酬（スキル・ポイント・単価）が反映されていない完了記録が残り得る。本修正以降はアクションが
-- 完了済みを見て早期 return するため、ここで既存の完了記録に対して報酬を一括バックフィルする。
-- 各文は冪等（再適用しても結果が変わらない）。
-- (1) 完了済みクエストで習得するスキルを付与（重複は無視）。
INSERT OR IGNORE INTO `user_skills` (user_id, skill_id)
SELECT DISTINCT qa.user_id, qs.skill_id
FROM `quest_attempts` qa
JOIN `quest_skills` qs ON qs.quest_id = qa.quest_id
WHERE qa.status in ('completed', 'approved');
--> statement-breakpoint
-- (2) total_points を完了済みクエストの reward_points 合計から再計算（導出値）。
UPDATE `users` SET total_points = COALESCE((
  SELECT SUM(q.reward_points)
  FROM (
    SELECT DISTINCT quest_id
    FROM `quest_attempts`
    WHERE user_id = `users`.id AND status in ('completed', 'approved')
  ) c
  JOIN `quests` q ON q.id = c.quest_id
), 0);
--> statement-breakpoint
-- (3) current_estimated_rate を「必要スキルを全て習得した単価帯の最大 estimated_rate」から再計算。
--     条件スキルが未設定の単価帯は到達扱いにしない（EXISTS で必須スキルの存在を要求）。
UPDATE `users` SET current_estimated_rate = COALESCE((
  SELECT MAX(rt.estimated_rate)
  FROM `rate_tiers` rt
  WHERE EXISTS (SELECT 1 FROM `rate_tier_skills` rts WHERE rts.rate_tier_id = rt.id)
    AND NOT EXISTS (
      SELECT 1 FROM `rate_tier_skills` rts2
      WHERE rts2.rate_tier_id = rt.id
        AND rts2.skill_id NOT IN (
          SELECT skill_id FROM `user_skills` WHERE user_id = `users`.id
        )
    )
), 0);
