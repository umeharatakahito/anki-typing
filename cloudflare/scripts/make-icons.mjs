// ===============================================================
// make-icons.mjs
// Lucide（https://lucide.dev, ISC）のアイコンから、使うものだけ src/icons.js に書き出す。
//   npm pack lucide-static && tar xzf lucide-static-*.tgz   （package/icons/*.svg ができる）
//   OUT=src/icons.js node scripts/make-icons.mjs fish flag map …   （使う名前をすべて並べる）
// いま入っている名前は src/icons.js の ICON_PATHS を見る。
// ===============================================================
import { readFileSync, writeFileSync } from 'node:fs';
const names = process.argv.slice(2);
const out = {}; const miss = [];
for (const n of names) {
  let s; try { s = readFileSync(`package/icons/${n}.svg`, 'utf8'); } catch { miss.push(n); continue; }
  out[n] = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '').trim();
}
if (miss.length) { console.error('missing', miss.join(' ')); process.exit(1); }
const body = Object.entries(out).map(([k, v]) => `  '${k}': '${v}',`).join('\n');
writeFileSync(process.env.OUT, `// ===============================================================
// icons.js（scripts で lucide-static 1.48.0 から抜き出したもの。手で直さない）
// Lucide Icons — ISC License, Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
// as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
// https://lucide.dev/license
// 使い方：icon('fish') で 24×24 の線画 <svg> を返す（色は currentColor）
// ===============================================================

export const ICON_PATHS = {
${body}
};

export function icon(name, cls) {
  const p = ICON_PATHS[name];
  if (!p) return '';
  return '<svg class="' + (cls || 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}
`);
console.log(Object.keys(out).length, 'icons');
