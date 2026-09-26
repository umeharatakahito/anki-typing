// ===============================================================
// import-caves.mjs
// 勉強ダンジョンズ（EnglishSpelunker）の洞窟の問題と、このリポジトリで作った問題集
// （data/sets/）を、D1 に入れる SQL にする。
//
//   node scripts/import-caves.mjs ~/program/StudyQuest-wt/R/data/caves > caves.local.sql
//   npx wrangler d1 execute anki-typing --remote --file caves.local.sql
//
// 入れ直すたびに、洞窟ごとの問題は丸ごと置き換える（スプレッドシートの問題はそのまま）。
//   que  … 問題文        kan … 表示する正解     ans … 打つ文字（ひらがな・英字）
//   level … 1〜10        free … 会員でなくても出す（レベル 1〜3）
//   note … 正解の後に見せる解説
//   img  … 図（data/figures.json にある問題だけ。fig/<ファイル名>）
// ===============================================================

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAVES, OWN_SETS } from '../src/sets.js';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/import-caves.mjs <勉強ダンジョンズの data/caves>');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const READINGS = JSON.parse(readFileSync(join(here, '..', 'data', 'readings.json'), 'utf8'));
// 問題に付ける図（public/fig/）。フリー画像は、答えた後の解説に作者とライセンスを出す
// （ファイル名には答えが入っていることがあるので、解く前には出さない）
const FIGURES = JSON.parse(readFileSync(join(here, '..', 'data', 'figures.json'), 'utf8'));
const credit = f => f.kind === 'commons'
  ? `図：${f.author}／${f.license}（Wikimedia Commons）` : '';

// 会員でなくても遊べるのはここまで（worker と同じ値）
const FREE_MAX_LEVEL = 3;

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

const out = [];
let total = 0;
for (const cave of CAVES) {
  const dir = join(root, cave.id);
  const meta = JSON.parse(readFileSync(join(dir, 'cave.json'), 'utf8'));
  const files = readdirSync(join(dir, 'questions')).filter(f => f.endsWith('.json') && f !== 'chaser.json').sort();
  const qs = files.flatMap(f => JSON.parse(readFileSync(join(dir, 'questions', f), 'utf8')))
    .filter(q => q.review === 'verified');

  out.push(`DELETE FROM problems WHERE src = ${sql(cave.id)};`);
  for (const q of qs) {
    const level = q.level * (cave.levelScale || 1);
    const ans = reading(q, meta.language);
    if (!ans) throw new Error(q.id + ' の打つ文字が空になりました: ' + q.answer);
    const row = {
      kbn: cave.id, src: cave.id, qid: q.id, level,
      free: level <= FREE_MAX_LEVEL ? 1 : 0,
      // 英英の定義文がある問題（英語早押し）は、なぞなぞではなく定義文から出す
      que: esc(q.definition || q.prompt), kan: q.answer, ans,
      img: FIGURES[q.id] ? 'fig/' + FIGURES[q.id].file : '',
      note: [note(q, meta.language), FIGURES[q.id] ? credit(FIGURES[q.id]) : ''].filter(Boolean).join('\n')
    };
    const cols = Object.keys(row);
    out.push(`INSERT INTO problems (${cols.join(', ')}) VALUES (${cols.map(c => sql(row[c])).join(', ')});`);
  }
  console.error(`${cave.id}: ${qs.length} 問`);
  total += qs.length;
}
// このリポジトリで作った問題集（data/sets/<id>.json）。確かめ済み（review: verified）の問題だけ入れる。
// reading（打つ文字）は問題ごとに書いてある
for (const set of OWN_SETS) {
  const file = join(here, '..', 'data', 'sets', set.id + '.json');
  let qs;
  try { qs = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`${set.id}: ファイルが無いので飛ばします`); continue; }
  qs = qs.filter(q => q.review === 'verified');
  out.push(`DELETE FROM problems WHERE src = ${sql(set.id)};`);
  for (const q of qs) {
    const ans = typeable(String(q.reading || ''));
    if (!ans) throw new Error(q.id + ' の打つ文字が空です: ' + q.answer);
    const row = {
      kbn: set.id, src: set.id, qid: q.id, level: q.level,
      free: q.level <= FREE_MAX_LEVEL ? 1 : 0,
      que: esc(q.prompt), kan: q.answer, ans,
      img: FIGURES[q.id] ? 'fig/' + FIGURES[q.id].file : '',
      note: [q.explanation || '', FIGURES[q.id] ? credit(FIGURES[q.id]) : ''].filter(Boolean).join('\n')
    };
    const cols = Object.keys(row);
    out.push(`INSERT INTO problems (${cols.join(', ')}) VALUES (${cols.map(c => sql(row[c])).join(', ')});`);
  }
  console.error(`${set.id}: ${qs.length} 問`);
  total += qs.length;
}

process.stdout.write(out.join('\n') + '\n');
console.error(`合計 ${total} 問を書き出しました`);
