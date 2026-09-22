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
    const subject = (p.subject === 'kobun') ? 'kobun' : 'eigo';
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
    subject = (subject === 'kobun') ? 'kobun' : 'eigo';
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
