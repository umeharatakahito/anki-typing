-- 会員（Google ログイン）と、勉強ダンジョンズから移した問題のための列。

-- 管理者が登録した会員。Google アカウントのメールアドレスで照合する
CREATE TABLE members (
  email    TEXT PRIMARY KEY,
  name     TEXT NOT NULL DEFAULT '',
  added_at INTEGER NOT NULL
);

-- ログイン中の端末。token は Cookie に入れる乱数
CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_email ON sessions (email);

-- ログインした人ごとの設定（画面の色など）
CREATE TABLE user_prefs (
  email TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT '',
  at    INTEGER NOT NULL
);

-- 問題の出どころ（hamachi = スプレッドシート、それ以外は洞窟の ID）と、
-- レベル（1〜10。0 はレベルなし）、会員でなくても出してよいか、正解後に見せる解説
ALTER TABLE problems ADD COLUMN src   TEXT    NOT NULL DEFAULT 'hamachi';
ALTER TABLE problems ADD COLUMN qid   TEXT    NOT NULL DEFAULT '';
ALTER TABLE problems ADD COLUMN level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE problems ADD COLUMN free  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE problems ADD COLUMN note  TEXT    NOT NULL DEFAULT '';
CREATE INDEX problems_kbn_level ON problems (kbn, level);

-- ランキングに、たどり着いたレベルを残す
ALTER TABLE scores ADD COLUMN level INTEGER NOT NULL DEFAULT 0;
