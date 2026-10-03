// ===============================================================
// app.js
// iPhone・iPad アプリ（mobile/）のための入口。ログイン・会員の問題のダウンロード・アプリ内課金（App Store）。
// アプリは Cookie を使わず、ログインで受け取った合言葉を Authorization: Bearer で送る（auth.js の bearerToken）。
//
//   POST /app/login          … { provider: 'apple'|'google', token, name?, link? } → { token, me }
//                              Apple でメールを非公開にした初めての人は { needLink, link } を返す（Web 版の /auth/link と同じ考え）。
//                              Google でログインするとき link を付けると、その Apple のログインを Google のアカウントにつなぐ
//   POST /app/login/apple-only … { link } → Apple の非公開アドレスのまま使う
//   GET  /app/me             … { me }（会員かどうか・期限・appAccountToken）
//   POST /app/logout
//   POST /app/account/delete … アカウントと記録を消す
//   GET  /app/set/<kbn>      … 会員だけ。問題集の全部の問題（mobile/www/data/sets/<kbn>.json と同じ形。図は URL）
//   POST /app/iap            … { transactionId } 買ったあとにアプリが送る。App Store Server API に問い合わせて会員にする
//   POST /app/iap/notify     … App Store Server Notifications V2（月額の更新・解約・返金）
//
// 商品（App Store Connect）
//   <bundle>.month    … 月額 100 円の自動更新サブスク（Web 版の month と同じ扱い）
//   <bundle>.pass365  … 1 年分 1,200 円の自動更新なしサブスク（Web 版の pass365 と同じ。今の期限から 366 日延ばす）
//
// 環境変数
//   APPLE_BUNDLE_ID       … com.umeharatakahito.studytype（Apple でサインインの aud・商品 ID の頭）
//   GOOGLE_IOS_CLIENT_ID  … アプリの Google ログイン（iOS 用の OAuth クライアント ID）。トークンの aud は Web の GOOGLE_CLIENT_ID でもよい
//   APPLE_IAP_KEY_ID / APPLE_IAP_ISSUER_ID / APPLE_IAP_PRIVATE_KEY（secret、.p8 の中身）… App Store Server API の鍵
// ===============================================================

import { verifyAppleToken, verifyGoogleToken, newSessionToken, bearerToken, isRelay, viewerOf } from './auth.js';
import { scopesOf, setInfo, isPaidSet } from './sets.js';
import { PLANS, GRACE } from './pay.js';

const DAY = 86400000;
const APP_SESSION_DAYS = 365;
// アプリの画面（capacitor://localhost）から呼ぶので CORS を許す。Cookie は使わない（Bearer）ので * でよい
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' };
const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS }
});
const bundleOf = env => env.APPLE_BUNDLE_ID || 'com.umeharatakahito.studytype';
const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const b64urlBytes = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const jwsPayload = jws => JSON.parse(new TextDecoder().decode(b64urlBytes(String(jws || '').split('.')[1] || '')));

