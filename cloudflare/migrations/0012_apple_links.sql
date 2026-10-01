-- Apple でログインした人（Apple の sub）が、どのアカウント（メールアドレス）で使うか。
-- メールを非公開にした人は、初めてのときに「Google のアカウントとつなぐ」か「Apple だけで使う」を選ぶ
CREATE TABLE logins (
  provider   TEXT NOT NULL,
  sub        TEXT NOT NULL,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, sub)
);
-- 選んでもらうあいだの控え（Cookie には乱数だけ入れる）
CREATE TABLE link_pending (
  token      TEXT PRIMARY KEY,
  sub        TEXT NOT NULL,
  email      TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL
);
