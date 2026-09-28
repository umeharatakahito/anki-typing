-- 出題範囲（チェックボックスで選ぶ）と、有料プラン（Stripe）

-- 1. 問題の範囲（テクノロジ、古代…）。problems.free は「範囲の先頭 3 割・無料の問題集」を表すように
--    import-caves.mjs --scopes が書き直す（sets.js の scopePick）
ALTER TABLE problems ADD COLUMN scope TEXT NOT NULL DEFAULT '';

-- 問題集ごとの範囲の一覧（並び順・無料か・レベルごとの問題数）。画面のチェックボックスはここだけ読む
CREATE TABLE problem_scopes (
  kbn   TEXT    NOT NULL,
  scope TEXT    NOT NULL,
  ord   INTEGER NOT NULL,
  free  INTEGER NOT NULL,
  level INTEGER NOT NULL,
  n     INTEGER NOT NULL,
  PRIMARY KEY (kbn, scope, level)
);

-- 2. 有料プラン。until（ミリ秒）までは会員として扱う
--    kind … month / year（自動更新）、pass30 / pass365（期間パス。PayPay・コンビニでも払える）
CREATE TABLE plans (
  email      TEXT PRIMARY KEY,
  until      INTEGER NOT NULL DEFAULT 0,
  kind       TEXT    NOT NULL DEFAULT '',
  customer   TEXT    NOT NULL DEFAULT '',
  sub        TEXT    NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX plans_customer ON plans (customer);

-- Stripe から同じ知らせが 2 度来ても、2 度数えない
CREATE TABLE pay_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
