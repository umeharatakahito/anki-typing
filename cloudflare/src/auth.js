// ===============================================================
// auth.js
// Google ログインと会員の判定。
//
//   POST /auth/google   … Google の「ログイン」ボタンが返す ID トークンを確かめて Cookie を渡す
//   POST /auth/logout   … Cookie を消す
//   GET  /auth/dev      … 手元（localhost）だけ。DEV_LOGIN=1 のとき ?email= でログインした扱いにする
//
// 会員 … 管理者が /admin で登録したメールアドレス。全部の問題が出て、広告が出ない。
// 管理者 … 環境変数 ADMIN_EMAILS（カンマ区切り）のメールアドレス。会員でもある。
// ===============================================================

const COOKIE = 'st_session';
const SESSION_DAYS = 30;

export const GUEST = { email: '', name: '', member: false, admin: false };

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

async function verifyGoogleToken(token, clientId) {
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
  if (claims.aud !== clientId) throw new Error('このサイト向けのトークンではありません');
  if (!(claims.exp * 1000 > Date.now())) throw new Error('トークンの期限が切れています');
  if (!claims.email || claims.email_verified === false) throw new Error('メールアドレスが確認できません');
  return { email: String(claims.email).toLowerCase(), name: claims.name || '' };
}

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
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token, email, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, who.email, who.name, now, now + SESSION_DAYS * 86400000).run();
  return sessionCookie(token, url, SESSION_DAYS * 86400);
}

const adminEmails = env => String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

// 今見ている人。ログインしていなければ GUEST
export async function viewerOf(request, env) {
  const token = readCookie(request, COOKIE);
  if (!token) return GUEST;
  const s = await env.DB.prepare('SELECT email, name, expires_at FROM sessions WHERE token = ?').bind(token).first();
  if (!s || s.expires_at < Date.now()) return GUEST;
  const admin = adminEmails(env).includes(s.email);
  const member = admin || !!(await env.DB.prepare('SELECT 1 FROM members WHERE email = ?').bind(s.email).first());
  return { email: s.email, name: s.name, member, admin };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
});

const isLocal = url => ['localhost', '127.0.0.1'].includes(url.hostname);

// /auth/* を受け持つ。該当しなければ null
export async function handleAuth(request, env, url) {
  if (url.pathname === '/auth/google' && request.method === 'POST') {
    if (!env.GOOGLE_CLIENT_ID) return json({ error: 'GOOGLE_CLIENT_ID が設定されていません' }, 500);
    let who;
    try {
      const body = await request.json();
      who = await verifyGoogleToken(body.credential, env.GOOGLE_CLIENT_ID);
    } catch (e) {
      return json({ error: 'ログインできませんでした: ' + e.message }, 401);
    }
    return json({ ok: true }, 200, { 'set-cookie': await startSession(env, url, who) });
  }

  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    const token = readCookie(request, COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', url, 0) });
  }

  if (url.pathname === '/auth/dev' && env.DEV_LOGIN === '1' && isLocal(url)) {
    const email = String(url.searchParams.get('email') || '').toLowerCase();
    if (!email) return new Response('?email= を付けてください', { status: 400 });
    return new Response(null, {
      status: 302,
      headers: { location: url.searchParams.get('to') || '/', 'set-cookie': await startSession(env, url, { email, name: email.split('@')[0] }) }
    });
  }
  return null;
}
