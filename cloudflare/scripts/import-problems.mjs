// ===============================================================
// import-problems.mjs
// スプレッドシートの problems シートを CSV で書き出したものを、
// D1 に入れる SQL にする。
//
//   node scripts/import-problems.mjs problems.csv > problems.local.sql
//   npx wrangler d1 execute anki-typing --remote --file problems.local.sql
//
// 見出し行に que / kan / ans / kbn / img があればよい（順番・他の列は問わない）。
// 入れ直すたびに、スプレッドシートの問題は丸ごと置き換える（勉強ダンジョンズの問題はそのまま）。
// ===============================================================

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCOPE_ORDER, isPaidSet, freeScopeCount } from '../src/sets.js';
import { parseCsv } from './csv.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/import-problems.mjs <problems.csv>');
  process.exit(1);
}

const rows = parseCsv(readFileSync(file, 'utf8'));
const header = rows.shift().map(h => h.trim());
const col = name => header.indexOf(name);
if (col('kbn') < 0) {
  console.error('見出し行に「kbn」が見つかりません: ' + header.join(', '));
  process.exit(1);
}

const q = v => "'" + String(v ?? '').replace(/'/g, "''") + "'";
const get = (r, name) => (col(name) >= 0 ? r[col(name)] : '') || '';

// 範囲（scope）は data/scopes/<kbn>.json（用語 → 範囲）。会員でない人に出すのは範囲の先頭 3 割（sets.js）。
// 範囲の無い問題は、有料の問題集なら 10 問に 3 問（行の順で決めるので、入れ直しても同じ問題）
const scopeMaps = {};
const scopeOf = (kbn, kan) => {
  if (!(kbn in scopeMaps)) {
    const f = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'scopes', kbn + '.json');
    scopeMaps[kbn] = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  }
  return scopeMaps[kbn][kan] || '';
};
const out = ["DELETE FROM problems WHERE src = 'hamachi';"];
const kbns = new Set();
rows.forEach((r, i) => {
  const kbn = get(r, 'kbn'), scope = scopeOf(kbn, get(r, 'kan'));
  const order = SCOPE_ORDER[kbn] || [];
  const free = !isPaidSet(kbn) ? 1 : scope && order.includes(scope) ? (order.indexOf(scope) < freeScopeCount(order.length) ? 1 : 0) : (i % 10 < 3 ? 1 : 0);
  kbns.add(kbn);
  // rnd はランダムに引くための乱数（migrations/0008）
  out.push(`INSERT INTO problems (kbn, que, kan, ans, img, src, free, rnd, scope) VALUES (${
    ['kbn', 'que', 'kan', 'ans', 'img'].map(k => q(get(r, k))).join(', ')}, 'hamachi', ${free}, ${Math.random().toFixed(9)}, ${q(scope)});`);
});
// 範囲の一覧（migrations/0009）
for (const kbn of kbns) {
  const order = SCOPE_ORDER[kbn];
  out.push(`DELETE FROM problem_scopes WHERE kbn = ${q(kbn)};`);
  if (order) out.push(`INSERT INTO problem_scopes (kbn, scope, ord, free, level, n) SELECT kbn, scope, CASE scope ${order.map((sc, i) => `WHEN ${q(sc)} THEN ${i}`).join(' ')} END, free, level, COUNT(*) FROM problems WHERE kbn = ${q(kbn)} AND scope <> '' GROUP BY scope, level;`);
}
// 問題集・レベルごとの問題数（migrations/0008）を作り直す
out.push('DELETE FROM problem_stats;', 'INSERT INTO problem_stats SELECT kbn, level, COUNT(*), SUM(free) FROM problems GROUP BY kbn, level;');
process.stdout.write(out.join('\n') + '\n');
console.error(`${rows.length} 行を書き出しました`);
