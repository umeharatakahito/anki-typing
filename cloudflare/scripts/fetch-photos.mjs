// ===============================================================
// fetch-photos.mjs
// 写真の雑学（data/zatsugaku/photos/<一覧>.txt）の写真を Wikimedia Commons から取ってくる。
//
//   node scripts/fetch-photos.mjs              … まだ無い写真だけ
//   node scripts/fetch-photos.mjs --force      … 全部取り直す
//   node scripts/fetch-photos.mjs zk-fish      … その一覧だけ
//   node scripts/fetch-photos.mjs --credits    … 写真はそのまま、作者とライセンスだけ取り直す
//
// 選び方：Wikipedia の記事 → Wikidata の「画像」（P18）→ 無ければ記事の代表画像。どちらも Commons にあるものだけ。
// 一覧の最後の列に Commons のファイル名があれば、それを使う（写真を選び直すとき）。
// 写真は幅 720px までの JPEG にして public/fig/zk/photo/<一覧>-<キー>.jpg に置き、
// 作者とライセンスを data/zatsugaku/photos/<一覧>.credits.json に残す。
// 世界遺産は、右下に場所を示す小さな世界地図を重ねる（座標は Wikipedia の記事から）。
// ===============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import * as topo from 'topojson-client';
import { geoEqualEarth, geoPath } from 'd3-geo';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const LISTS = join(root, 'data', 'zatsugaku', 'photos');
const OUT = join(root, 'public', 'fig', 'zk', 'photo');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const CREDITS_ONLY = args.includes('--credits');   // 写真は取り直さず、作者とライセンスだけ書き直す
const only = args.filter(a => !a.startsWith('--'));
const UA = 'StudyTypeBuilder/1.0 (https://studytype.umekobo.com)';

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(host, params) {
  const url = `https://${host}/w/api.php?` + new URLSearchParams(Object.assign({ format: 'json', formatversion: '2' }, params));
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (r.ok) return r.json();
    await sleep(1500 * (i + 1));
  }
  throw new Error('API に届きません: ' + url);
}
const chunks = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
// 作者名。書かれていなければアップロードした人（Commons の表記に合わせる）。長い決まり文句は名前だけにする
function authorOf(artist, user) {
  const m = artist.match(/^No machine-readable author provided\. (.+?) assumed/) || artist.match(/made by (\S+)/);
  if (m) return m[1];
  if (artist && artist.length <= 60) return artist;
  return user ? user + '（アップロードした人）' : '作者不明';
}
const plain = html => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export function readList(file) {
  return readFileSync(join(LISTS, file), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => {
    const [key, answer, reading, alts, title, level, note, country, file] = l.split('|');
    return { key, answer, reading, alts, title: title || answer, level: Number(level), note, country, file };
  });
}

// 記事 → Wikidata の画像と座標
async function lookup(items) {
  const byTitle = {};
  for (const part of chunks(items, 40)) {
    const j = await api('ja.wikipedia.org', { action: 'query', prop: 'pageprops|pageimages|coordinates', ppprop: 'wikibase_item',
      piprop: 'name', colimit: 'max', redirects: '1', titles: part.map(x => x.title).join('|') });
    const norm = {};
    for (const n of (j.query.normalized || []).concat(j.query.redirects || [])) norm[n.to] = (norm[n.from] || []).concat(n.from);
    for (const p of j.query.pages) {
      const info = { qid: p.pageprops && p.pageprops.wikibase_item, pageimage: p.pageimage, coord: p.coordinates && p.coordinates[0], missing: p.missing };
      byTitle[p.title] = info;
      const from = norm[p.title] || [];
      from.forEach(f => { byTitle[f] = info; (norm[f] || []).forEach(g => { byTitle[g] = info; }); });
    }
    await sleep(300);
  }
  const qids = [...new Set(Object.values(byTitle).map(x => x.qid).filter(Boolean))];
  const p18 = {}, p625 = {};
  for (const part of chunks(qids, 40)) {
    const j = await api('www.wikidata.org', { action: 'wbgetentities', ids: part.join('|'), props: 'claims' });
    for (const [id, e] of Object.entries(j.entities)) {
      const c = e.claims && e.claims.P18 && e.claims.P18[0];
      if (c && c.mainsnak.datavalue) p18[id] = c.mainsnak.datavalue.value;
      const g = e.claims && e.claims.P625 && e.claims.P625[0];
      if (g && g.mainsnak.datavalue) p625[id] = { lat: g.mainsnak.datavalue.value.latitude, lon: g.mainsnak.datavalue.value.longitude };
    }
    await sleep(300);
  }
  return { byTitle, p18, p625 };
}

