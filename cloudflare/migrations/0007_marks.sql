-- 問題ごとの「マーク」と、まちがえた回数・連続正解（ログインしている人ごと）。
--   kind … 'typing'（問題集。key = 'p:<problems.id>'）/ 'juken'（市高。key = 英単語・古語・歴史の答え、kbn = eigo / kobun / rekishi）
--   mark … 0 なし / 1 マーク中（出やすくなる）/ 2 覚えた（マーク中に 5 回続けて正解したら）
--   写経モードと対戦の結果は数えない
CREATE TABLE marks (
  email      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  key        TEXT NOT NULL,
  kbn        TEXT NOT NULL DEFAULT '',
  pid        INTEGER,                  -- typing のときの problems.id
  mark       INTEGER NOT NULL DEFAULT 0,
  streak     INTEGER NOT NULL DEFAULT 0,
  misses     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (email, kind, key)
);
CREATE INDEX marks_marked ON marks (email, kind, mark, kbn);
