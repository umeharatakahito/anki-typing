// ===============================================================
// appdata.js
// アプリ（mobile/）に、問題を「作り直さなくても」届けるための入口。D1 の問題を直したら、次にアプリを開いたときに届く。
//
//   GET /app/manifest     … { menu, sets: { kbn: { label, icon, desc, n, all, paid, v } }, at }
//                           menu・sets は mobile/www/data/menu.json と同じ形（mobile/scripts/build-data.mjs）。v は問題集の版
//   GET /app/data/<kbn>?v=… … 無料の問題（free = 1）だけ。{ scopes, q, v }（data/sets/<kbn>.json と同じ形。図は URL）
//                           有料の範囲は、これまでどおり会員だけが /app/set/<kbn> で受け取る
//
// 版（v）は set_versions（migrations/0014）。problems・problem_scopes が変わるとトリガーが上げる。
// D1 の無料枠を守るため、どちらも Cache API に持つ：manifest は 5 分、問題は版ごと（版が変わるまで読み直さない）。
// manifest が読むのは set_versions と problem_stats（どちらも問題集の数ほどの行）だけ
// ===============================================================

import { MENU, setInfo, isPaidSet, PAID_CATS, scopesOf } from './sets.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, OPTIONS' };
const MANIFEST_SEC = 300;
const DATA_SEC = 30 * 86400;
const originOf = env => env.PUBLIC_ORIGIN || 'https://studytype.umekobo.com';

// Cache API に持つ（同じ場所のサーバーでは、期限まで D1 を読まない）
async function cached(ctx, key, sec, make) {
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const body = await make();
  const res = new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${sec}`, ...CORS } });
  const put = cache.put(key, res.clone());
  if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  return res;
}

async function versions(env) {
  try { return Object.fromEntries((await env.DB.prepare('SELECT kbn, v FROM set_versions').all()).results.map(r => [r.kbn, r.v])); }
  catch (e) { return {}; }   // まだ 0014 を入れていない
}

async function manifest(env) {
  const [ver, stats] = await Promise.all([versions(env),
    env.DB.prepare('SELECT kbn, SUM(n) AS n, SUM(free_n) AS free_n FROM problem_stats GROUP BY kbn').all().then(r => r.results)]);
  const count = Object.fromEntries(stats.map(r => [r.kbn, r]));
  const sets = {};
  for (const k of new Set(MENU.flatMap(m => m.groups.flatMap(g => g.sets)))) {
    const c = setInfo(k), s = count[k];
    if (!c || c.soon || !s || !s.free_n) continue;
    // n … 無料の問題の数（アプリに入る数）、all … 会員の範囲も合わせた数
    sets[k] = { label: c.label, icon: c.icon, desc: c.desc, n: s.free_n, all: s.n, paid: isPaidSet(k), v: ver[k] || 1 };
  }
  const menu = MENU.map(m => ({
    key: m.key, title: m.title, en: m.en, icon: m.icon, color: m.color, lead: m.lead, paid: PAID_CATS.includes(m.key),
    groups: m.groups.map(g => ({ label: g.label, sets: g.sets.filter(k => sets[k]) })).filter(g => g.sets.length),
  })).filter(m => m.groups.length);
  return { menu, sets, at: Date.now() };
}

async function freeSet(env, kbn) {
  const origin = originOf(env);
  const [rows, scopes, ver] = await Promise.all([
    env.DB.prepare('SELECT que, kan, ans, level, scope, img, note FROM problems WHERE kbn = ? AND free = 1 ORDER BY level, id').bind(kbn).all().then(r => r.results),
    scopesOf(env.DB, kbn), versions(env)]);
  const q = rows.map(r => [r.que, r.kan, r.ans, r.level, r.scope,
    r.img ? (r.img.startsWith('fig/') ? origin + '/' + r.img : origin + '/img/' + r.img + '.png') : '', r.note]);
  return { scopes: scopes.map(s => ({ scope: s.scope, n: s.n, free: s.free })), q, v: ver[kbn] || 1 };
}

export async function handleAppData(request, env, url, ctx) {
  if (request.method !== 'GET') return null;
  if (url.pathname === '/app/manifest') {
    return cached(ctx, new Request(originOf(env) + '/app/manifest'), MANIFEST_SEC, () => manifest(env));
  }
  const m = url.pathname.match(/^\/app\/data\/([\w-]+)$/);
  if (m) {
    const kbn = m[1], c = setInfo(kbn);
    if (!c || c.soon) return new Response(JSON.stringify({ error: '問題集がありません' }), { status: 404, headers: { 'content-type': 'application/json', ...CORS } });
    // 版ごとに持つ（版が変われば URL も変わるので、古い問題が残ることはない）
    const v = String(url.searchParams.get('v') || '').replace(/\D/g, '') || '0';
    return cached(ctx, new Request(originOf(env) + '/app/data/' + kbn + '?v=' + v), DATA_SEC, () => freeSet(env, kbn));
  }
  return null;
}
