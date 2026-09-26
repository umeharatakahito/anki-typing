// ===============================================================
// stats.js
// GAS 版でスプレッドシートを読み書きしていた関数（コード.gs / JukenStats.gs）を
// D1 に置き換えたもの。関数名・引数・戻り値は GAS 版に合わせてあるので、
// 画面側の JS はそのまま呼べる。
// ===============================================================

import {
  getJukenWords, getKobunWords, getRekishiWords,
  jukenSubject_, wordsByKeys_, withWeak
} from './generated/gas.js';
import { FREE_MAX_LEVEL } from './gate.js';
import { CAT_BY_KBN } from './sets.js';

// 正解が続いた語は苦手リストから外す。ミスより this だけ多く正解したら卒業。
const WEAK_CLEAR_MARGIN = 2;

// GAS のスクリプトのタイムゾーン（Asia/Tokyo）での日時表記
const TZ = 'Asia/Tokyo';
function fmtDate(ms, withYear) {
  const p = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  const pad = s => String(s).padStart(2, '0');
  return withYear
    ? `${p.year}/${pad(p.month)}/${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
    : `${Number(p.month)}/${Number(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

const num = v => Number(v) || 0;

// ---------------------------------------------------------------
// 暗記タイピング: 問題取得（kbn 一致をシャッフルして最大 100 問）
// 会員でない人には free = 1 の問題だけ出す
const imgUrl = img => !img ? '' : img.startsWith('fig/') ? '/' + img : '/img/' + encodeURIComponent(img) + '.png';

export const toCardImg = imgUrl;
const toCard = r => ({
  que: r.que || '',
  kan: r.kan || '',
  ans: r.ans || '',
  // 図は public/fig/、スプレッドシートの画像は public/img/ のコピー（無いものは worker.js がドライブへ回す）
  img: imgUrl(r.img),
  note: r.note || '',
  level: r.level || 0
});

export async function getQuestions(env, category) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT que, kan, ans, img, note, level FROM problems WHERE kbn = ? AND (free = 1 OR ?) ORDER BY random() LIMIT 100'
    ).bind(String(category), env.viewer.member ? 1 : 0).all();
    return results.map(toCard);
  } catch (e) {
    return { error: e.message };
  }
}

// レベルのある問題集: どのレベルがあって、この人はどこまで行けるか
export async function getLevelInfo(env, category) {
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT level FROM problems WHERE kbn = ? AND level > 0 ORDER BY level'
  ).bind(String(category)).all();
  const levels = results.map(r => r.level);
  return {
    levels,
    maxLevel: env.viewer.member ? (levels[levels.length - 1] || 0) : FREE_MAX_LEVEL,
    member: env.viewer.member
  };
}

// レベルのある問題集: 1 つのレベルからシャッフルして最大 40 問
export async function getLevelQuestions(env, category, level) {
  level = Number(level) || 1;
  if (!env.viewer.member && level > FREE_MAX_LEVEL) return { error: 'members_only', maxLevel: FREE_MAX_LEVEL };
  const { results } = await env.DB.prepare(
    'SELECT que, kan, ans, img, note, level FROM problems WHERE kbn = ? AND level = ? ORDER BY random() LIMIT 40'
  ).bind(String(category), level).all();
  return results.map(toCard);
}

