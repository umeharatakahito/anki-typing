// ===============================================================
// import-caves.mjs
// 勉強ダンジョンズ（EnglishSpelunker）の洞窟の問題と、このリポジトリで作った問題集
// （data/sets/）を、D1 に入れる SQL にする。
//
//   node scripts/import-caves.mjs ~/program/StudyQuest-wt/R/data/caves > caves.local.sql
//   npx wrangler d1 execute anki-typing --remote --file caves.local.sql
//
// D1 の無料枠は 1 日に書ける行数に上限がある（10 万行。全部を入れ直すと 1 回で 1 万行を超える）。
// ふだんは変わった分だけにする:
//   --only=koko-eigo,daigaku-chiri   … その問題集だけ入れ直す
//   --figures=data/figures-it.json   … そのファイルに載っている問題の図と解説だけ書き換える（UPDATE）
//   --overrides                      … data/overrides*.json に載っている問題の問題文・答え・読みだけ書き換える（UPDATE）
//   --scopes                         … 範囲（scope）と無料か（free）だけ書き換える（UPDATE）。sets.js の有料・範囲の決まりを変えたとき
//
// data/overrides*.json は、元の問題を直すための上書き。{ "<問題の id>": { prompt?, answer?, reading?, alts? } }
//   prompt / answer / reading … 差し替え（「日本海側の海」→ 問題文に「（　　）側の海」、答えは「日本海」など）
//   alts                      … ほかにも正解にする読み（「じゅうしち」と「じゅうなな」など）。ans に「|」でつなぐ
//
// 入れ直すたびに、問題集ごとの問題は丸ごと置き換える（スプレッドシートの問題はそのまま）。
//   que  … 問題文        kan … 表示する正解     ans … 打つ文字（ひらがな・英字）
//   level … 1〜10        free … 会員でなくても出す（範囲の先頭 3 割。無料の問題集は全部。sets.js）
//   scope … 範囲（問題の category。英単語はレベルで分ける。sets.js の SCOPE_ORDER の順に並べる）
//   note … 正解の後に見せる解説
//   img  … 図（data/figures.json にある問題だけ。fig/<ファイル名>）
// ===============================================================

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAVES, OWN_SETS, SCOPE_ORDER, LEVEL_BANDS, NO_SCOPE, isPaidSet, freeScopeCount } from '../src/sets.js';

