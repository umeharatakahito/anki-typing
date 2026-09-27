// ===============================================================
// make-zatsugaku.mjs
// 雑学の問題集を data/zatsugaku/ の一覧から作る。図は public/fig/zk/ に書き出す。
//
//   node scripts/make-zatsugaku.mjs
//
// 作るもの（data/sets/<id>.json。形は ほかの問題集と同じ。image は public/fig/ からの場所）
//   flag-country       … 国旗 → 国名        （国旗：flag-icons, MIT）
//   map-world-country  … 世界地図 → 国名    （地図：Natural Earth、world-atlas 経由, パブリックドメイン）
//   capital            … 国名 → 首都        （国旗を添える）
//   map-japan-pref     … 日本地図 → 都道府県（地図：Natural Earth admin-1。data/zatsugaku/japan.geojson）
//   element            … 元素記号 → 名前    （図はここで描く）
//
// 一覧（countries.txt / prefectures.txt / elements.txt）を直したら、これを流してから import-caves.mjs で入れ直す。
// ===============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as topo from 'topojson-client';
import { geoAzimuthalEqualArea, geoMercator, geoPath, geoBounds, geoCentroid, geoArea, geoDistance, geoCircle } from 'd3-geo';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const DATA = join(root, 'data', 'zatsugaku');
const FIG = join(root, 'public', 'fig', 'zk');
mkdirSync(FIG, { recursive: true });

