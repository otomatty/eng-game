-- 既存のテスト型クエスト（シード投入済み）へ設問・正解をバックフィルする
-- データ移行（Issue #7 / PR #16 レビュー対応）。
-- 0002 はスキーマのみ追加するため、再シードしない環境では既存テスト型
-- クエストが設問0件となり受験不能になる。これをタイトル一致で補填する。
-- quest_id/question_id は実DB依存のため SELECT で解決し、NOT EXISTS で冪等化。
INSERT INTO `quest_questions` (`quest_id`, `prompt`, `kind`, `correct_text`, `sort_order`)
SELECT q.`id`, '「文字列 または 数値」を表す TypeScript の型はどれ？', 'single', '', 1
FROM `quests` q
WHERE q.`title` = 'TypeScript 型クイズ' AND q.`verification` = 'test'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_questions` qq
    WHERE qq.`quest_id` = q.`id` AND qq.`prompt` = '「文字列 または 数値」を表す TypeScript の型はどれ？'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'string | number', 1, 1
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'TypeScript 型クイズ' AND qq.`prompt` = '「文字列 または 数値」を表す TypeScript の型はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'string | number'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'string & number', 0, 2
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'TypeScript 型クイズ' AND qq.`prompt` = '「文字列 または 数値」を表す TypeScript の型はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'string & number'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'string, number', 0, 3
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'TypeScript 型クイズ' AND qq.`prompt` = '「文字列 または 数値」を表す TypeScript の型はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'string, number'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'Array<string>', 0, 4
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'TypeScript 型クイズ' AND qq.`prompt` = '「文字列 または 数値」を表す TypeScript の型はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'Array<string>'
  );
--> statement-breakpoint
INSERT INTO `quest_questions` (`quest_id`, `prompt`, `kind`, `correct_text`, `sort_order`)
SELECT q.`id`, 'プロパティを再代入不可（読み取り専用）にするキーワードは？（英単語で入力）', 'text', 'readonly', 2
FROM `quests` q
WHERE q.`title` = 'TypeScript 型クイズ' AND q.`verification` = 'test'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_questions` qq
    WHERE qq.`quest_id` = q.`id` AND qq.`prompt` = 'プロパティを再代入不可（読み取り専用）にするキーワードは？（英単語で入力）'
  );
--> statement-breakpoint
INSERT INTO `quest_questions` (`quest_id`, `prompt`, `kind`, `correct_text`, `sort_order`)
SELECT q.`id`, '集計のために行をグループ化する SQL 句はどれ？', 'single', '', 3
FROM `quests` q
WHERE q.`title` = 'SQL で集計クエリ' AND q.`verification` = 'test'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_questions` qq
    WHERE qq.`quest_id` = q.`id` AND qq.`prompt` = '集計のために行をグループ化する SQL 句はどれ？'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'GROUP BY', 1, 1
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'SQL で集計クエリ' AND qq.`prompt` = '集計のために行をグループ化する SQL 句はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'GROUP BY'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'ORDER BY', 0, 2
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'SQL で集計クエリ' AND qq.`prompt` = '集計のために行をグループ化する SQL 句はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'ORDER BY'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'WHERE', 0, 3
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'SQL で集計クエリ' AND qq.`prompt` = '集計のために行をグループ化する SQL 句はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'WHERE'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'LIMIT', 0, 4
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'SQL で集計クエリ' AND qq.`prompt` = '集計のために行をグループ化する SQL 句はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'LIMIT'
  );
--> statement-breakpoint
INSERT INTO `quest_questions` (`quest_id`, `prompt`, `kind`, `correct_text`, `sort_order`)
SELECT q.`id`, '行数を数える集計関数は？（関数名のみ・英大文字小文字は不問）', 'text', 'COUNT', 4
FROM `quests` q
WHERE q.`title` = 'SQL で集計クエリ' AND q.`verification` = 'test'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_questions` qq
    WHERE qq.`quest_id` = q.`id` AND qq.`prompt` = '行数を数える集計関数は？（関数名のみ・英大文字小文字は不問）'
  );
--> statement-breakpoint
INSERT INTO `quest_questions` (`quest_id`, `prompt`, `kind`, `correct_text`, `sort_order`)
SELECT q.`id`, '需要に応じて計算資源を増減できる、クラウドの特性はどれ？', 'single', '', 5
FROM `quests` q
WHERE q.`title` = 'クラウド基礎を学ぶ' AND q.`verification` = 'test'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_questions` qq
    WHERE qq.`quest_id` = q.`id` AND qq.`prompt` = '需要に応じて計算資源を増減できる、クラウドの特性はどれ？'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'スケーラビリティ', 1, 1
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'クラウド基礎を学ぶ' AND qq.`prompt` = '需要に応じて計算資源を増減できる、クラウドの特性はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'スケーラビリティ'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'オンプレミス', 0, 2
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'クラウド基礎を学ぶ' AND qq.`prompt` = '需要に応じて計算資源を増減できる、クラウドの特性はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'オンプレミス'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'モノリス', 0, 3
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'クラウド基礎を学ぶ' AND qq.`prompt` = '需要に応じて計算資源を増減できる、クラウドの特性はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'モノリス'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'レガシー', 0, 4
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'クラウド基礎を学ぶ' AND qq.`prompt` = '需要に応じて計算資源を増減できる、クラウドの特性はどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'レガシー'
  );
--> statement-breakpoint
INSERT INTO `quest_questions` (`quest_id`, `prompt`, `kind`, `correct_text`, `sort_order`)
SELECT q.`id`, '使った分だけ料金が発生する課金モデルはどれ？', 'single', '', 6
FROM `quests` q
WHERE q.`title` = 'クラウド基礎を学ぶ' AND q.`verification` = 'test'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_questions` qq
    WHERE qq.`quest_id` = q.`id` AND qq.`prompt` = '使った分だけ料金が発生する課金モデルはどれ？'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, '従量課金', 1, 1
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'クラウド基礎を学ぶ' AND qq.`prompt` = '使った分だけ料金が発生する課金モデルはどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = '従量課金'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, '定額買い切り', 0, 2
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'クラウド基礎を学ぶ' AND qq.`prompt` = '使った分だけ料金が発生する課金モデルはどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = '定額買い切り'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, 'リース契約', 0, 3
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'クラウド基礎を学ぶ' AND qq.`prompt` = '使った分だけ料金が発生する課金モデルはどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = 'リース契約'
  );
--> statement-breakpoint
INSERT INTO `quest_question_choices` (`question_id`, `label`, `is_correct`, `sort_order`)
SELECT qq.`id`, '無償提供', 0, 4
FROM `quest_questions` qq
JOIN `quests` q ON q.`id` = qq.`quest_id`
WHERE q.`title` = 'クラウド基礎を学ぶ' AND qq.`prompt` = '使った分だけ料金が発生する課金モデルはどれ？'
  AND NOT EXISTS (
    SELECT 1 FROM `quest_question_choices` c
    WHERE c.`question_id` = qq.`id` AND c.`label` = '無償提供'
  );