const args = process.argv.slice(2);
const opt = name => (args.find(a => a.startsWith('--' + name + '=')) || '').split('=')[1] || '';
const root = args.find(a => !a.startsWith('--'));
const ONLY = opt('only') ? new Set(opt('only').split(',')) : null;
const FIG_ONLY = opt('figures') ? new Set(Object.keys(JSON.parse(readFileSync(opt('figures'), 'utf8')))) : null;
const OV_ONLY = args.includes('--overrides');
const SCOPES_ONLY = args.includes('--scopes');
if (!root) {
  console.error('usage: node scripts/import-caves.mjs <勉強ダンジョンズの data/caves>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const READINGS = JSON.parse(readFileSync(join(here, '..', 'data', 'readings.json'), 'utf8'));
// 問題に付ける図（public/fig/）。フリー画像は、答えた後の解説に作者とライセンスを出す
// （ファイル名には答えが入っていることがあるので、解く前には出さない）
// 図の一覧は data/figures.json と、手分けして作った data/figures-*.json をまとめて読む
const FIGURES = Object.assign({}, ...readdirSync(join(here, '..', 'data'))
  .filter(f => /^figures(-[\w-]+)?\.json$/.test(f)).sort()
  .map(f => JSON.parse(readFileSync(join(here, '..', 'data', f), 'utf8'))));
const OVERRIDES = Object.assign({}, ...readdirSync(join(here, '..', 'data'))
  .filter(f => /^overrides(-[\w-]+)?\.json$/.test(f)).sort()
  .map(f => JSON.parse(readFileSync(join(here, '..', 'data', f), 'utf8'))));
// 上書きを当てた問題を返す（元の q は変えない）
function applyOverride(q) {
  const o = OVERRIDES[q.id];
  if (!o) return q;
  const r = Object.assign({}, q);
  if (o.prompt) { r.prompt = o.prompt; r.definition = null; }
  if (o.answer) { r.answer = o.answer; r.answer_speech = null; }
  if (o.reading) r.reading = o.reading;
  return r;
}
// 打つ文字：読みにほかの読み（alts）を「|」でつなぐ
// extra … 問題そのものに書いてある別の読み（雑学の alts）
const withAlts = (id, ans, extra) => {
  const alts = ((OVERRIDES[id] || {}).alts || []).concat(extra || []).map(a => typeable(String(a)))
    .filter((a, i, all) => a && a !== ans && all.indexOf(a) === i);
  return [ans, ...alts].join('|');
};

const credit = f => f.kind === 'commons'
  ? `図：${f.author}／${f.license}（Wikimedia Commons）` : '';


const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hasKanji = s => /[㐀-鿿々〆]/.test(s);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// タイピングで打てるのは ひらがな・ー・英数字・スペース・- , . だけ
function typeable(s) {
  return s.toLowerCase()
    .replace(/[　・\s]+/g, ' ')
    .replace(/[^ぁ-ゖー a-z0-9\-,.]/g, '')
    .replace(/ +/g, ' ')
    .trim();
}

function reading(q, lang) {
  if (lang === 'en') return typeable(q.answer);
  if (READINGS[q.id]) return READINGS[q.id];
  if (!hasKanji(q.answer)) return typeable(toHira(q.answer));
  if (q.answer_speech) return typeable(toHira(q.answer_speech));
  throw new Error(q.id + ' の読みがありません（data/readings.json に足す）: ' + q.answer);
}

// 英語の洞窟は、正解の後に日本語訳と例文も見せる
function note(q, lang) {
  const parts = [];
  if (lang === 'en' && q.answer_ja) parts.push(q.answer_ja);
  if (q.explanation) parts.push(q.explanation);
  if (lang === 'en' && q.example) parts.push(q.example + (q.example_ja ? '（' + q.example_ja + '）' : ''));
  return parts.join('\n');
}

const sql = s => "'" + String(s ?? '').replace(/'/g, "''") + "'";

// 「日本語 → 英語」の入り口の問題文。日本語だけだと同じ意味の語がいくつも当てはまるので、
// 品詞・頭文字・文字数（熟語は語数と頭文字）を添えて答えを 1 つにする。例文の和訳があれば付ける
const POS = { noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞' };
function jaPrompt(q) {
  const ans = String(q.answer);
  const words = ans.split(/\s+/);
  const hint = words.length > 1
    ? `熟語・${words.length}語・${words[0][0]} で始まる`
    : `${POS[q.category] || '単語'}・${ans[0]} で始まる${ans.length}文字`;
  return esc(`${q.answer_ja}（${hint}）` + (q.example_ja ? '\n' + q.example_ja : ''));
}

const out = [];
let total = 0;
// 1 行ぶんを出す。--figures のときは、図のある問題の img と note だけを書き換える
function emit(row) {
  if (SCOPES_ONLY) {
    out.push(`UPDATE problems SET scope = ${sql(row.scope)}, free = ${row.free} WHERE src = ${sql(row.src)} AND qid = ${sql(row.qid)};`);
    return;
  }
  if (OV_ONLY) {
    const base = row.qid.replace(/-ja$/, '');
    if (!OVERRIDES[base]) return;
    out.push(`UPDATE problems SET que = ${sql(row.que)}, kan = ${sql(row.kan)}, ans = ${sql(row.ans)} WHERE src = ${sql(row.src)} AND qid = ${sql(row.qid)};`);
    return;
  }
  if (FIG_ONLY) {
    const base = row.qid.replace(/-ja$/, '');
    if (!FIG_ONLY.has(base)) return;
    out.push(`UPDATE problems SET img = ${sql(row.img)}, note = ${sql(row.note)} WHERE src = ${sql(row.src)} AND qid = ${sql(row.qid)};`);
    return;
  }
  row.rnd = Math.random().toFixed(9);   // ランダムに引くための乱数（migrations/0008）
  const cols = Object.keys(row);
  out.push(`INSERT INTO problems (${cols.join(', ')}) VALUES (${cols.map(c => sql(row[c])).join(', ')});`);
}
// 問題集・レベルごとの問題数（migrations/0008）を作り直す
const REFRESH_STATS = ['DELETE FROM problem_stats;', 'INSERT INTO problem_stats SELECT kbn, level, COUNT(*), SUM(free) FROM problems GROUP BY kbn, level;'];

// 問題の範囲（並べる前の名前）。英単語はレベルで分ける
function scopeName(src, q, level) {
  if (NO_SCOPE.has(src)) return '';
  const bands = LEVEL_BANDS[src];
  if (bands) { const b = bands.find(([, lo, hi]) => level >= lo && level <= hi); return b ? b[0] : ''; }
  return String(q.category || '');
}
// 問題集 1 つ分の行に、範囲の並びと無料かを付けて出し、範囲の一覧（problem_scopes）も作り直す。
// order … 範囲の並び（無ければ出てきた順）。範囲が 1 つ以下なら、範囲に分けない
function finish(kbn, rows, order) {
  const seen = [...new Set(rows.map(r => r.scope))];
  const names = (order || []).filter(n => seen.includes(n)).concat(seen.filter(n => !(order || []).includes(n)));
  const split = names.length >= 2 && names.every(Boolean);
  if (!split) rows.forEach(r => { r.scope = ''; });
  const list = split ? names : [];
  const nFree = isPaidSet(kbn) ? freeScopeCount(list.length) : list.length;
  // 範囲の無い有料の問題集（今は無い）は、行の 3 割を無料に
  rows.forEach((r, i) => {
    r.free = !isPaidSet(kbn) ? 1 : list.length ? (list.indexOf(r.scope) < nFree ? 1 : 0) : (i % 10 < 3 ? 1 : 0);
    emit(r);
  });
  if (FIG_ONLY || OV_ONLY) return;
  out.push(`DELETE FROM problem_scopes WHERE kbn = ${sql(kbn)};`);
  const count = {};
  rows.forEach(r => { if (r.scope) { const k = r.scope + '\t' + r.level; count[k] = (count[k] || 0) + 1; } });
  for (const [k, n] of Object.entries(count)) {
    const [scope, level] = k.split('\t');
    const ord = list.indexOf(scope);
    out.push(`INSERT INTO problem_scopes (kbn, scope, ord, free, level, n) VALUES (${sql(kbn)}, ${sql(scope)}, ${ord}, ${ord < nFree ? 1 : 0}, ${Number(level)}, ${n});`);
  }
}
const wanted = id => !ONLY || ONLY.has(id);

for (const cave of CAVES) {
  if (!wanted(cave.id)) continue;
  const dir = join(root, cave.src || cave.id);
  const meta = JSON.parse(readFileSync(join(dir, 'cave.json'), 'utf8'));
  const files = readdirSync(join(dir, 'questions')).filter(f => f.endsWith('.json') && f !== 'chaser.json').sort();
  const qs = files.flatMap(f => JSON.parse(readFileSync(join(dir, 'questions', f), 'utf8')))
    .filter(q => q.review === 'verified');

  if (!FIG_ONLY && !OV_ONLY && !SCOPES_ONLY) out.push(`DELETE FROM problems WHERE src = ${sql(cave.id)};`);
  const rows = [];
  for (const q0 of qs) {
    const q = applyOverride(q0);
    const level = q.level * (cave.levelScale || 1);
    const ans = withAlts(q.id, q.reading ? typeable(String(q.reading)) : reading(q, meta.language));
    if (!ans) throw new Error(q.id + ' の打つ文字が空になりました: ' + q.answer);
    const row = {
      kbn: cave.id, src: cave.id, qid: cave.ja ? q.id + '-ja' : q.id, level,
      scope: scopeName(cave.src || cave.id, q, level), free: 0,
      // 英英の定義文がある問題（英語早押し）は、なぞなぞではなく定義文から出す
      que: cave.ja ? jaPrompt(q) : esc(q.definition || q.prompt), kan: q.answer, ans,
      img: FIGURES[q.id] ? 'fig/' + FIGURES[q.id].file : '',
      note: [note(q, meta.language), FIGURES[q.id] ? credit(FIGURES[q.id]) : ''].filter(Boolean).join('\n')
    };
    rows.push(row);
  }
  finish(cave.id, rows, SCOPE_ORDER[cave.src || cave.id] || (LEVEL_BANDS[cave.src || cave.id] || []).map(b => b[0]));
  console.error(`${cave.id}: ${qs.length} 問`);
  total += qs.length;
}
// このリポジトリで作った問題集（data/sets/<id>.json）。確かめ済み（review: verified）の問題だけ入れる。
// reading（打つ文字）は問題ごとに書いてある
for (const set of OWN_SETS) {
  if (!wanted(set.id)) continue;
  const file = join(here, '..', 'data', 'sets', set.id + '.json');
  let qs;
  try { qs = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`${set.id}: ファイルが無いので飛ばします`); continue; }
  qs = qs.filter(q => q.review === 'verified');
  if (!FIG_ONLY && !OV_ONLY && !SCOPES_ONLY) out.push(`DELETE FROM problems WHERE src = ${sql(set.id)};`);
  const rows = [];
  for (const q0 of qs) {
    const q = applyOverride(q0);
    const ans = withAlts(q.id, typeable(String(q.reading || '')), q.alts);
    if (!ans) throw new Error(q.id + ' の打つ文字が空です: ' + q.answer);
    const row = {
      kbn: set.id, src: set.id, qid: q.id, level: q.level,
      scope: scopeName(set.id, q, q.level), free: 0,
      que: esc(q.prompt), kan: q.answer, ans,
      // 図は data/figures*.json のほか、問題そのものに書いてあってもよい（雑学：image と credit）
      img: q.image ? 'fig/' + q.image : FIGURES[q.id] ? 'fig/' + FIGURES[q.id].file : '',
      note: [q.explanation || '', q.credit || '', FIGURES[q.id] ? credit(FIGURES[q.id]) : ''].filter(Boolean).join('\n')
    };
    rows.push(row);
  }
  finish(set.id, rows, SCOPE_ORDER[set.id]);
  console.error(`${set.id}: ${qs.length} 問`);
  total += qs.length;
}

// 基本・応用（スプレッドシートの問題）の範囲は data/scopes/1.json（用語 → 範囲）。行を 1 回だけ読む CASE で書き換える
if (SCOPES_ONLY && wanted('1')) {
  const map = JSON.parse(readFileSync(join(here, '..', 'data', 'scopes', '1.json'), 'utf8'));
  const list = SCOPE_ORDER['1'];
  const nFree = isPaidSet('1') ? freeScopeCount(list.length) : list.length;
  const whens = Object.entries(map).map(([kan, sc]) => `WHEN ${sql(kan)} THEN ${sql(sc)}`).join(' ');
  out.push(`UPDATE problems SET scope = CASE kan ${whens} ELSE '' END WHERE kbn = '1';`);
  out.push(`UPDATE problems SET free = CASE scope ${list.map((sc, i) => `WHEN ${sql(sc)} THEN ${i < nFree ? 1 : 0}`).join(' ')} ELSE 0 END WHERE kbn = '1';`);
  out.push(`DELETE FROM problem_scopes WHERE kbn = '1';`);
  out.push(`INSERT INTO problem_scopes (kbn, scope, ord, free, level, n) SELECT kbn, scope, CASE scope ${list.map((sc, i) => `WHEN ${sql(sc)} THEN ${i}`).join(' ')} END, free, level, COUNT(*) FROM problems WHERE kbn = '1' AND scope <> '' GROUP BY scope, level;`);
  console.error('1: 範囲を書き換え');
}

if (!FIG_ONLY && !OV_ONLY) out.push(...REFRESH_STATS);
process.stdout.write(out.join('\n') + '\n');
console.error(`合計 ${total} 問を書き出しました`);
