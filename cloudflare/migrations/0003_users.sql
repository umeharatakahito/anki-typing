-- ログインしたことのある人と、そのニックネーム。
-- nickname_set = 0 のあいだは Google の名前を仮に使い、次に開いたときにニックネームを決めてもらう
CREATE TABLE users (
  email        TEXT PRIMARY KEY,
  google_name  TEXT NOT NULL DEFAULT '',
  nickname     TEXT NOT NULL DEFAULT '',
  nickname_set INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_login   INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_nickname ON users (nickname) WHERE nickname_set = 1;

-- 大学受験モード（英単語・古文・歴史・対戦）を使える会員。管理者は常に使える
ALTER TABLE members ADD COLUMN juken INTEGER NOT NULL DEFAULT 0;

-- ログインして保存したスコアは、誰のものか分かるようにする（ユーザーランキング用）
ALTER TABLE scores ADD COLUMN email TEXT NOT NULL DEFAULT '';
CREATE INDEX scores_user ON scores (email, kubun, mode, score);
