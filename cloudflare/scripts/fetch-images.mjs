// ===============================================================
// fetch-images.mjs
// problems シートの CSV の img 列（Google ドライブのファイル ID）の画像を、
// public/img/<ID>.png に取ってくる。既にあるものは取り直さない。
//
//   node scripts/fetch-images.mjs problems.csv
//   npm run deploy
//
// ここに無い画像は、worker.js がドライブの画像を代わりに出す。
// ===============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/fetch-images.mjs <problems.csv>');
  process.exit(1);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img');
mkdirSync(OUT, { recursive: true });

const [head, ...rows] = parseCsv(readFileSync(file, 'utf8'));
const col = head.map(h => h.trim().toLowerCase()).indexOf('img');
if (col < 0) throw new Error('img 列がありません');

const ids = [...new Set(rows.map(r => (r[col] || '').trim()).filter(Boolean))];
let got = 0, skipped = 0, failed = 0;
for (const id of ids) {
  const out = join(OUT, id + '.png');
  if (existsSync(out)) { skipped++; continue; }
  const res = await fetch('https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id));
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/png')) {
    console.error('取れなかった:', id, res.status, type);
    failed++;
    continue;
  }
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  got++;
}
console.log(`新しく ${got} 枚、既にあった ${skipped} 枚、取れなかった ${failed} 枚`);
