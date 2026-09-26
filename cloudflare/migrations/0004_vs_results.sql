-- タイピング対戦の結果。ログインしている人の分だけ、1 試合 1 人 1 行で残す（戦績ページ用）
CREATE TABLE vs_results (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  email     TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  kbn       TEXT NOT NULL,
  mode      TEXT NOT NULL,
  target    INTEGER NOT NULL,   -- 何本先取
  players   INTEGER NOT NULL,   -- 何人で対戦したか
  place     INTEGER NOT NULL,   -- 順位（取った本数の多い順。同じ本数は同じ順位）
  won       INTEGER NOT NULL,   -- 1 = 勝ち
  points    INTEGER NOT NULL,   -- 自分が取った本数
  opponents TEXT NOT NULL DEFAULT ''   -- 相手のニックネーム（、区切り）
);
CREATE INDEX vs_results_user ON vs_results (email, played_at);
