-- 問題を読むとき、表を全部読まずに済むようにする（D1 の無料枠は読んだ行数で数える）
--
-- 1. ランダムに引く：ORDER BY random() は、条件に合う行を全部読んでから並べ替える。
--    問題ごとに乱数（rnd）を持たせて (kbn, level, rnd) に索引を張り、でたらめな位置から続けて読む（sets.js の pickRandom）
ALTER TABLE problems ADD COLUMN rnd REAL NOT NULL DEFAULT 0;
UPDATE problems SET rnd = (abs(random()) % 1000000000) / 1000000000.0;
CREATE INDEX problems_pick ON problems (kbn, level, rnd);
-- (kbn) と (kbn, level) は problems_pick の頭と同じなので要らない（索引が多いほど書き込みの行数も増える）
DROP INDEX IF EXISTS problems_kbn;
DROP INDEX IF EXISTS problems_kbn_level;

-- 2. 問題集・レベルごとの問題数。トップ・分類ページの「○問」と、レベルの一覧はここだけ読む。
--    問題を入れ直すスクリプト（import-*.mjs）が最後に作り直す
CREATE TABLE problem_stats (
  kbn    TEXT    NOT NULL,
  level  INTEGER NOT NULL,
  n      INTEGER NOT NULL,
  free_n INTEGER NOT NULL,
  PRIMARY KEY (kbn, level)
);
INSERT INTO problem_stats SELECT kbn, level, COUNT(*), SUM(free) FROM problems GROUP BY kbn, level;

-- 3. 問題の報告の「続けて送りすぎ」チェック（最近の報告だけ見る）が、表を全部読まないように
CREATE INDEX IF NOT EXISTS problem_reports_recent ON problem_reports (created_at);
