// ===============================================================
// auth.js
// Google・Apple のログインと会員の判定。
//
//   POST /auth/google   … Google の「ログイン」ボタンが返す ID トークンを確かめて Cookie を渡す
//   GET  /auth/apple    … Apple のログイン画面へ（?to= 戻り先）。APPLE_SERVICES_ID（Services ID）が無ければ使わない
//   POST /auth/apple/callback … Apple から戻ってくる（form_post）。ID トークンを確かめて Cookie を渡す
//                         Apple で「メールを非公開」にした人は …@privaterelay.appleid.com のアドレスになるので、
//                         初めてのときに /auth/link で「Google のアカウントとつなぐ」か「Apple だけで使う」を必ず選んでもらう
//                         （つなぐと、次からも Apple のログインで Google のアカウント＝会員の期限・記録を使う）
//   GET  /auth/link     … その選ぶ画面。POST /auth/link（{ skip: true }）で「Apple だけで使う」、
//                         POST /auth/google（{ credential, link: true }）で Google とつなぐ
//   POST /auth/logout   … Cookie を消す
//   POST /auth/nickname … ランキングに出すニックネームを決める／変える
//   GET  /auth/dev      … 手元（localhost）だけ。DEV_LOGIN=1 のとき ?email= でログインした扱いにする
//
// 会員 … 有料プラン（pay.js。plans.until まで）か、管理者が /admin で登録したメールアドレス。全部の問題が出て、広告が出ない。
// 大学受験 … 会員のうち、管理者が /admin で大学受験モードを許した人（英単語・古文・歴史・対戦）。
// 管理者 … 環境変数 ADMIN_EMAILS（カンマ区切り）のメールアドレス。会員で、大学受験モードも使える。
// ===============================================================

import { checkNickname } from './nickname.js';

const COOKIE = 'st_session';
const SESSION_DAYS = 30;

export const GUEST = { email: '', name: '', member: false, admin: false, juken: false, needsNickname: false, plan: null };

// ---------------------------------------------------------------
// Google の ID トークン（JWT, RS256）を確かめる
let JWKS_ = null, JWKS_UNTIL_ = 0;
async function googleKeys() {
  if (JWKS_ && Date.now() < JWKS_UNTIL_) return JWKS_;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('Google の公開鍵を取れませんでした');
  const age = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  JWKS_ = (await res.json()).keys;
  JWKS_UNTIL_ = Date.now() + age * 1000;
  return JWKS_;
}

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64json = s => JSON.parse(new TextDecoder().decode(b64url(s)));

