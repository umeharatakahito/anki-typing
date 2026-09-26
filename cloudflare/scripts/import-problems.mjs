// ===============================================================
// import-problems.mjs
// スプレッドシートの problems シートを CSV で書き出したものを、
// D1 に入れる SQL にする。
//
//   node scripts/import-problems.mjs problems.csv > problems.local.sql
//   npx wrangler d1 execute anki-typing --remote --file problems.local.sql
//
// 見出し行に que / kan / ans / kbn / img があればよい（順番・他の列は問わない）。
// 入れ直すたびに problems は丸ごと置き換える。
// ===============================================================

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/import-problems.mjs <problems.csv>');
  process.exit(1);
}

// RFC 4180 の CSV（"" のエスケープ、セル内改行あり）
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ''));
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

const out = ['DELETE FROM problems;'];
for (const r of rows) {
  out.push(`INSERT INTO problems (kbn, que, kan, ans, img) VALUES (${
    ['kbn', 'que', 'kan', 'ans', 'img'].map(k => q(get(r, k))).join(', ')});`);
}
process.stdout.write(out.join('\n') + '\n');
console.error(`${rows.length} 行を書き出しました`);
