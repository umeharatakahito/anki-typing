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

import { readFileSync } from 'node:fs';
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

// 会員でない人に出すのは 10 問に 3 問（行の順で決めるので、入れ直しても同じ問題）
const out = ["DELETE FROM problems WHERE src = 'hamachi';"];
rows.forEach((r, i) => {
  out.push(`INSERT INTO problems (kbn, que, kan, ans, img, src, free) VALUES (${
    ['kbn', 'que', 'kan', 'ans', 'img'].map(k => q(get(r, k))).join(', ')}, 'hamachi', ${i % 10 < 3 ? 1 : 0});`);
});
process.stdout.write(out.join('\n') + '\n');
console.error(`${rows.length} 行を書き出しました`);
