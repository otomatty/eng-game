-- 既存データに同一 user×quest の completed/approved 記録が複数あると（旧実装の
-- 同時クリア／二重承認の競合で生じ得る）、下の部分ユニークインデックス作成が失敗して
-- マイグレーションが止まる。インデックス作成前に、各 (user_id, quest_id) について
-- 完了済み記録を最古の 1 件（最小 id）だけ残して重複を削除する（前処理 / プリフライト）。
-- 注: 過去に二重加算された total_points の補正は本マイグレーションの対象外。
DELETE FROM `quest_attempts`
WHERE status in ('completed', 'approved')
  AND id NOT IN (
    SELECT MIN(id) FROM `quest_attempts`
    WHERE status in ('completed', 'approved')
    GROUP BY user_id, quest_id
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_attempts_unique_completion` ON `quest_attempts` (`user_id`,`quest_id`) WHERE status in ('completed', 'approved');