const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
// 打つ文字：カタカナはひらがなに、・や記号は打たない
const typeable = s => toHira(s).toLowerCase().replace(/[・.\s]/g, '').replace(/[^ぁ-ゖーa-z0-9]/g, '');
const lines = file => readFileSync(join(DATA, file), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|'));
const answers = (reading, alts) => [reading, ...String(alts || '').split(',').map(typeable).filter(Boolean)]
  .filter((a, i, all) => a && all.indexOf(a) === i);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// 小さく描くと同じ点が続くので、続いた点と、つぶれて点になった輪を落とす（ファイルを軽くする）
function slim(d, line) {
  if (!d) return '';
  if (line) return d.split(/(?=M)/).map(seg => {
    const out = [];
    for (const p of seg.slice(1).split('L')) if (p !== out[out.length - 1]) out.push(p);
    return out.length < 2 ? '' : 'M' + out.join('L');
  }).join('');
  return d.split(/(?=M)/).map(ring => {
    const pts = ring.replace(/Z$/, '').slice(1).split('L');
    const out = [];
    for (const p of pts) if (p !== out[out.length - 1]) out.push(p);
    if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    return out.length < 3 ? '' : 'M' + out.join('L') + (ring.endsWith('Z') ? 'Z' : '');
  }).join('');
}

const CREDIT_MAP = '地図：Natural Earth';
const CREDIT_FLAG = '国旗：flag-icons（MIT License）';
const sets = {};
const put = (set, q) => { (sets[set] = sets[set] || []).push(Object.assign({ review: 'verified' }, q)); };

// ---------------------------------------------------------------
// 国
const countries = lines('countries.txt').map(([iso2, num, en, name, reading, alts, cap, capReading, region, level]) => ({
  iso2, num, en, name, reading: reading || typeable(name), alts, cap, capReading: capReading || typeable(cap), region, level: Number(level)
}));

// 国旗は flag-icons の 4:3 の SVG をそのまま使う
const FLAGS = join(dirname(require.resolve('flag-icons/package.json')), 'flags', '4x3');
// 白の多い国旗（日本など）が背景に溶けないよう、薄い枠を重ねる
for (const c of countries) {
  const src = readFileSync(join(FLAGS, c.iso2.toLowerCase() + '.svg'), 'utf8');
  const vb = (src.match(/viewBox="0 0 (\d+) (\d+)"/) || [0, 640, 480]).slice(1).map(Number);
  writeFileSync(join(FIG, 'flag-' + c.iso2.toLowerCase() + '.svg'),
    src.replace(/<\/svg>\s*$/, `<rect width="${vb[0]}" height="${vb[1]}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="${vb[0] / 80}"/></svg>`));
}

// 世界地図：その国を真ん中にした地図（正距方位ではなく正積方位図法で、まわりの国も見える広さにする）
const w50 = require('world-atlas/countries-50m.json');
const w110 = require('world-atlas/countries-110m.json');
const f50 = topo.feature(w50, w50.objects.countries).features;
const LAND = { fine: topo.feature(w50, w50.objects.land), coarse: topo.feature(w110, w110.objects.land) };
const BORDERS = {
  fine: topo.mesh(w50, w50.objects.countries, (a, b) => a !== b),
  coarse: topo.mesh(w110, w110.objects.countries, (a, b) => a !== b),
};
// 地図データに無い小さな国は、首都のあたりに印だけ付ける
const POINTS = { TV: [179.2, -8.52] };
const W = 480, H = 320;
const polyArea = g => { const a = geoArea(g); return Math.min(a, 4 * Math.PI - a); };
function mainPolygon(parts) {
  const polys = parts.flatMap(p => p.geometry.type === 'Polygon' ? [p.geometry.coordinates] : p.geometry.coordinates)
    .map(c => ({ type: 'Polygon', coordinates: c }));
  return polys.sort((a, b) => polyArea(b) - polyArea(a))[0];
}
function worldMap(c) {
  const parts = c.num === '-' ? f50.filter(f => f.properties.name === c.en) : f50.filter(f => f.id === c.num);
  let center, R, target = null;
  if (parts.length) {
    const main = mainPolygon(parts);
    center = geoCentroid(main);
    const b = geoBounds(main);
    R = Math.max(14, Math.min(55, geoDistance(b[0], b[1]) * 180 / Math.PI * 1.15));
    target = { type: 'FeatureCollection', features: parts };
  } else if (POINTS[c.iso2]) {
    center = POINTS[c.iso2]; R = 14;
  } else throw new Error(c.en + ' が地図データにありません');
  const proj = geoAzimuthalEqualArea().rotate([-center[0], -center[1]]).clipAngle(Math.min(R * 2, 170));
  proj.fitExtent([[W / 2 - H * 0.45, H * 0.05], [W / 2 + H * 0.45, H * 0.95]], geoCircle().center(center).radius(R)());
  const coarse = R > 22 ? 'coarse' : 'fine';
  const path = geoPath(proj).digits(0);
  const [cx, cy] = proj(center);
  const small = !target || path.area(target) < 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#cfe8f5"/>` +
    `<path d="${slim(path(LAND[coarse]))}" fill="#ece6d6"/>` +
    (target ? `<path d="${slim(path(target)) || path(target)}" fill="#ff6b35"/>` : '') +
    `<path d="${slim(path(BORDERS[coarse]), true)}" fill="none" stroke="#fff" stroke-width=".8"/>` +
    (small ? `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="16" fill="none" stroke="#ff6b35" stroke-width="3"/>` : '') +
    `</svg>`;
}

for (const c of countries) {
  const code = c.iso2.toLowerCase();
  writeFileSync(join(FIG, 'map-' + code + '.svg'), worldMap(c));
  const ans = answers(c.reading, c.alts);
  const about = `首都は${c.cap}。${c.region}の国。`;
  put('flag-country', { id: 'flag-' + code, level: c.level, category: c.region, prompt: 'この国旗の国は？',
    answer: c.name, reading: ans[0], alts: ans.slice(1), explanation: about, image: 'zk/flag-' + code + '.svg', credit: CREDIT_FLAG });
  put('map-world-country', { id: 'map-' + code, level: c.level, category: c.region, prompt: 'オレンジ色の国は？',
    answer: c.name, reading: ans[0], alts: ans.slice(1), explanation: about, image: 'zk/map-' + code + '.svg', credit: CREDIT_MAP });
  put('capital', { id: 'cap-' + code, level: c.level, category: c.region, prompt: `「${c.name}」の首都は？`,
    answer: c.cap, reading: c.capReading, explanation: `${c.name}（${c.region}）の首都。`, image: 'zk/flag-' + code + '.svg', credit: CREDIT_FLAG });
}

// ---------------------------------------------------------------
// 都道府県：日本全体の中で 1 つだけ色を付ける。沖縄は左上の枠に
const japan = JSON.parse(readFileSync(join(DATA, 'japan.geojson'), 'utf8'));
const box = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]]] });
const JW = 400, JH = 400;
const mainProj = geoMercator().fitExtent([[10, 10], [JW - 10, JH - 10]], box(128.4, 30.2, 146.0, 45.7));
const INSET = [[12, 12], [162, 122]];
const okiProj = geoMercator().fitExtent([[INSET[0][0] + 4, INSET[0][1] + 4], [INSET[1][0] - 4, INSET[1][1] - 4]], box(123.6, 24.0, 128.6, 27.0));
const clipRect = `<clipPath id="oki"><rect x="${INSET[0][0]}" y="${INSET[0][1]}" width="${INSET[1][0] - INSET[0][0]}" height="${INSET[1][1] - INSET[0][1]}"/></clipPath>`;
function prefMap(code) {
  const draw = proj => {
    const p = geoPath(proj).digits(0);
    return japan.features.map(f => `<path d="${slim(p(f))}" fill="${f.properties.iso === 'JP-' + code ? '#ff6b35' : '#ece6d6'}"/>`).join('');
  };
  const oki = japan.features.filter(f => f.properties.iso === 'JP-47');
  // 小さい都府県（東京・大阪・香川など）は丸で囲む
  const me = japan.features.find(f => f.properties.iso === 'JP-' + code);
  const mp = geoPath(mainProj);
  const [rx, ry] = mp.centroid(code === '13' ? { type: 'Feature', geometry: mainPolygon([me]) } : me);
  const ring = code !== '47' && mp.area(me) < 120
    ? `<circle cx="${rx.toFixed(0)}" cy="${ry.toFixed(0)}" r="14" fill="none" stroke="#ff6b35" stroke-width="2.5"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${JW} ${JH}"><defs>${clipRect}</defs>` +
    `<rect width="${JW}" height="${JH}" fill="#cfe8f5"/>` +
    `<g stroke="#fff" stroke-width=".7">${draw(mainProj)}</g>` +
    `<rect x="${INSET[0][0]}" y="${INSET[0][1]}" width="${INSET[1][0] - INSET[0][0]}" height="${INSET[1][1] - INSET[0][1]}" fill="#cfe8f5" stroke="#9fb7c4"/>` +
    `<g clip-path="url(#oki)" stroke="#fff" stroke-width=".3">${oki.map(f => `<path d="${geoPath(okiProj).digits(1)(f)}" fill="${code === '47' ? '#ff6b35' : '#ece6d6'}"/>`).join('')}</g>` +
    ring +
    `</svg>`;
}
for (const [code, name, reading, cap, capReading, region, level] of lines('prefectures.txt')) {
  writeFileSync(join(FIG, 'pref-' + code + '.svg'), prefMap(code));
  const bare = reading.replace(/(けん|ふ|と)$/, '');
  put('map-japan-pref', { id: 'pref-' + code, level: Number(level), category: region, prompt: 'オレンジ色の都道府県は？',
    answer: name, reading, alts: code === '01' ? [] : [bare],
    explanation: `県庁所在地は${cap}（${capReading}）。${region}。`, image: 'zk/pref-' + code + '.svg', credit: CREDIT_MAP });
}