export async function verifyGoogleToken(token, clientId) {
  const [h, p, sig] = String(token || '').split('.');
  if (!sig) throw new Error('トークンの形が違います');
  const header = b64json(h), claims = b64json(p);
  const jwk = (await googleKeys()).find(k => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') throw new Error('トークンの鍵が見つかりません');
  const key = await crypto.subtle.importKey('jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig),
    new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new Error('トークンの署名が合いません');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw new Error('発行元が違います');
  if (![].concat(clientId).filter(Boolean).includes(claims.aud)) throw new Error('このサイト向けのトークンではありません');
  if (!(claims.exp * 1000 > Date.now())) throw new Error('トークンの期限が切れています');
  if (!claims.email || claims.email_verified === false) throw new Error('メールアドレスが確認できません');
  return { email: String(claims.email).toLowerCase(), name: claims.name || '' };
}

// ---------------------------------------------------------------
// Apple の ID トークン（JWT, RS256）
let APPLE_KEYS_ = null, APPLE_UNTIL_ = 0;
async function appleKeys() {
  if (APPLE_KEYS_ && Date.now() < APPLE_UNTIL_) return APPLE_KEYS_;
  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) throw new Error('Apple の公開鍵を取れませんでした');
  APPLE_KEYS_ = (await res.json()).keys;
  APPLE_UNTIL_ = Date.now() + 3600 * 1000;
  return APPLE_KEYS_;
}

// nonce が null のときは確かめない（アプリの「Apple でサインイン」は Apple の画面が直接トークンを返すので、横取りの心配が無い）
export async function verifyAppleToken(token, clientId, nonce) {
  const [h, p, sig] = String(token || '').split('.');
  if (!sig) throw new Error('トークンの形が違います');
  const header = b64json(h), claims = b64json(p);
  const jwk = (await appleKeys()).find(k => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') throw new Error('トークンの鍵が見つかりません');
  const key = await crypto.subtle.importKey('jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig),
    new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new Error('トークンの署名が合いません');
  if (claims.iss !== 'https://appleid.apple.com') throw new Error('発行元が違います');
  if (claims.aud !== clientId) throw new Error('このサイト向けのトークンではありません');
  if (!(claims.exp * 1000 > Date.now())) throw new Error('トークンの期限が切れています');
  if (nonce !== null && (!nonce || claims.nonce !== nonce)) throw new Error('ログインの手続きが合いません。もう一度お試しください');
  if (!claims.email || String(claims.email_verified) === 'false') throw new Error('メールアドレスが確認できません');
  return { email: String(claims.email).toLowerCase(), name: '', sub: String(claims.sub || '') };
}

export const isRelay = email => /@privaterelay\.appleid\.com$/i.test(email);
const LINK_COOKIE = 'st_link';

const APPLE_COOKIE = 'st_apple';
const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const safeTo = to => String(to || '/').replace(/^(?!\/)/, '/').replace(/^\/\/+/, '/');

// ---------------------------------------------------------------
// セッション
function readCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function sessionCookie(token, url, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function startSession(env, url, who) {
  return sessionCookie(await newSessionToken(env, who), url, SESSION_DAYS * 86400);
}

// ログインした人の記録を残して、セッションの合言葉を作る（Web は Cookie に、アプリは Authorization: Bearer に入れる）
export async function newSessionToken(env, who, days = SESSION_DAYS) {
  // 初めての人は、Google の名前をニックネームの仮の値にしておく
  const now0 = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (email, google_name, nickname, created_at, last_login) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET google_name = excluded.google_name, last_login = excluded.last_login`
  ).bind(who.email, who.name, who.name || who.email.split('@')[0], now0, now0).run();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token, email, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, who.email, who.name, now, now + days * 86400000).run();
  return token;
}

const adminEmails = env => String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

// 今見ている人。ログインしていなければ GUEST
// 手元版（この Mac の wrangler dev。DEV_LOGIN=1）を localhost か家の中から開いたときは、だれでも全部使える
export async function viewerOf(request, env) {
  const v = await sessionViewer(request, env);
  const url = new URL(request.url);
  if (env.DEV_LOGIN === '1' && (isLocal(url) || isHomeLan(env, url))) {
    return Object.assign({}, v, { member: true, admin: true, juken: true });
  }
  return v;
}

// アプリは Cookie を使わず、ログインで受け取った合言葉を Authorization: Bearer で送る
export const bearerToken = request => ((request.headers.get('authorization') || '').match(/^Bearer\s+([0-9a-f]{64})$/i) || [])[1] || '';

async function sessionViewer(request, env) {
  const token = readCookie(request, COOKIE) || bearerToken(request);
  if (!token) return GUEST;
  const s = await env.DB.prepare(
    `SELECT s.email, s.expires_at, u.nickname, u.nickname_set, m.email AS member, m.juken, p.until AS plan_until, p.kind AS plan_kind, p.sub AS plan_sub, p.ending AS plan_ending, p.customer AS plan_customer
       FROM sessions s
       LEFT JOIN users u ON u.email = s.email
       LEFT JOIN members m ON m.email = s.email
       LEFT JOIN plans p ON p.email = s.email
      WHERE s.token = ?`
  ).bind(token).first();
  if (!s || s.expires_at < Date.now()) return GUEST;
  const admin = adminEmails(env).includes(s.email);
  // 有料プラン。until を過ぎたら無料版に戻る
  const plan = s.plan_until ? { until: s.plan_until, kind: s.plan_kind || '', auto: !!s.plan_sub, ending: !!s.plan_ending, active: s.plan_until > Date.now(),
    store: s.plan_customer === 'apple' ? 'apple' : s.plan_customer ? 'stripe' : '' } : null;
  return {
    email: s.email,
    name: s.nickname || s.email.split('@')[0],
    member: admin || !!s.member || !!(plan && plan.active),
    plan,
    admin,
    juken: admin || (!!s.member && !!s.juken),
    needsNickname: !s.nickname_set
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
});

const isLocal = url => ['localhost', '127.0.0.1'].includes(url.hostname);
// 家の中（同じ Wi-Fi）の端末から、この Mac で動かしている手元版に入るとき。LAN_LOGIN=1 のときだけ
const isHomeLan = (env, url) => env.LAN_LOGIN === '1' &&
  /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);

// つなぐ手続きの控えを取り出して消す（1 回だけ使える）
async function takePending(request, env) {
  const token = readCookie(request, LINK_COOKIE);
  if (!token) return null;
  const p = await env.DB.prepare('SELECT * FROM link_pending WHERE token = ? AND expires_at > ?').bind(token, Date.now()).first();
  await env.DB.prepare('DELETE FROM link_pending WHERE token = ? OR expires_at < ?').bind(token, Date.now()).run();
  return p;
}

function linkPage(env, to) {
  const cid = JSON.stringify(String(env.GOOGLE_CLIENT_ID || ''));
  const back = JSON.stringify(to);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>アカウントをつなぐ | STUDY TYPE</title>
<style>
:root{--bg:#f4f7fb;--card:#fff;--ink:#1d2b53;--muted:#5b6785;--line:#dde3ee}
@media (prefers-color-scheme:dark){:root{--bg:#0f1a3d;--card:#1a2650;--ink:#fff;--muted:#b8c2dc;--line:#33427a}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,-apple-system,"Hiragino Sans",sans-serif}
main{max-width:520px;margin:0 auto;padding:32px 16px}
h1{font-size:22px;margin:0 0 6px} p{margin:0 0 10px;color:var(--muted);font-size:14.5px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin:16px 0}
.card h2{font-size:16px;margin:0 0 4px} #gbtn{margin-top:12px;min-height:44px}
button.skip{margin-top:12px;width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
#msg{color:#d9480f;font-weight:700;min-height:1.4em}
</style></head><body><main>
<h1>アカウントをつなぎますか？</h1>
<p>Apple で「メールを非公開」にしてログインしました。このままだと、Google でログインしたときの<b>会員の期限・記録・マイメニュー</b>とは別のアカウントになります。</p>
<div class="card"><h2>Google でも使ったことがある・会員になった</h2>
<p>Google でログインすると、次からは Apple のログインでも同じアカウントで使えます。</p><div id="gbtn"></div></div>
<div class="card"><h2>はじめて使う（Google は使わない）</h2>
<p>Apple だけで使います。会員になるときの支払いのお知らせは、Apple の転送用アドレスに届きます。</p>
<button type="button" class="skip" id="skip">Apple だけで使う</button></div>
<p id="msg"></p>
</main>
<script src="https://accounts.google.com/gsi/client" async onload="gsiReady()"></script>
<script>
var to = ${back}, msg = document.getElementById('msg');
function done(j){ if (j.error) msg.textContent = j.error; else location.href = to; }
function post(path, body){
  return fetch(path, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json(); }).then(done).catch(function(){ msg.textContent = '通信できませんでした'; });
}
function gsiReady(){
  google.accounts.id.initialize({ client_id: ${cid}, callback: function(r){ post('/auth/google', { credential: r.credential, link: true }); } });
  google.accounts.id.renderButton(document.getElementById('gbtn'), { type:'standard', size:'large', text:'signin_with', shape:'pill', locale:'ja' });
}
document.getElementById('skip').onclick = function(){ this.disabled = true; post('/auth/link', { skip: true }); };
</script></body></html>`;
}

// /auth/* を受け持つ。該当しなければ null
export async function handleAuth(request, env, url) {
  if (url.pathname === '/auth/google' && request.method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: 'GOOGLE_CLIENT_ID が設定されていません' }, 500);
    let who, body;
    try {
      body = await request.json();
      who = await verifyGoogleToken(body.credential, [env.GOOGLE_CLIENT_ID, ...String(env.GOOGLE_OLD_CLIENT_IDS || '').split(',')].filter(Boolean));
    } catch (e) {
      return json({ error: 'ログインできませんでした: ' + e.message }, 401);
    }
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    headers.append('set-cookie', await startSession(env, url, who));
    // Apple（メール非公開）でログインした人が、Google のアカウントとつなぐ
    if (body && body.link) {
      const p = await takePending(request, env);
      if (!p) return json({ error: 'つなぐ手続きの期限が切れました。もう一度 Apple でログインしてください' }, 400);
      await env.DB.prepare('INSERT OR REPLACE INTO logins (provider, sub, email, created_at) VALUES (?, ?, ?, ?)')
        .bind('apple', p.sub, who.email, Date.now()).run();
      headers.append('set-cookie', `${LINK_COOKIE}=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  // Apple でログイン：Apple の画面へ送り出す。戻りは別サイトからの POST なので、確かめ用の Cookie は SameSite=None
  if (url.pathname === '/auth/apple' && request.method === 'GET') {
    if (!env.APPLE_SERVICES_ID) return new Response('Apple でのログインは準備中です', { status: 404 });
    const state = randomHex(16), nonce = randomHex(16);
    const to = safeTo(url.searchParams.get('to'));
    const q = new URLSearchParams({
      client_id: env.APPLE_SERVICES_ID, redirect_uri: url.origin + '/auth/apple/callback',
      response_type: 'code id_token', response_mode: 'form_post', scope: 'name email', state, nonce
    });
    return new Response(null, { status: 302, headers: {
      location: 'https://appleid.apple.com/auth/authorize?' + q.toString().replace(/\+/g, '%20'),
      'set-cookie': `${APPLE_COOKIE}=${state}.${nonce}.${encodeURIComponent(to)}; Path=/auth/apple; HttpOnly; Secure; SameSite=None; Max-Age=600`
    } });
  }

  if (url.pathname === '/auth/apple/callback' && request.method === 'POST') {
    const clear = `${APPLE_COOKIE}=; Path=/auth/apple; HttpOnly; Secure; SameSite=None; Max-Age=0`;
    const [state, nonce, toEnc] = readCookie(request, APPLE_COOKIE).split('.');
    const to = safeTo(decodeURIComponent(toEnc || ''));
    const fail = msg => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログインできませんでした</title><body style="font:16px system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px">
<p>${String(msg).replace(/[<>&]/g, '')}</p><p><a href="${to.replace(/"/g, '')}">もとの画面に戻る</a></p></body>`,
      { status: 400, headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': clear } });
    let form;
    try { form = await request.formData(); } catch (e) { return fail('送られた内容が読めません'); }
    if (form.get('error')) return new Response(null, { status: 303, headers: { location: to, 'set-cookie': clear } });   // 取り消した
    if (!state || form.get('state') !== state) return fail('ログインの手続きが合いません。もう一度お試しください');
    let who;
    try {
      who = await verifyAppleToken(form.get('id_token'), env.APPLE_SERVICES_ID, nonce);
      // 名前は初めてのときだけ届く
      const u = JSON.parse(form.get('user') || 'null');
      if (u && u.name) who.name = [u.name.lastName, u.name.firstName].filter(Boolean).join(' ');
    } catch (e) {
      return fail('ログインできませんでした: ' + e.message);
    }
    const headers = new Headers({ location: to });
    headers.append('set-cookie', clear);
    const linked = who.sub && await env.DB.prepare('SELECT email FROM logins WHERE provider = ? AND sub = ?').bind('apple', who.sub).first();
    if (linked) {
      who.email = linked.email;   // つないだ Google のアカウント（か、前に「Apple だけ」を選んだ非公開のアドレス）
    } else if (isRelay(who.email) && who.sub) {
      // メール非公開で初めて：つなぐか選んでもらう（それまではログインしない）
      const token = randomHex(24);
      await env.DB.prepare('INSERT INTO link_pending (token, sub, email, name, expires_at) VALUES (?, ?, ?, ?, ?)')
        .bind(token, who.sub, who.email, who.name || '', Date.now() + 30 * 60000).run();
      headers.set('location', '/auth/link?to=' + encodeURIComponent(to));
      headers.append('set-cookie', `${LINK_COOKIE}=${token}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`);
      return new Response(null, { status: 303, headers });
    } else if (who.sub) {
      await env.DB.prepare('INSERT OR IGNORE INTO logins (provider, sub, email, created_at) VALUES (?, ?, ?, ?)')
        .bind('apple', who.sub, who.email, Date.now()).run();
    }
    headers.append('set-cookie', await startSession(env, url, who));
    return new Response(null, { status: 303, headers });
  }

  // メール非公開の Apple ログインのあと：Google とつなぐか、Apple だけで使うか
  if (url.pathname === '/auth/link' && request.method === 'GET') {
    const token = readCookie(request, LINK_COOKIE);
    const p = token && await env.DB.prepare('SELECT * FROM link_pending WHERE token = ? AND expires_at > ?').bind(token, Date.now()).first();
    const to = safeTo(url.searchParams.get('to'));
    if (!p) return new Response(null, { status: 303, headers: { location: to } });
    return new Response(linkPage(env, to), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }

  if (url.pathname === '/auth/link' && request.method === 'POST') {
    const p = await takePending(request, env);
    if (!p) return json({ error: '手続きの期限が切れました。もう一度 Apple でログインしてください' }, 400);
    await env.DB.prepare('INSERT OR REPLACE INTO logins (provider, sub, email, created_at) VALUES (?, ?, ?, ?)')
      .bind('apple', p.sub, p.email, Date.now()).run();
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    headers.append('set-cookie', await startSession(env, url, { email: p.email, name: p.name }));
    headers.append('set-cookie', `${LINK_COOKIE}=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    const token = readCookie(request, COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', url, 0) });
  }

  if (url.pathname === '/auth/nickname' && request.method === 'POST') {
    const viewer = await viewerOf(request, env);
    if (!viewer.email) return json({ error: 'ログインしてください' }, 401);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: '送られた内容が読めません' }, 400); }
    const res = checkNickname(body.nickname);
    if (res.error) return json(res, 400);
    const taken = await env.DB.prepare('SELECT 1 FROM users WHERE nickname = ? AND nickname_set = 1 AND email <> ?')
      .bind(res.nickname, viewer.email).first();
    if (taken) return json({ error: 'そのニックネームはもう使われています' }, 409);
    await env.DB.prepare('UPDATE users SET nickname = ?, nickname_set = 1 WHERE email = ?')
      .bind(res.nickname, viewer.email).run();
    return json({ ok: true, nickname: res.nickname });
  }

  if (url.pathname === '/auth/dev' && env.DEV_LOGIN === '1' && (isLocal(url) || isHomeLan(env, url))) {
    const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
    // 家の中の端末は Google ログインが使えないので、メールアドレスを入れて入る
    if (!email) return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン（家の中だけ）</title><body style="font:16px system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px">
<h1 style="font-size:1.2rem">Study Type に入る（家の中だけ）</h1>
<p style="font-size:14px;color:#555">この Mac で動いている手元版です。Google のメールアドレスを入れてください。</p>
<form><input type="hidden" name="to" value="${String(url.searchParams.get('to') || '/').replace(/[^\w\/?=&%.-]/g, '')}"><input name="email" type="email" required autofocus placeholder="xxx@gmail.com" style="width:100%;box-sizing:border-box;padding:10px;font-size:16px">
<button style="margin-top:10px;padding:10px 18px;font-size:16px">入る</button></form></body>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } });
    return new Response(null, {
      status: 302,
      headers: { location: (url.searchParams.get('to') || '/').replace(/^(?!\/)/, '/').replace(/^\/\/+/, '/'), 'set-cookie': await startSession(env, url, { email, name: email.split('@')[0] }) }
    });
  }
  return null;
}
