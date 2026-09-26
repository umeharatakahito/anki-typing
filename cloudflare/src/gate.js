// ===============================================================
// gate.js
// 会員でない人に出す範囲を絞る。問題は画面に送る前にここで落とすので、
// 画面を細工しても会員向けの問題は見えない。
//
//   タイピング（problems テーブル）… free = 1 の問題だけ（レベルのある問題集はレベル 1〜3）
//   大学受験モード … 英単語・古文は見出し語番号の、歴史はプリント番号の、若い方から 3 割
//   歴史の図表 … 並びの先頭から 3 割
// ===============================================================

import * as gas from './generated/gas.js';

export const FREE_MAX_LEVEL = 3;
const FREE_RATIO = 0.3;

// 科目ごとの「番号」の取り出し方と、全体の範囲
const SUBJECT = {
  eigo:    { meta: gas.getJukenMeta,   no: w => w.no },
  kobun:   { meta: gas.getKobunMeta,   no: w => w.no },
  rekishi: { meta: gas.getRekishiMeta, no: w => w.pr },
};

// 会員でない人が使える番号の上限
export function freeMaxNo(subject) {
  const m = SUBJECT[subject].meta();
  const span = m.maxNo - m.minNo + 1;
  return m.minNo + Math.max(1, Math.floor(span * FREE_RATIO)) - 1;
}

// 出題の範囲指定を、使える範囲の中に収める
export function clampOpts(subject, opts) {
  const max = freeMaxNo(subject);
  const o = Object.assign({}, opts || {});
  o.to = Math.min(Number(o.to) || max, max);
  o.from = Math.min(Number(o.from) || 0, o.to);
  return o;
}

// 返す語を、使える範囲のものだけにする（苦手な語・ゴーストの出題は範囲指定を通らないため）
export function filterWords(subject, res) {
  if (!res || !Array.isArray(res.words)) return res;
  const max = freeMaxNo(subject);
  const no = SUBJECT[subject].no;
  const words = res.words.filter(w => !(no(w) > max));
  return Object.assign({}, res, { words, matched: Math.min(res.matched || 0, words.length) });
}

// 画面が範囲の入力欄を作るのに使う値も、使える範囲に合わせる
export function clampMeta(subject, meta) {
  const max = freeMaxNo(subject);
  const m = Object.assign({}, meta, { maxNo: max, freeOnly: true });
  if (subject === 'rekishi') m.maxPr = max;
  return m;
}

// 歴史の図表は先頭から 3 割
export function freeZuIds() {
  const list = gas.getRekishiZuList();
  return list.slice(0, Math.max(1, Math.floor(list.length * FREE_RATIO))).map(z => z.id);
}
