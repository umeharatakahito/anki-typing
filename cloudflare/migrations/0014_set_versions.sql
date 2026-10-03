-- 問題集ごとの「版」。アプリはこれを見て、変わった問題集だけダウンロードする（アプリを作り直さなくても問題が届く。src/appdata.js）
--
-- problems・problem_scopes の行が変わる（足す・直す・消す）たびに、トリガーがその問題集の v を 1 つ上げる。
-- どのスクリプト（import-*.mjs・add-questions.mjs など）で書き換えても、ここを直さなくてよい。
-- アプリが読む /app/manifest は、この表（問題集の数だけの行）と problem_stats だけを読み、しかも数分は Cache API に持つので、
-- D1 の読み込みはほとんど増えない。書き込みは、問題の行 1 つにつき 1 行ぶん増える。
CREATE TABLE IF NOT EXISTS set_versions (
  kbn TEXT PRIMARY KEY,
  v   INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO set_versions (kbn, v) SELECT DISTINCT kbn, 1 FROM problems;

CREATE TRIGGER IF NOT EXISTS problems_ver_ins AFTER INSERT ON problems BEGIN
  INSERT INTO set_versions (kbn, v) VALUES (NEW.kbn, 1) ON CONFLICT (kbn) DO UPDATE SET v = v + 1;
END;
CREATE TRIGGER IF NOT EXISTS problems_ver_del AFTER DELETE ON problems BEGIN
  INSERT INTO set_versions (kbn, v) VALUES (OLD.kbn, 1) ON CONFLICT (kbn) DO UPDATE SET v = v + 1;
END;
-- 遊ぶ人に見えるところ（問題・答え・図・解説・範囲・無料か・レベル）が変わったときだけ（rnd などの入れ替えでは上げない）
CREATE TRIGGER IF NOT EXISTS problems_ver_upd AFTER UPDATE OF kbn, que, kan, ans, img, note, scope, free, level ON problems BEGIN
  INSERT INTO set_versions (kbn, v) VALUES (NEW.kbn, 1) ON CONFLICT (kbn) DO UPDATE SET v = v + 1;
  INSERT INTO set_versions (kbn, v) SELECT OLD.kbn, 1 WHERE OLD.kbn <> NEW.kbn ON CONFLICT (kbn) DO UPDATE SET v = v + 1;
END;
CREATE TRIGGER IF NOT EXISTS scopes_ver_ins AFTER INSERT ON problem_scopes BEGIN
  INSERT INTO set_versions (kbn, v) VALUES (NEW.kbn, 1) ON CONFLICT (kbn) DO UPDATE SET v = v + 1;
END;
CREATE TRIGGER IF NOT EXISTS scopes_ver_del AFTER DELETE ON problem_scopes BEGIN
  INSERT INTO set_versions (kbn, v) VALUES (OLD.kbn, 1) ON CONFLICT (kbn) DO UPDATE SET v = v + 1;
END;
CREATE TRIGGER IF NOT EXISTS scopes_ver_upd AFTER UPDATE ON problem_scopes BEGIN
  INSERT INTO set_versions (kbn, v) VALUES (NEW.kbn, 1) ON CONFLICT (kbn) DO UPDATE SET v = v + 1;
END;
