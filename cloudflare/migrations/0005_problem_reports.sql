-- 遊んでいる人からの「この問題おかしいかも」の報告。管理画面で見て、直したら resolved にする
CREATE TABLE problem_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  email       TEXT NOT NULL DEFAULT '',   -- ログインしていれば
  name        TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL,              -- 'typing'（問題集）/ 'juken'（大学受験モード）
  kbn         TEXT NOT NULL DEFAULT '',   -- 問題集（大学受験モードは eigo / kobun / rekishi）
  qid         TEXT NOT NULL DEFAULT '',   -- 問題の ID（大学受験モードは語・番号）
  que         TEXT NOT NULL DEFAULT '',   -- 報告したときの問題文（控え）
  kan         TEXT NOT NULL DEFAULT '',   -- 報告したときの正解（控え）
  ans         TEXT NOT NULL DEFAULT '',   -- 報告したときの打つ文字（控え）
  reason      TEXT NOT NULL,
  comment     TEXT NOT NULL DEFAULT '',
  resolved_at INTEGER                      -- 対応済みにした日時
);
CREATE INDEX problem_reports_open ON problem_reports (resolved_at, created_at);
