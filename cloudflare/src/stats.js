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
const toCard = r => ({
  que: r.que || '',
  kan: r.kan || '',
  ans: r.ans || '',
  // 画像は public/img/ に置いたコピー。無いものは worker.js がドライブへ回す
  img: r.img ? '/img/' + encodeURIComponent(r.img) + '.png' : '',
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
export async function saveScore(env, payload) {
  const p = payload || {};
  await env.DB.prepare(
    `INSERT INTO scores (timestamp, username, score, mode, kubun, chain, great, good, okay, miss, misstype, time, level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    Date.now(), p.username == null ? '' : String(p.username), num(p.score),
    p.gameMode == null ? '' : String(p.gameMode), p.kubun == null ? '' : String(p.kubun),
    num(p.chain), num(p.great), num(p.good), num(p.okay), num(p.miss), num(p.misstype), num(p.time),
    num(p.level)
  ).run();
  return { ok: true };
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