// ---------------------------------------------------------------
// 暗記タイピング: スコア保存とランキング
// ログインしている人はニックネームで保存し、ユーザーランキングに載せる
export async function saveScore(env, payload) {
  const p = payload || {};
  const v = env.viewer;
  await env.DB.prepare(
    `INSERT INTO scores (timestamp, username, score, mode, kubun, chain, great, good, okay, miss, misstype, time, level, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    Date.now(), v.email ? v.name : (p.username == null ? '' : String(p.username)), num(p.score),
    p.gameMode == null ? '' : String(p.gameMode), p.kubun == null ? '' : String(p.kubun),
    num(p.chain), num(p.great), num(p.good), num(p.okay), num(p.miss), num(p.misstype), num(p.time),
    num(p.level), v.email || ''
  ).run();
  return { ok: true };
}

// ユーザーランキング: ログインして保存した記録の、人ごとのいちばん良い回。
// kubun を 'all' にすると、問題集ごとのベストを足した合計で並べる。mode は 'all' で全モード
export async function getUserRanking(env, kubun, mode, limit) {
  limit = Math.min(Number(limit) || 100, 200);
  const where = ["s.email <> ''"], args = [];
  if (mode && mode !== 'all') { where.push('s.mode = ?'); args.push(String(mode)); }
  if (kubun && kubun !== 'all') {
    where.push('s.kubun = ?'); args.push(String(kubun));
    const { results } = await env.DB.prepare(
      `SELECT u.nickname, b.score, b.level, b.mode, b.timestamp, b.email = ? AS me FROM (
         SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.email ORDER BY s.score DESC, s.id) AS rn
           FROM scores s WHERE ${where.join(' AND ')}
       ) b JOIN users u ON u.email = b.email
       WHERE b.rn = 1 ORDER BY b.score DESC LIMIT ?`
    ).bind(env.viewer.email || '', ...args, limit).all();
    return results.map((r, i) => ({ rank: i + 1, nickname: r.nickname, score: num(r.score), level: num(r.level),
      mode: r.mode, dateStr: fmtDate(r.timestamp, true), me: !!r.me }));
  }
  const { results } = await env.DB.prepare(
    `SELECT u.nickname, SUM(b.best) AS score, COUNT(*) AS sets, MAX(b.at) AS timestamp, b.email = ? AS me FROM (
       SELECT s.email, s.kubun, s.mode, MAX(s.score) AS best, MAX(s.timestamp) AS at
         FROM scores s WHERE ${where.join(' AND ')} GROUP BY s.email, s.kubun, s.mode
     ) b JOIN users u ON u.email = b.email
     GROUP BY b.email ORDER BY score DESC LIMIT ?`
  ).bind(env.viewer.email || '', ...args, limit).all();
  return results.map((r, i) => ({ rank: i + 1, nickname: r.nickname, score: num(r.score), sets: num(r.sets),
    dateStr: fmtDate(r.timestamp, true), me: !!r.me }));
}

export async function getRanking(env, mode, kubun, limit) {
  try {
    limit = Number(limit) || 50;
    const where = [], args = [];
    if (mode && mode !== 'all') { where.push('mode = ?'); args.push(String(mode)); }
    if (kubun && kubun !== 'all') { where.push('kubun = ?'); args.push(String(kubun)); }
    const { results } = await env.DB.prepare(
      'SELECT * FROM scores' + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY score DESC, id ASC LIMIT ?'
    ).bind(...args, limit).all();
    return results.map((r, i) => ({
      rank: i + 1,
      timestamp: new Date(r.timestamp).toISOString(),
      username: r.username,
      score: num(r.score),
      mode: r.mode,
      kubun: String(r.kubun ?? ''),
      chain: num(r.chain), great: num(r.great), good: num(r.good), okay: num(r.okay),
      miss: num(r.miss), misstype: num(r.misstype), time: num(r.time), level: num(r.level),
      dateStr: fmtDate(r.timestamp, true)
    }));
  } catch (e) {
    // 失敗しても配列で返す（フロントのテーブルにエラー内容を表示させる）
    return [{
      rank: 0, username: 'ERROR', score: 0, mode: '', kubun: '',
      chain: 0, great: 0, good: 0, okay: 0, miss: 0, misstype: 0, time: 0,
      dateStr: String(e)
    }];
  }
}

// ---------------------------------------------------------------
// 大学受験モード: 1ラウンド終わったときの保存
// payload: { subject, mode, score, questions, correct, miss, combo, seconds,
//            from, to, missed: [{key,no,ja}], cleared: [key, ...] }
export async function saveJukenResult(env, payload) {
  try {
    const p = payload || {};
    const subject = jukenSubject_(p.subject);
    const now = Date.now();
    const db = env.DB;

    const stmts = [
      db.prepare(
        `INSERT INTO juken_log (timestamp, subject, mode, score, questions, correct, miss, combo, seconds, from_no, to_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(now, subject, String(p.mode || 'quiz'), num(p.score), num(p.questions), num(p.correct),
             num(p.miss), num(p.combo), num(p.seconds), num(p.from) || null, num(p.to) || null)
    ];

    // ミスした語は追加・加点
    (p.missed || []).forEach(w => {
      const key = String(w && w.key || '');
      if (!key) return;
      stmts.push(db.prepare(
        `INSERT INTO juken_weak (subject, key, no, ja, miss, ok, last_at) VALUES (?, ?, ?, ?, 1, 0, ?)
         ON CONFLICT (subject, key) DO UPDATE SET miss = miss + 1, last_at = excluded.last_at`
      ).bind(subject, key, num(w.no), String(w.ja || ''), now));
    });

    // きれいに解けた語は、苦手リストにあるときだけ正解を数える
    (p.cleared || []).forEach(key => {
      stmts.push(db.prepare(
        'UPDATE juken_weak SET ok = ok + 1, last_at = ? WHERE subject = ? AND key = ?'
      ).bind(now, subject, String(key)));
    });

    // 十分に正解が続いたら卒業
    stmts.push(db.prepare(
      'DELETE FROM juken_weak WHERE subject = ? AND ok >= miss + ?'
    ).bind(subject, WEAK_CLEAR_MARGIN));

    await db.batch(stmts);   // batch はひとつのトランザクションで走る
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------------------------------------------------------------
// 記録画面（ベスト・最近の記録・苦手な語）
export async function getJukenStats(env, subject) {
  try {
    subject = jukenSubject_(subject);
    const [log, weak] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM juken_log WHERE subject = ?').bind(subject),
      env.DB.prepare(
        'SELECT key, no, ja, miss, ok FROM juken_weak WHERE subject = ? AND miss > ok ORDER BY (miss - ok) DESC'
      ).bind(subject)
    ]);

    const logRows = log.results.map(r => ({
      at: fmtDate(r.timestamp, false), stamp: r.timestamp,
      mode: String(r.mode || 'quiz'),
      score: num(r.score), questions: num(r.questions), correct: num(r.correct),
      miss: num(r.miss), combo: num(r.combo), seconds: num(r.seconds)
    }));
    const best = logRows.slice().sort((a, b) => b.score - a.score).slice(0, 5);
    const recent = logRows.slice().sort((a, b) => b.stamp - a.stamp).slice(0, 10);

    const weakRows = weak.results.map(r => ({
      key: String(r.key), no: num(r.no), ja: String(r.ja || ''), miss: num(r.miss), ok: num(r.ok)
    }));

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

// 苦手な語のキーと「ミス − 正解」。出題を苦手な語だけに絞るときに使う。
export async function weakKeys(env, subject) {
  const { results } = await env.DB.prepare(
    'SELECT key, miss - ok AS d FROM juken_weak WHERE subject = ? AND miss > ok'
  ).bind(subject).all();
  const out = {};
  results.forEach(r => { out[r.key] = r.d; });
  return { [subject]: out };
}

// ---------------------------------------------------------------
// 画面の設定の記憶（端末をまたいで同じ設定を使う）
export async function getJukenPrefs(env, key) {
  try {
    const row = await env.DB.prepare('SELECT value FROM juken_prefs WHERE key = ?')
      .bind(String(key)).first();
    return row ? String(row.value) : '';
  } catch (e) {
    return '';
  }
}

export async function saveJukenPrefs(env, key, value) {
  try {
    await env.DB.prepare(
      `INSERT INTO juken_prefs (key, value, at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, at = excluded.at`
    ).bind(String(key), String(value), Date.now()).run();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------------------------------------------------------------
// ゴースト（自分の過去の走り）。設定ごとに一番よかった回を1件だけ持つ。
async function readGhost(env, sig) {
  const hit = await env.DB.prepare('SELECT * FROM juken_ghost WHERE sig = ?').bind(String(sig)).first();
  if (!hit) return null;
  try {
    return {
      score: num(hit.score),
      seconds: num(hit.seconds),
      at: fmtDate(hit.at, false),
      keys: JSON.parse(hit.keys || '[]'),
      times: JSON.parse(hit.times || '[]')
    };
  } catch (e) {
    return null;
  }
}

export async function saveJukenGhost(env, payload) {
  try {
    const p = payload || {};
    const sig = String(p.sig || '');
    if (!sig) return { ok: false, error: 'no sig' };

    const score = num(p.score);
    const prev = await env.DB.prepare('SELECT score FROM juken_ghost WHERE sig = ?').bind(sig).first();
    // 前の記録より良いときだけ塗り替える
    if (prev && num(prev.score) >= score) return { ok: true, kept: true };

    await env.DB.prepare(
      `INSERT INTO juken_ghost (sig, subject, score, seconds, at, keys, times) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (sig) DO UPDATE SET subject = excluded.subject, score = excluded.score,
         seconds = excluded.seconds, at = excluded.at, keys = excluded.keys, times = excluded.times
       WHERE excluded.score > juken_ghost.score`
    ).bind(sig, jukenSubject_(p.subject), score, num(p.seconds), Date.now(),
           JSON.stringify(p.keys || []), JSON.stringify(p.times || [])).run();
    return prev ? { ok: true, updated: true } : { ok: true, created: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---------------------------------------------------------------
// 出題データ（苦手な語だけに絞るときは D1 から苦手リストを読んでから）
async function weakFor(env, opts, subject) {
  return (opts && opts.source === 'weak') ? weakKeys(env, subject) : {};
}

export async function wordsFor(env, subject, opts) {
  const weak = await weakFor(env, opts, subject);
  const fn = (subject === 'kobun') ? getKobunWords
           : (subject === 'rekishi') ? getRekishiWords
           : getJukenWords;
  return withWeak(weak, () => fn(opts));
}

// 1ラウンド分の出題。ゴーストを使うときは、その回と同じ問題を返す。
export async function getJukenRound(env, opts) {
  opts = opts || {};
  const subject = jukenSubject_(opts.subject);

  let ghost = null;
  if (opts.ghost && opts.sig) {
    try { ghost = await readGhost(env, opts.sig); } catch (e) { ghost = null; }
  }

  let res;
  if (ghost && ghost.keys && ghost.keys.length) {
    res = wordsByKeys_(subject, ghost.keys);
    if (!res.words.length) ghost = null;   // データが入れ替わっていたら普通に出す
  }
  if (!res || !res.words.length) {
    res = await wordsFor(env, subject, opts);
    ghost = null;
  }
  return { words: res.words, matched: res.matched, ghost: ghost };
}

// ---------------------------------------------------------------
// わたしの戦績（?p=me）。ログインしている人の、対戦と個人の記録をまとめる
export async function getMyStats(env) {
  const v = env.viewer;
  if (!v.email) return { loggedIn: false };
  const db = env.DB, e = v.email;
  const label = k => (CAT_BY_KBN[k] && CAT_BY_KBN[k].label) || k;

  const [vsAll, vsByPlayers, vsByMode, vsRows, solo, soloBest] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(won), 0) AS wins, COALESCE(SUM(points), 0) AS points FROM vs_results WHERE email = ?').bind(e),
    db.prepare('SELECT players, COUNT(*) AS n, SUM(won) AS wins FROM vs_results WHERE email = ? GROUP BY players ORDER BY players').bind(e),
    db.prepare('SELECT mode, COUNT(*) AS n, SUM(won) AS wins FROM vs_results WHERE email = ? GROUP BY mode').bind(e),
    db.prepare('SELECT played_at, kbn, mode, target, players, place, won, points, opponents FROM vs_results WHERE email = ? ORDER BY played_at DESC LIMIT 200').bind(e),
    db.prepare(`SELECT COUNT(*) AS plays, COALESCE(MAX(score), 0) AS best,
                       COALESCE(SUM(great + good + okay), 0) AS correct, COALESCE(MAX(level), 0) AS level
                  FROM scores WHERE email = ?`).bind(e),
    db.prepare(`SELECT kubun, mode, MAX(score) AS best, MAX(level) AS level, COUNT(*) AS plays, MAX(timestamp) AS last
                  FROM scores WHERE email = ? GROUP BY kubun, mode ORDER BY best DESC LIMIT 50`).bind(e),
  ]);

  // 連勝（今の連勝と、いちばん長い連勝）。vsRows は新しい順
  const wonList = vsRows.results.map(r => r.won);
  let current = 0;
  while (current < wonList.length && wonList[current]) current++;
  let best = 0, run = 0;
  for (const w of wonList.slice().reverse()) { run = w ? run + 1 : 0; best = Math.max(best, run); }

  const a = vsAll.results[0];
  return {
    loggedIn: true,
    name: v.name,
    vs: {
      matches: a.n, wins: a.wins, points: a.points,
      rate: a.n ? Math.round(a.wins / a.n * 100) : 0,
      streak: current, bestStreak: best,
      byPlayers: vsByPlayers.results.map(r => ({ players: r.players, n: r.n, wins: r.wins })),
      byMode: vsByMode.results.map(r => ({ mode: r.mode, n: r.n, wins: r.wins })),
      recent: vsRows.results.slice(0, 10).map(r => ({
        date: fmtDate(r.played_at, true), set: label(r.kbn), mode: r.mode, target: r.target,
        players: r.players, place: r.place, won: !!r.won, points: r.points, opponents: r.opponents
      }))
    },
    solo: {
      plays: solo.results[0].plays, best: num(solo.results[0].best),
      correct: solo.results[0].correct, level: solo.results[0].level,
      bests: soloBest.results.map(r => ({
        set: label(r.kubun), mode: r.mode, best: num(r.best), level: num(r.level), plays: r.plays, date: fmtDate(r.last, true)
      }))
    }
  };
}