// 購入に付ける appAccountToken。メールアドレスから毎回同じ UUID を作り、逆引きの表にも残す
async function accountToken(env, email) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('studytype:' + email)));
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;   // UUID の形（version 5 風）
  const x = [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  const token = `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
  await env.DB.prepare('INSERT OR IGNORE INTO app_accounts (token, email, created_at) VALUES (?, ?, ?)')
    .bind(token, email, Date.now()).run();
  return token;
}

async function meOf(env, viewer) {
  if (!viewer.email) return null;
  const p = viewer.plan;
  return {
    email: viewer.email, name: viewer.name, member: !!viewer.member,
    plan: p ? { kind: p.kind, until: p.until, auto: p.auto, ending: !!p.ending, active: p.active,
                store: p.store } : null,
    account: await accountToken(env, viewer.email)
  };
}

async function loginResponse(env, request, who) {
  const token = await newSessionToken(env, who, APP_SESSION_DAYS);
  const headers = new Headers(request.headers);
  headers.set('authorization', 'Bearer ' + token);
  headers.delete('cookie');
  const viewer = await viewerOf(new Request(request.url, { headers }), env);
  return json({ token, me: await meOf(env, viewer) });
}

async function pendingLink(env, link) {
  if (!/^[0-9a-f]{48}$/.test(String(link || ''))) return null;
  const p = await env.DB.prepare('SELECT * FROM link_pending WHERE token = ? AND expires_at > ?').bind(link, Date.now()).first();
  await env.DB.prepare('DELETE FROM link_pending WHERE token = ? OR expires_at < ?').bind(link, Date.now()).run();
  return p;
}

// ---------------------------------------------------------------
// App Store Server API（取引を Apple に問い合わせる。返ってきた中身は TLS で守られているので、そのまま信じる）
async function storeJwt(env) {
  const pem = String(env.APPLE_IAP_PRIVATE_KEY || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (!pem || !env.APPLE_IAP_KEY_ID || !env.APPLE_IAP_ISSUER_ID) throw new Error('App Store の鍵が設定されていません');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = o => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const head = enc({ alg: 'ES256', kid: env.APPLE_IAP_KEY_ID, typ: 'JWT' });
  const body = enc({ iss: env.APPLE_IAP_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1', bid: bundleOf(env) });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + body)));
  return head + '.' + body + '.' + btoa(String.fromCharCode(...sig)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const HOSTS = ['https://api.storekit.itunes.apple.com', 'https://api.storekit-sandbox.itunes.apple.com'];
async function storeGet(env, path) {
  const jwt = await storeJwt(env);
  let last = '';
  for (const host of HOSTS) {   // 本番で見つからなければ Sandbox（審査とテストの購入）
    const res = await fetch(host + path, { headers: { authorization: 'Bearer ' + jwt } });
    if (res.ok) return await res.json();
    last = res.status + ' ' + (await res.text()).slice(0, 200);
    if (res.status !== 404 && res.status !== 401) break;   // 配信前のアプリは本番が 401 を返す
  }
  throw new Error('App Store に問い合わせられませんでした: ' + last);
}

const kindOf = (env, productId) => {
  const k = String(productId || '').replace(bundleOf(env) + '.', '');
  return PLANS[k] ? k : '';
};

// 月額：最後の支払いの期間の終わり（＋少し）まで。sub に 'apple:<元の取引 ID>' を入れて、更新の知らせと結び付ける
async function applySubscription(env, email, tx, renewing) {
  const until = tx.revocationDate ? Date.now() : (tx.expiresDate || 0) + GRACE;
  const p = await env.DB.prepare('SELECT * FROM plans WHERE email = ?').bind(email).first();
  const keep = p && p.until > until && !(p.sub || '').startsWith('apple:') ? p.until : until;   // 1 年分の残りが長ければそちら
  await env.DB.prepare(
    `INSERT INTO plans (email, until, kind, customer, sub, updated_at, ending) VALUES (?, ?, 'month', 'apple', ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET until = excluded.until, kind = 'month', customer = 'apple', sub = excluded.sub,
       updated_at = excluded.updated_at, ending = excluded.ending`
  ).bind(email, keep, renewing && !tx.revocationDate ? 'apple:' + tx.originalTransactionId : '', Date.now(), renewing ? 0 : 1).run();
}
// 1 年分：今の期限（切れていれば今）から 366 日。同じ取引は 1 回だけ
async function applyPass(env, email, tx) {
  const once = await env.DB.prepare('INSERT OR IGNORE INTO pay_events (id, at) VALUES (?, ?)').bind('apple:' + tx.transactionId, Date.now()).run();
  if (!once.meta.changes) return;
  const p = await env.DB.prepare('SELECT * FROM plans WHERE email = ?').bind(email).first();
  const until = Math.max(Date.now(), (p && p.until) || 0) + PLANS.pass365.days * DAY;
  await env.DB.prepare(
    `INSERT INTO plans (email, until, kind, customer, sub, updated_at) VALUES (?, ?, 'pass365', 'apple', '', ?)
     ON CONFLICT(email) DO UPDATE SET until = excluded.until,
       kind = CASE WHEN plans.sub <> '' THEN plans.kind ELSE 'pass365' END, updated_at = excluded.updated_at`
  ).bind(email, until, Date.now()).run();
}

// 月額の今の状態を Apple から取り直して反映する（買った直後・更新・解約・返金のどれでも同じ）
async function syncSubscription(env, email, originalTransactionId) {
  const st = await storeGet(env, '/inApps/v1/subscriptions/' + encodeURIComponent(originalTransactionId));
  let best = null;
  for (const g of st.data || []) for (const t of g.lastTransactions || []) {
    const tx = jwsPayload(t.signedTransactionInfo), ri = t.signedRenewalInfo ? jwsPayload(t.signedRenewalInfo) : {};
    if (!best || (tx.expiresDate || 0) > (best.tx.expiresDate || 0)) best = { tx, ri, status: t.status };
  }
  if (!best) return;
  // status 1 有効・3 支払いのやり直し中・4 猶予期間 は「続いている」。autoRenewStatus 0 は解約済み（期間の終わりで止まる）
  const renewing = [1, 3, 4].includes(best.status) && best.ri.autoRenewStatus !== 0;
  await applySubscription(env, email, best.tx, renewing);
}

async function emailOfTx(env, tx, viewer) {
  if (tx.appAccountToken) {
    const r = await env.DB.prepare('SELECT email FROM app_accounts WHERE token = ?').bind(String(tx.appAccountToken).toLowerCase()).first();
    if (r) return r.email;
  }
  const r = await env.DB.prepare('SELECT email FROM plans WHERE sub = ?').bind('apple:' + tx.originalTransactionId).first();
  return r ? r.email : (viewer && viewer.email) || '';
}

// ---------------------------------------------------------------
export async function handleApp(request, env, url, viewer) {
  if (!url.pathname.startsWith('/app/')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (url.pathname === '/app/login' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: '送られた内容が読めません' }, 400); }
    try {
      if (body.provider === 'apple') {
        const who = await verifyAppleToken(body.token, bundleOf(env), null);
        if (body.name) who.name = String(body.name).slice(0, 40);
        const linked = who.sub && await env.DB.prepare('SELECT email FROM logins WHERE provider = ? AND sub = ?').bind('apple', who.sub).first();
        if (linked) who.email = linked.email;
        else if (isRelay(who.email) && who.sub) {
          const link = randomHex(24);
          await env.DB.prepare('INSERT INTO link_pending (token, sub, email, name, expires_at) VALUES (?, ?, ?, ?, ?)')
            .bind(link, who.sub, who.email, who.name || '', Date.now() + 30 * 60000).run();
          return json({ needLink: true, link });
        } else if (who.sub) {
          await env.DB.prepare('INSERT OR IGNORE INTO logins (provider, sub, email, created_at) VALUES (?, ?, ?, ?)')
            .bind('apple', who.sub, who.email, Date.now()).run();
        }
        return await loginResponse(env, request, who);
      }
      if (body.provider === 'google') {
        const who = await verifyGoogleToken(body.token, [env.GOOGLE_IOS_CLIENT_ID, env.GOOGLE_CLIENT_ID]);
        if (body.link) {
          const p = await pendingLink(env, body.link);
          if (!p) return json({ error: 'つなぐ手続きの期限が切れました。もう一度 Apple でログインしてください' }, 400);
          await env.DB.prepare('INSERT OR REPLACE INTO logins (provider, sub, email, created_at) VALUES (?, ?, ?, ?)')
            .bind('apple', p.sub, who.email, Date.now()).run();
        }
        return await loginResponse(env, request, who);
      }
      return json({ error: 'ログインの種類が違います' }, 400);
    } catch (e) {
      return json({ error: 'ログインできませんでした: ' + e.message }, 401);
    }
  }

  if (url.pathname === '/app/login/apple-only' && request.method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (e) { /* 空 */ }
    const p = await pendingLink(env, body.link);
    if (!p) return json({ error: '手続きの期限が切れました。もう一度 Apple でログインしてください' }, 400);
    await env.DB.prepare('INSERT OR REPLACE INTO logins (provider, sub, email, created_at) VALUES (?, ?, ?, ?)')
      .bind('apple', p.sub, p.email, Date.now()).run();
    return await loginResponse(env, request, { email: p.email, name: p.name });
  }

  if (url.pathname === '/app/me' && request.method === 'GET') {
    return json({ me: await meOf(env, viewer) });
  }

  if (url.pathname === '/app/logout' && request.method === 'POST') {
    const token = bearerToken(request);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return json({ ok: true });
  }

  // アカウントの削除（App Store の決まりで、アプリから消せるようにする）。会員の期限・記録も消える。
  // App Store の月額は Apple 側で止まらないので、アプリが先に解約を案内する
  if (url.pathname === '/app/account/delete' && request.method === 'POST') {
    if (!viewer.email) return json({ error: '先にログインしてください' }, 401);
    const e = viewer.email;
    await env.DB.batch([
      'DELETE FROM sessions WHERE email = ?', 'DELETE FROM users WHERE email = ?', 'DELETE FROM user_prefs WHERE email = ?',
      'DELETE FROM logins WHERE email = ?', 'DELETE FROM plans WHERE email = ?', 'DELETE FROM user_sets WHERE email = ?',
      'DELETE FROM marks WHERE email = ?', 'DELETE FROM app_accounts WHERE email = ?', 'DELETE FROM vs_results WHERE email = ?',
      'DELETE FROM scores WHERE email = ?'
    ].map(q => env.DB.prepare(q).bind(e)));
    return json({ ok: true });
  }

  // 会員の問題（有料の範囲も含めて全部）。アプリはこれを端末に保存して、オフラインでも遊べるようにする
  const set = url.pathname.match(/^\/app\/set\/([\w-]+)$/);
  if (set && request.method === 'GET') {
    const kbn = set[1];
    if (!setInfo(kbn)) return json({ error: '問題集がありません' }, 404);
    if (!viewer.member) return json({ error: '会員になると遊べます' }, 403);
    const rows = (await env.DB.prepare('SELECT que, kan, ans, level, scope, img, note FROM problems WHERE kbn = ? ORDER BY level, id')
      .bind(kbn).all()).results;
    const origin = env.PUBLIC_ORIGIN || 'https://studytype.umekobo.com';
    const q = rows.map(r => [r.que, r.kan, r.ans, r.level, r.scope,
      r.img ? (r.img.startsWith('fig/') ? origin + '/' + r.img : origin + '/img/' + r.img + '.png') : '', r.note]);
    return json({ scopes: (await scopesOf(env.DB, kbn)).map(s => ({ scope: s.scope, n: s.n, free: s.free })), q, paid: isPaidSet(kbn) });
  }

  // 買ったあと（と「購入を復元」のとき）にアプリが送る
  if (url.pathname === '/app/iap' && request.method === 'POST') {
    if (!viewer.email) return json({ error: '先にログインしてください' }, 401);
    let body = {};
    try { body = await request.json(); } catch (e) { /* 空 */ }
    const id = String(body.transactionId || '');
    if (!/^\d{1,30}$/.test(id)) return json({ error: '取引の番号が違います' }, 400);
    try {
      const tx = jwsPayload((await storeGet(env, '/inApps/v1/transactions/' + id)).signedTransactionInfo);
      if (tx.bundleId !== bundleOf(env)) return json({ error: 'このアプリの購入ではありません' }, 400);
      const kind = kindOf(env, tx.productId);
      if (!kind) return json({ error: '商品が違います' }, 400);
      const mine = await accountToken(env, viewer.email);
      if (tx.appAccountToken && String(tx.appAccountToken).toLowerCase() !== mine) {
        return json({ error: 'この購入は別のアカウントのものです' }, 409);
      }
      if (kind === 'month') await syncSubscription(env, viewer.email, tx.originalTransactionId);
      else if (!tx.revocationDate) await applyPass(env, viewer.email, tx);
      const v = await viewerOf(request, env);
      return json({ ok: true, me: await meOf(env, v) });
    } catch (e) {
      return json({ error: e.message }, 502);
    }
  }

  // App Store Server Notifications V2。中身は信じず、取引の番号だけ取って Apple に問い合わせ直す
  if (url.pathname === '/app/iap/notify' && request.method === 'POST') {
    try {
      const body = await request.json();
      const n = jwsPayload(body.signedPayload);
      const info = n.data && n.data.signedTransactionInfo ? jwsPayload(n.data.signedTransactionInfo) : null;
      if (!info || !info.transactionId) return json({ ok: true });
      const tx = jwsPayload((await storeGet(env, '/inApps/v1/transactions/' + encodeURIComponent(info.transactionId))).signedTransactionInfo);
      if (tx.bundleId !== bundleOf(env)) return json({ ok: true });
      const email = await emailOfTx(env, tx, null);
      if (!email) return json({ ok: true });
      const kind = kindOf(env, tx.productId);
      if (kind === 'month') await syncSubscription(env, email, tx.originalTransactionId);
      else if (kind === 'pass365' && tx.revocationDate) {
        await env.DB.prepare('UPDATE plans SET until = ?, updated_at = ? WHERE email = ? AND sub = \'\'').bind(Date.now(), Date.now(), email).run();
      }
      return json({ ok: true });
    } catch (e) {
      return json({ error: e.message }, 500);   // Apple が送り直してくれる
    }
  }

  return json({ error: 'Not Found' }, 404);
}
