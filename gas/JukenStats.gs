// ===============================================================
// JukenStats.gs
// 大学受験モードの記録（履歴・ランキング）と、苦手な単語の蓄積。
//
// 利用者は1人なので、名前は持たない。科目（eigo / kobun）だけで分ける。
// Web アプリは「デプロイしたユーザーとして実行」なので、リンクを開いた人が
// Google にログインしていなくても、このスプレッドシートに書き込める。
// ===============================================================

const STATS_LOG_SHEET  = 'JukenLog';
const STATS_WEAK_SHEET = 'JukenWeak';

const STATS_LOG_HEADER = [
  'timestamp', 'subject', 'mode', 'score', 'questions', 'correct',
  'miss', 'combo', 'seconds', 'from', 'to'
];
const STATS_WEAK_HEADER = ['subject', 'key', 'no', 'ja', 'miss', 'ok', 'lastAt'];

// 正解が続いた語は苦手リストから外す。ミスより this だけ多く正解したら卒業。
const WEAK_CLEAR_MARGIN = 2;

function statsSheet_(name, header) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const range = sh.getRange(1, 1, 1, header.length);
  const cur = range.getValues()[0];
  if (!header.every((h, i) => cur[i] === h)) range.setValues([header]);
  return sh;
}

function statsRows_(sh, header) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, header.length).getValues();
}

// ---------------------------------------------------------------
// 1ラウンド終わったときの保存
// payload: { subject, mode, score, questions, correct, miss, combo, seconds,
//            from, to, missed: [{key,no,ja}], cleared: [key, ...] }
function saveJukenResult(payload) {
  // 苦手リストは読んで書き直すので、同時に走ると取りこぼす
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    const p = payload || {};
    const subject = jukenSubject_(p.subject);
    const now = new Date();

    const log = statsSheet_(STATS_LOG_SHEET, STATS_LOG_HEADER);
    log.appendRow([
      now, subject, p.mode || 'quiz',
      Number(p.score) || 0, Number(p.questions) || 0, Number(p.correct) || 0,
      Number(p.miss) || 0, Number(p.combo) || 0, Number(p.seconds) || 0,
      Number(p.from) || '', Number(p.to) || ''
    ]);

    updateWeak_(subject, p.missed || [], p.cleared || [], now);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    lock.releaseLock();
  }
}

// 苦手リストの更新。ミスした語は追加・加点、きれいに解けた語は減点し、
// 十分に正解が続いたら行ごと消す。
function updateWeak_(subject, missed, cleared, now) {
  const sh = statsSheet_(STATS_WEAK_SHEET, STATS_WEAK_HEADER);
  const rows = statsRows_(sh, STATS_WEAK_HEADER);

  const index = {};
  rows.forEach((r, i) => {
    if (String(r[0]) === subject) index[String(r[1])] = i;
  });

  missed.forEach(w => {
    const key = String(w && w.key || '');
    if (!key) return;
    const i = index[key];
    if (i === undefined) {
      rows.push([subject, key, Number(w.no) || 0, String(w.ja || ''), 1, 0, now]);
      index[key] = rows.length - 1;
    } else {
      rows[i][4] = (Number(rows[i][4]) || 0) + 1;
      rows[i][6] = now;
    }
  });

  (cleared || []).forEach(key => {
    const i = index[String(key)];
    if (i === undefined) return;   // 苦手でない語はわざわざ記録しない
    rows[i][5] = (Number(rows[i][5]) || 0) + 1;
    rows[i][6] = now;
  });

  const kept = rows.filter(r => {
    if (String(r[0]) !== subject) return true;
    return (Number(r[5]) || 0) < (Number(r[4]) || 0) + WEAK_CLEAR_MARGIN;
  });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, STATS_WEAK_HEADER.length).clearContent();
  if (kept.length) sh.getRange(2, 1, kept.length, STATS_WEAK_HEADER.length).setValues(kept);
}