// Commons の写真の情報（縮小版の URL・作者・ライセンス）。Commons に無いもの（日本語版だけの画像）は使わない
async function commonsInfo(files) {
  const info = {};
  for (const part of chunks([...new Set(files)], 30)) {
    const j = await api('commons.wikimedia.org', { action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata|mime|user',
      iiurlwidth: '800', titles: part.map(f => 'File:' + f).join('|') });
    const norm = {};
    for (const n of j.query.normalized || []) norm[n.to] = n.from;
    for (const p of j.query.pages) {
      const ii = p.imageinfo && p.imageinfo[0];
      const name = (norm[p.title] || p.title).replace(/^File:/, '');
      if (!ii || p.missing) continue;
      const m = ii.extmetadata || {};
      info[name] = { thumb: ii.thumburl, mime: ii.mime, url: ii.descriptionurl,
        author: authorOf(plain(m.Artist && m.Artist.value), ii.user), license: plain(m.LicenseShortName && m.LicenseShortName.value) || '' };
    }
    await sleep(300);
  }
  return info;
}

// 世界遺産の場所の小さな地図
const w110 = require('world-atlas/countries-110m.json');
const LAND = topo.feature(w110, w110.objects.land);
function locator([lon, lat]) {
  const W = 200, H = 104;
  const proj = geoEqualEarth().fitSize([W - 8, H - 8], { type: 'Sphere' }).translate([W / 2, H / 2]);
  const path = geoPath(proj).digits(1);
  const [x, y] = proj([lon, lat]);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" rx="8" fill="#ffffff" fill-opacity=".92"/>` +
    `<path d="${path({ type: 'Sphere' })}" fill="#cfe8f5"/><path d="${path(LAND)}" fill="#c9c1ac"/>` +
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#ff6b35" fill-opacity=".35"/>` +
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#ff6b35" stroke="#fff" stroke-width="1.2"/></svg>`);
}

const files = readdirSync(LISTS).filter(f => f.endsWith('.txt')).filter(f => !only.length || only.includes(f.replace('.txt', '')));
for (const file of files) {
  const set = file.replace('.txt', '');
  const items = readList(file);
  const creditsFile = join(LISTS, set + '.credits.json');
  const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : {};
  const { byTitle, p18, p625 } = await lookup(items);
  const pick = {};
  for (const it of items) {
    const t = byTitle[it.title] || {};
    pick[it.key] = { file: it.file || (t.qid && p18[t.qid]) || t.pageimage || '', coord: t.coord || (t.qid && p625[t.qid]), missing: t.missing };
  }
  const info = await commonsInfo(Object.values(pick).map(p => p.file).filter(Boolean));
  const problems = [];
  for (const it of items) {
    const p = pick[it.key];
    const out = join(OUT, `${set}-${it.key}.jpg`);
    const c = p.file && info[p.file];
    if (!c) { problems.push(`${it.key}（${it.title}）：${p.missing ? '記事がありません' : p.file ? 'Commons にない画像: ' + p.file : '画像がありません'}`); continue; }
    if (set === 'heritage' && !p.coord) problems.push(`${it.key}：座標がありません（地図なし）`);
    const same = credits[it.key] && credits[it.key].title === p.file && existsSync(out) && (set !== 'heritage' || credits[it.key].map === !!p.coord);
    if (same && CREDITS_ONLY) { Object.assign(credits[it.key], { author: c.author, license: c.license, url: c.url }); continue; }
    if (same && !FORCE) continue;
    const r = await fetch(c.thumb, { headers: { 'user-agent': UA } });
    if (!r.ok) { problems.push(`${it.key}：写真を取れません ${r.status}`); continue; }
    let img = sharp(Buffer.from(await r.arrayBuffer())).rotate().resize({ width: 720, height: 540, fit: 'inside', withoutEnlargement: true });
    if (set === 'heritage' && p.coord) {
      const meta = await img.toBuffer({ resolveWithObject: true });
      img = sharp(meta.data).composite([{ input: locator([p.coord.lon, p.coord.lat]), gravity: 'southeast' }]);
    }
    await img.flatten({ background: '#ffffff' }).jpeg({ quality: 78, mozjpeg: true }).toFile(out);
    credits[it.key] = { file: `zk/photo/${set}-${it.key}.jpg`, kind: 'commons', title: p.file, author: c.author, license: c.license, url: c.url };
    if (set === 'heritage') credits[it.key].map = !!p.coord;
    process.stderr.write('.');
    await sleep(250);
  }
  writeFileSync(creditsFile, JSON.stringify(credits, null, 1) + '\n');
  console.log(`\n${set}: ${items.length} 件` + (problems.length ? `、取れなかったもの ${problems.length} 件\n  ` + problems.join('\n  ') : ''));
}
