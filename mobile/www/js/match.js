// ===============================================================
// match.js
// 打った文字が答えに合っているかを見る。
//
// 答え（ans）は ひらがな・英小文字・数字・ー・空白・. , で、ほかの読みは「|」でつなぐ（例：「くらうどai|くらうどえーあい」）。
// フリック入力では「か」を打ってから ゛ で「が」にするので、最後の 1 文字だけは
// 「同じ仲間（か・が）」なら合っているとみなし（途中）、次の文字を打った時点で違っていればミスにする。
// 空白・. , - は打たなくてよい（自動で進める）。
// ===============================================================

// ゛゜小 キーで回す順（iPhone のフリックと同じ）
const CYCLES = [
  'かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ',
  'ただ', 'ちぢ', 'つっづ', 'てで', 'とど', 'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ',
  'あぁ', 'いぃ', 'うぅゔ', 'えぇ', 'おぉ', 'やゃ', 'ゆゅ', 'よょ', 'わゎ',
];
const NEXT = {}, BASE = {};
CYCLES.forEach(c => {
  const a = [...c];
  a.forEach((ch, i) => { NEXT[ch] = a[(i + 1) % a.length]; BASE[ch] = a[0]; });
});
export const cycle = ch => NEXT[ch] || ch;
const base = ch => BASE[ch] || ch;

const SKIP = new Set([' ', '.', ',', '-']);
export const alts = ans => String(ans || '').split('|').filter(Boolean);

// t が答え a の途中まで合っているか。'exact' … 最後の文字もそのまま合う、'near' … 最後の文字が同じ仲間、'' … 違う
export function prefixState(t, a) {
  if (t.length > a.length) return '';
  for (let i = 0; i < t.length - 1; i++) if (t[i] !== a[i]) return '';
  if (!t.length) return 'exact';
  const i = t.length - 1;
  if (t[i] === a[i]) return 'exact';
  return base(t[i]) === base(a[i]) ? 'near' : '';
}

// 今の入力 t に 1 文字足した結果。{ ok, t, done, miss }
export function tryAppend(t, ch, answers) {
  const next = t + ch;
  const hit = answers.map(a => [a, prefixState(next, a)]).filter(([, s]) => s);
  if (!hit.length) return { ok: false, t, miss: true };
  return settle(next, answers);
}

// ゛゜小：最後の文字を次の形に変える。
// 最後の文字がもう答えと合っている（「か」が正解なのに ゛ を押した）ときは、変えずにミス。
// 正解へ向かう途中（つ → っ → づ の「っ」など）は変えてよい
export function tryCycle(t, answers) {
  if (!t) return { ok: false, t };
  const last = t[t.length - 1];
  const nx = cycle(last);
  if (nx === last) return { ok: false, t, miss: true };
  if (answers.some(a => prefixState(t, a) === 'exact')) return { ok: false, t, miss: true };
  return settle(t.slice(0, -1) + nx, answers, true);
}

// 最後まで合えば done。合っていれば、打たなくてよい文字（空白など）を足して進める
function settle(t, answers, soft) {
  const exact = answers.filter(a => prefixState(t, a) === 'exact');
  if (exact.some(a => a === t)) return { ok: true, t, done: true };
  for (const a of exact) {
    let u = t;
    while (u.length < a.length && SKIP.has(a[u.length])) u += a[u.length];
    if (u !== t) return u === a ? { ok: true, t: u, done: true } : { ok: true, t: u };
  }
  return { ok: true, t, soft };
}

// 次に打つ文字（ヒント用）。合っている答えのうち最初のものから
export function nextChars(t, answers, n) {
  const a = answers.find(x => prefixState(t, x)) || answers[0] || '';
  let i = t.length;
  if (t.length && prefixState(t, a) === 'near') i = t.length - 1;
  return a.slice(i, i + (n || 1));
}
// 今の入力に合っている答えすべての、次に打つ字（ローマ字で打つとき、ほかの読みでも打てるように。重なりは 1 つに）
export function nextAll(t, answers, n) {
  const out = [];
  for (const a of answers) {
    const s = prefixState(t, a);
    if (!s) continue;
    const i = t.length && s === 'near' ? t.length - 1 : t.length;
    const x = a.slice(i, i + (n || 1));
    if (x && !out.includes(x)) out.push(x);
  }
  return out;
}

// 答えのうち、今の入力にいちばん合うもの（表示用）
export const bestAnswer = (t, answers) => answers.find(a => prefixState(t, a)) || answers[0] || '';

// 英字の答えか（英字キーボードから始める）
export const isLatin = answers => /[a-z]/.test(answers[0] || '') && !/[ぁ-ゖー]/.test(answers[0] || '');
