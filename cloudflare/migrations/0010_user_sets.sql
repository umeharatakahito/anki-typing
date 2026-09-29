-- 会員のマイメニュー：問題集ごとの「お気に入り」と「選んだ出題範囲」（どのブラウザでも同じにする）
--   cat    … お気に入りに入れた大分類（トップのマイメニューから ?p=<cat>&k=<kbn> で開く）
--   fav    … 1 ならお気に入り（fav_at の順に並べる）
--   scopes … 選んだ出題範囲（JSON の配列。空なら全部）
CREATE TABLE user_sets (
  email  TEXT    NOT NULL,
  kbn    TEXT    NOT NULL,
  cat    TEXT    NOT NULL DEFAULT '',
  fav    INTEGER NOT NULL DEFAULT 0,
  fav_at INTEGER NOT NULL DEFAULT 0,
  scopes TEXT    NOT NULL DEFAULT '',
  at     INTEGER NOT NULL,
  PRIMARY KEY (email, kbn)
);