// ---------------------------------------------------------------
// 記録画面（ベスト・最近の記録・苦手な語）
function getJukenStats(subject) {
  try {
    subject = jukenSubject_(subject);
    const tz = Session.getScriptTimeZone();
    const fmt = d => Utilities.formatDate(new Date(d), tz, 'M/d HH:mm');

    const logRows = statsRows_(statsSheet_(STATS_LOG_SHEET, STATS_LOG_HEADER), STATS_LOG_HEADER)
      .filter(r => String(r[1]) === subject)
      .map(r => ({
        at: fmt(r[0]), stamp: new Date(r[0]).getTime(),
        mode: String(r[2] || 'quiz'),
        score: Number(r[3]) || 0,
        questions: Number(r[4]) || 0,
        correct: Number(r[5]) || 0,
        miss: Number(r[6]) || 0,
        combo: Number(r[7]) || 0,
        seconds: Number(r[8]) || 0
      }));

    const best = logRows.slice().sort((a, b) => b.score - a.score).slice(0, 5);
    const recent = logRows.slice().sort((a, b) => b.stamp - a.stamp).slice(0, 10);

    const weakRows = statsRows_(statsSheet_(STATS_WEAK_SHEET, STATS_WEAK_HEADER), STATS_WEAK_HEADER)
      .filter(r => String(r[0]) === subject)
      .map(r => ({
        key: String(r[1]), no: Number(r[2]) || 0, ja: String(r[3] || ''),
        miss: Number(r[4]) || 0, ok: Number(r[5]) || 0
      }))
      .filter(w => w.miss > w.ok)
      .sort((a, b) => (b.miss - b.ok) - (a.miss - a.ok));

    return {
      ok: true,
      plays: logRows.length,
      best: best,
      recent: recent,
      weakCount: weakRows.length,
      weak: weakRows.slice(0, 20)
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// 科目名の正規化。知らない名前は英単語として扱う。
function jukenSubject_(name) {
  name = String(name || '');
  return (name === 'kobun' || name === 'rekishi') ? name : 'eigo';
}

// 苦手な語のキー一覧。出題を苦手な語だけに絞るときに使う。
function weakKeys_(subject) {
  const rows = statsRows_(statsSheet_(STATS_WEAK_SHEET, STATS_WEAK_HEADER), STATS_WEAK_HEADER);
  const out = {};
  rows.forEach(r => {
    if (String(r[0]) !== subject) return;
    if ((Number(r[4]) || 0) <= (Number(r[5]) || 0)) return;
    out[String(r[1])] = (Number(r[4]) || 0) - (Number(r[5]) || 0);
  });
  return out;
}

// ===============================================================
// 画面の設定の記憶
// 端末ごとではなくシートに持つ。GAS はページを毎回違うサブドメインの
// iframe で出すので localStorage が消えることがあるのと、
// iPad で決めた設定を PC でもそのまま使えるようにするため。
// ===============================================================

const PREFS_SHEET  = 'JukenPrefs';
const PREFS_HEADER = ['key', 'value', 'at'];

function getJukenPrefs(key) {
  try {
    const rows = statsRows_(statsSheet_(PREFS_SHEET, PREFS_HEADER), PREFS_HEADER);
    const hit = rows.filter(r => String(r[0]) === String(key))[0];
    return hit ? String(hit[1]) : '';
  } catch (e) {
    return '';
  }
}

function saveJukenPrefs(key, value) {
  try {
    const sh = statsSheet_(PREFS_SHEET, PREFS_HEADER);
    const rows = statsRows_(sh, PREFS_HEADER);
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(key)) {
        sh.getRange(i + 2, 2, 1, 2).setValues([[String(value), new Date()]]);
        return { ok: true };
      }
    }
    sh.appendRow([String(key), String(value), new Date()]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ===============================================================
// ゴースト（自分の過去の走り）
// 同じ設定で一番よかった回を覚えておき、次はその回と同じ問題・同じ順番で
// 出して競走する。設定ごとに1件だけ持つ。
// ===============================================================

const GHOST_SHEET  = 'JukenGhost';
const GHOST_HEADER = ['sig', 'subject', 'score', 'seconds', 'at', 'keys', 'times'];

function readGhost_(sig) {
  const rows = statsRows_(statsSheet_(GHOST_SHEET, GHOST_HEADER), GHOST_HEADER);
  const hit = rows.filter(r => String(r[0]) === String(sig))[0];
  if (!hit) return null;
  try {
    return {
      score: Number(hit[2]) || 0,
      seconds: Number(hit[3]) || 0,
      at: Utilities.formatDate(new Date(hit[4]), Session.getScriptTimeZone(), 'M/d HH:mm'),
      keys: JSON.parse(String(hit[5]) || '[]'),
      times: JSON.parse(String(hit[6]) || '[]')
    };
  } catch (e) {
    return null;
  }
}

function saveJukenGhost(payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    const p = payload || {};
    const sig = String(p.sig || '');
    if (!sig) return { ok: false, error: 'no sig' };

    const sh = statsSheet_(GHOST_SHEET, GHOST_HEADER);
    const rows = statsRows_(sh, GHOST_HEADER);
    const row = [
      sig, (p.subject === 'kobun') ? 'kobun' : 'eigo',
      Number(p.score) || 0, Number(p.seconds) || 0, new Date(),
      JSON.stringify(p.keys || []), JSON.stringify(p.times || [])
    ];

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) !== sig) continue;
      // 前の記録より良いときだけ塗り替える
      if ((Number(rows[i][2]) || 0) >= row[2]) return { ok: true, kept: true };
      sh.getRange(i + 2, 1, 1, GHOST_HEADER.length).setValues([row]);
      return { ok: true, updated: true };
    }
    sh.appendRow(row);
    return { ok: true, created: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    lock.releaseLock();
  }
}

// 見出し語そのものをキーにして、ゴーストと同じ問題を同じ順番で取り出す
function wordsByKeys_(subject, keys) {
  const list = (subject === 'kobun') ? KOBUN_WORDS
             : (subject === 'rekishi') ? REKISHI_WORDS
             : JUKEN_WORDS;
  const keyOf = w => (subject === 'kobun') ? w.ko : (subject === 'rekishi') ? w.a : w.en;
  const byKey = {};
  list.forEach(w => { byKey[keyOf(w)] = w; });
  let words = keys.map(k => byKey[k]).filter(w => !!w);
  if (subject === 'rekishi') words = words.map(decorate_);
  return { words: words, matched: words.length };
}

// ---------------------------------------------------------------
// 1ラウンド分の出題。ゴーストを使うときは、その回と同じ問題を返す。
function getJukenRound(opts) {
  opts = opts || {};
  const subject = jukenSubject_(opts.subject);

  let ghost = null;
  if (opts.ghost && opts.sig) {
    try { ghost = readGhost_(opts.sig); } catch (e) { ghost = null; }
  }

  let res;
  if (ghost && ghost.keys && ghost.keys.length) {
    res = wordsByKeys_(subject, ghost.keys);
    if (!res.words.length) { ghost = null; }   // データが入れ替わっていたら普通に出す
  }
  if (!res || !res.words.length) {
    res = (subject === 'kobun') ? getKobunWords(opts)
        : (subject === 'rekishi') ? getRekishiWords(opts)
        : getJukenWords(opts);
    if (ghost) ghost = null;
  }

  return { words: res.words, matched: res.matched, ghost: ghost };
}