// ---------------------------------------------------------------
// 元素：周期表のマスのような札を描く。色は元素の仲間ごと
const GROUPS = [
  ['アルカリ金属', '#f28b82', [3, 11, 19, 37, 55, 87]],
  ['アルカリ土類金属', '#fbbc6c', [4, 12, 20, 38, 56, 88]],
  ['遷移金属', '#fdd663', [...range(21, 30), ...range(39, 48), ...range(72, 80), ...range(104, 112)]],
  ['ランタノイド', '#c6e48b', range(57, 71)],
  ['アクチノイド', '#a8dab5', range(89, 103)],
  ['典型金属', '#aecbfa', [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116]],
  ['半金属', '#b4d7e8', [5, 14, 32, 33, 51, 52]],
  ['非金属', '#d7aefb', [1, 6, 7, 8, 15, 16, 34]],
  ['ハロゲン', '#f8b4d9', [9, 17, 35, 53, 85, 117]],
  ['貴ガス', '#cbd5e1', [2, 10, 18, 36, 54, 86, 118]],
];
function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
const groupOf = n => GROUPS.find(g => g[2].includes(n));
const levelOfElement = n => n <= 20 ? 1 : [26, 29, 30, 47, 50, 53, 78, 79, 80, 82, 92].includes(n) ? 2 : n <= 36 ? 2 : n <= 56 ? 3 : n <= 86 ? 4 : 5;
for (const [num, sym, name, reading, alts] of lines('elements.txt')) {
  const n = Number(num);
  const g = groupOf(n);
  if (!g) throw new Error('元素の仲間が決まっていません: ' + n);
  writeFileSync(join(FIG, 'el-' + n + '.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">` +
    `<rect x="8" y="8" width="224" height="224" rx="24" fill="${g[1]}"/>` +
    `<rect x="8" y="8" width="224" height="224" rx="24" fill="none" stroke="#1d2b53" stroke-opacity=".25" stroke-width="3"/>` +
    `<text x="28" y="54" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="700" fill="#1d2b53">${n}</text>` +
    `<text x="120" y="162" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="${sym.length > 1 ? 104 : 120}" font-weight="700" fill="#1d2b53">${esc(sym)}</text>` +
    `<text x="120" y="208" text-anchor="middle" font-family="'Hiragino Sans','Noto Sans JP',sans-serif" font-size="18" fill="#1d2b53" fill-opacity=".7">${g[0]}</text>` +
    `</svg>`);
  put('element', { id: 'el-' + n, level: levelOfElement(n), category: g[0], prompt: `元素記号「${sym}」の元素の名前は？`,
    answer: name, reading: answers(reading || typeable(name), alts)[0], alts: answers(reading || typeable(name), alts).slice(1),
    explanation: `原子番号 ${n}・${g[0]}。`, image: 'zk/el-' + n + '.svg' });
}

// ---------------------------------------------------------------
for (const [id, qs] of Object.entries(sets)) {
  writeFileSync(join(root, 'data', 'sets', id + '.json'), JSON.stringify(qs, null, 1) + '\n');
  console.log(`${id}: ${qs.length} 問`);
}
