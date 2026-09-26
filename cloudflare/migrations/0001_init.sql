-- GAS 版でスプレッドシートの各シートに置いていたものを、そのままテーブルにしたもの。
-- 時刻はすべてミリ秒のエポック値。

-- problems シート（暗記タイピングの問題）
CREATE TABLE problems (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  kbn TEXT NOT NULL,
  que TEXT NOT NULL DEFAULT '',
  kan TEXT NOT NULL DEFAULT '',
  ans TEXT NOT NULL DEFAULT '',
  img TEXT NOT NULL DEFAULT ''   -- Google ドライブのファイル ID
);
CREATE INDEX problems_kbn ON problems (kbn);

-- Scores シート（暗記タイピングのランキング）
CREATE TABLE scores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  username  TEXT,
  score     REAL NOT NULL DEFAULT 0,
  mode      TEXT,
  kubun     TEXT,
  chain     REAL DEFAULT 0,
  great     REAL DEFAULT 0,
  good      REAL DEFAULT 0,
  okay      REAL DEFAULT 0,
  miss      REAL DEFAULT 0,
  misstype  REAL DEFAULT 0,
  time      REAL DEFAULT 0
);
CREATE INDEX scores_rank ON scores (mode, kubun, score);

-- JukenLog シート（大学受験モードの1ラウンドごとの記録）
CREATE TABLE juken_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  subject   TEXT NOT NULL,
  mode      TEXT NOT NULL DEFAULT 'quiz',
  score     REAL NOT NULL DEFAULT 0,
  questions INTEGER NOT NULL DEFAULT 0,
  correct   INTEGER NOT NULL DEFAULT 0,
  miss      INTEGER NOT NULL DEFAULT 0,
  combo     INTEGER NOT NULL DEFAULT 0,
  seconds   REAL NOT NULL DEFAULT 0,
  from_no   INTEGER,
  to_no     INTEGER
);
CREATE INDEX juken_log_subject ON juken_log (subject, timestamp);

-- JukenWeak シート（苦手な語）
CREATE TABLE juken_weak (
  subject TEXT NOT NULL,
  key     TEXT NOT NULL,
  no      INTEGER NOT NULL DEFAULT 0,
  ja      TEXT NOT NULL DEFAULT '',
  miss    INTEGER NOT NULL DEFAULT 0,
  ok      INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (subject, key)
);

-- JukenPrefs シート（画面の設定）
CREATE TABLE juken_prefs (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  at    INTEGER NOT NULL
);

-- JukenGhost シート（設定ごとのいちばん良かった回）
CREATE TABLE juken_ghost (
  sig     TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  score   REAL NOT NULL DEFAULT 0,
  seconds REAL NOT NULL DEFAULT 0,
  at      INTEGER NOT NULL,
  keys    TEXT NOT NULL DEFAULT '[]',
  times   TEXT NOT NULL DEFAULT '[]'
);
