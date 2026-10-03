// ===============================================================
// build-data.mjs
// アプリに入れる問題と図を作る（オフラインで遊べるように、全部アプリの中に置く）。
//
//   npm run data        （cloudflare の手元の D1 から読む。先に cloudflare で問題を入れておく）
//
// 作るもの（どれも .gitignore。作り直せる）
//   www/data/images.json    … アプリに入れた図の一覧（問題の自動更新で届いた図が、アプリの中にあるかを見る）
//   www/data/menu.json      … 大分類 → 中分類 → 問題集（cloudflare/src/sets.js の MENU と同じ並び）
//   www/data/sets/<kbn>.json … 問題集ごとの問題 { scopes: [{ scope, n, free }], q: [[que, kan, ans, level, scope, img, note]] }
//   www/img/…               … 問題の図（cloudflare/public/ から写す）
//   www/js/icons.js         … Lucide のアイコン（cloudflare/src/icons.js を写す）
//
// 今は無料の問題（problems.free = 1）だけを入れる。有料の範囲は、アプリ内課金を作るときにダウンロードで足す
// （アプリの中に入れた問題は取り出せてしまうので、有料の問題は入れない）。
// ===============================================================

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cf = join(root, '..', 'cloudflare');
const www = join(root, 'www');
const { MENU, setInfo, isPaidSet, PAID_CATS } = await import(join(cf, 'src', 'sets.js'));

function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--json', '--command', sql],
    { cwd: cf, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out)[0].results;
}

rmSync(join(www, 'data'), { recursive: true, force: true });
rmSync(join(www, 'img'), { recursive: true, force: true });
mkdirSync(join(www, 'data', 'sets'), { recursive: true });
mkdirSync(join(www, 'img'), { recursive: true });
copyFileSync(join(cf, 'src', 'icons.js'), join(www, 'js', 'icons.js'));

// 問題集ごとの範囲（problem_scopes）
const scopeRows = d1('SELECT kbn, scope, ord, free, SUM(n) AS n FROM problem_scopes GROUP BY kbn, scope ORDER BY kbn, ord');
const scopesOf = kbn => scopeRows.filter(r => r.kbn === kbn).map(r => ({ scope: r.scope, n: r.n, free: !!r.free }));

const kbns = [...new Set(MENU.flatMap(m => m.groups.flatMap(g => g.sets)))];
const counts = {};
let imgBytes = 0, imgCount = 0, missing = 0;
const images = new Set();   // アプリに入れた図（data/images.json。届いた問題の図が、アプリの中にあるかを見る。www/js/ota.js）
for (const kbn of kbns) {
  const info = setInfo(kbn);
  if (!info || info.soon) continue;
  const rows = d1(`SELECT que, kan, ans, level, scope, img, note FROM problems WHERE kbn = '${kbn.replace(/'/g, "''")}' AND free = 1 ORDER BY level, id`);
  if (!rows.length) continue;
  const q = rows.map(r => {
    let img = '';
    if (r.img) {
      // 図は fig/…（public/fig）、スプレッドシートの画像はドライブの ID（public/img/<ID>.png）
      const src = r.img.startsWith('fig/') ? join(cf, 'public', r.img) : join(cf, 'public', 'img', r.img + '.png');
      const rel = r.img.startsWith('fig/') ? r.img : 'img/' + r.img + '.png';
      if (existsSync(src)) {
        const dst = join(www, 'img', rel.replace(/^(fig|img)\//, ''));
        mkdirSync(dirname(dst), { recursive: true });
        if (!existsSync(dst)) { copyFileSync(src, dst); imgBytes += statSync(src).size; imgCount++; }
        img = 'img/' + rel.replace(/^(fig|img)\//, '');
        images.add(img);
      } else missing++;
    }
    return [r.que, r.kan, r.ans, r.level, r.scope, img, r.note];
  });
  writeFileSync(join(www, 'data', 'sets', kbn + '.json'), JSON.stringify({ scopes: scopesOf(kbn), q }));
  counts[kbn] = q.length;
}

// メニュー（問題の入っている問題集だけ）
const menu = MENU.map(m => ({
  key: m.key, title: m.title, en: m.en, icon: m.icon, color: m.color, lead: m.lead, paid: PAID_CATS.includes(m.key),
  groups: m.groups.map(g => ({ label: g.label, sets: g.sets.filter(k => counts[k]) })).filter(g => g.sets.length)
})).filter(m => m.groups.length);
const sets = Object.fromEntries(Object.keys(counts).map(k => {
  const c = setInfo(k);
  // n … アプリに入っている（無料の）問題の数。all … 会員の範囲も合わせた全部の数（会員の画面に出す）
  return [k, { label: c.label, icon: c.icon, desc: c.desc, n: counts[k], all: scopesOf(k).reduce((a, x) => a + x.n, 0) || counts[k], paid: isPaidSet(k) }];
}));
writeFileSync(join(www, 'data', 'images.json'), JSON.stringify([...images].sort()));
writeFileSync(join(www, 'data', 'menu.json'), JSON.stringify({ menu, sets, built: new Date().toISOString() }));

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`問題集 ${Object.keys(counts).length}・問題 ${total}・図 ${imgCount} 枚（${(imgBytes / 1e6).toFixed(1)} MB）` + (missing ? `・図が見つからない ${missing}` : ''));
