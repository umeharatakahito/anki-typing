// ===============================================================
// account.js
// ログイン（Apple・Google）と会員（アプリ内課金）。サーバーは cloudflare/src/app.js（/app/*）。
//
//   ・ログインすると、Web 版と同じアカウントになる（会員の期限・ニックネーム）。合言葉は端末に残し、Authorization: Bearer で送る
//   ・会員になる：App Store で買う（月額 100 円の自動更新／1 年分 1,200 円の自動更新なし）。買ったらサーバーに取引の番号を送り、
//     サーバーが App Store に確かめて会員にする。購入にはアカウントの印（appAccountToken）を付ける
//   ・会員の問題：大学受験・英会話・資格の 🔒 の範囲。会員になったらサーバーからダウンロードして IndexedDB に残す（オフラインでも遊べる）
//   ・アカウントの削除もここから（App Store の決まり）
// ===============================================================

import { show, back, screen, topBar, esc, store, getSets, buzz } from './app.js';
import { icon } from './icons.js';

const SERVER = () => store.get('server', 'https://studytype.umekobo.com');
const BUNDLE = 'com.umeharatakahito.studytype';
export const PRODUCTS = { month: BUNDLE + '.month', pass365: BUNDLE + '.pass365' };
// Google でログイン（iOS 用の OAuth クライアント ID。未設定のうちはボタンを出さない）
const GOOGLE_IOS_CLIENT_ID = '';
const GOOGLE_WEB_CLIENT_ID = '1001255742442-pmd3a71i42mnrqvunrj0fr762uevoi79.apps.googleusercontent.com';
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://studytype.umekobo.com/privacy';

const plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};
const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// app.js と互いに読み込み合うので、保存してある値は最初に使うときに読む（読み込みの途中では store がまだ無い）
let token = null, me;
const ensure = () => { if (token === null) { token = store.get('auth.token', ''); me = store.get('auth.me', null); } };
const listeners = [];
export const onAccountChange = f => listeners.push(f);
function setMe(m) {
  me = m || null;
  store.set('auth.me', me);
  listeners.forEach(f => { try { f(me); } catch (e) {} });
}
export const getMe = () => { ensure(); return me; };
// 会員か。期限は端末の時計でも確かめる（電波が無いときも、切れたら無料版に戻る）
export const isMember = () => { ensure(); return isMemberNow(); };
const isMemberNow = () => !!(me && me.member && (!me.plan || !me.plan.active || me.plan.until > Date.now()));

async function api(path, opt) {
  ensure();
  opt = opt || {};
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(SERVER() + path, { method: opt.body ? 'POST' : (opt.method || 'GET'), headers,
    body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || ('通信できませんでした（' + res.status + '）'));
  return j;
}

// 起動したとき：会員の状態を取り直し、会員なら問題をそろえる
export async function initAccount() {
  ensure();
  if (!token) return;
  try {
    const j = await api('/app/me');
    if (!j.me) { token = ''; store.set('auth.token', ''); setMe(null); return; }
    setMe(j.me);
    if (isMember()) syncMemberSets().catch(() => {});
  } catch (e) { /* 電波が無い：前の状態のまま */ }
}

// ---------------------------------------------------------------
// 会員の問題（IndexedDB）
const DB_NAME = 'studytype', STORE = 'sets';
function idb() {
  return new Promise((ok, ng) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise(ok => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
}
async function idbPut(key, val) {
  const db = await idb();
  return new Promise(ok => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = () => ok(); t.onerror = () => ok(); });
}
// 会員なら、保存してある全部の問題を返す（無ければ null で、アプリの中の無料の問題を使う）
export async function memberSet(kbn) {
  if (!isMember()) return null;
  try { const d = await idbGet('set:' + kbn); return d && d.q ? d : null; } catch (e) { return null; }
}
let syncing = null;
export const syncState = { done: 0, total: 0, error: '' };
export function syncMemberSets(force) {
  if (syncing) return syncing;
  syncing = (async () => {
    const SETS = getSets() || {};
    const kbns = Object.keys(SETS).filter(k => SETS[k].paid);
    syncState.done = 0; syncState.total = kbns.length; syncState.error = '';
    const week = 7 * 86400000;
    for (const k of kbns) {
      const have = await idbGet('set:' + k).catch(() => null);
      if (!force && have && have.at > Date.now() - week) { syncState.done++; continue; }
      try {
        const d = await api('/app/set/' + encodeURIComponent(k));
        await idbPut('set:' + k, Object.assign(d, { at: Date.now() }));
      } catch (e) { syncState.error = e.message; }
      syncState.done++;
    }
    store.set('auth.synced', Date.now());
  })().finally(() => { syncing = null; });
  return syncing;
}

// ---------------------------------------------------------------
// ログイン
async function loginWith(provider, link) {
  const A = plugins().StudyAuth;
  if (!A) throw new Error('この端末ではログインできません');
  let r;
  try {
    r = provider === 'apple' ? await A.signInApple()
      : await A.signInGoogle({ clientId: GOOGLE_IOS_CLIENT_ID, serverClientId: GOOGLE_WEB_CLIENT_ID });
  } catch (e) {
    if (String(e && (e.code || e.message)).includes('canceled')) return null;
    throw e;
  }
  const j = await api('/app/login', { body: { provider, token: r.idToken, name: r.name || '', link: link || undefined } });
  return j;
}
function saveLogin(j) {
  token = j.token; store.set('auth.token', token);
  setMe(j.me);
  if (isMember()) syncMemberSets().catch(() => {});
}

// メールを非公開にした Apple ID：Google のアカウントとつなぐか、Apple だけで使うか
function linkChoice(link, then) {
  const el = screen('', topBar('アカウントをつなぐ') + `<div class="scroll">
    <div class="pay-card"><b>Apple で「メールを非公開」にしてログインしました</b>
      <p>Google でも使ったことがある・会員になったことがある人は、Google でログインすると同じアカウント（会員の期限・ニックネーム）になります。</p>
      ${GOOGLE_IOS_CLIENT_ID ? `<button class="pay-btn google" id="lk-google">${icon('log-in')} Google でログインしてつなぐ</button>` : ''}
      <button class="pay-btn ghost" id="lk-apple">Apple だけで使う</button>
      <p class="pay-msg" id="lk-msg"></p></div></div>`);
  const msg = el.querySelector('#lk-msg');
  const g = el.querySelector('#lk-google');
  if (g) g.onclick = async () => {
    try { const j = await loginWith('google', link); if (j) { saveLogin(j); then(); } } catch (e) { msg.textContent = e.message; }
  };
  el.querySelector('#lk-apple').onclick = async () => {
    try { saveLogin(await api('/app/login/apple-only', { body: { link } })); then(); } catch (e) { msg.textContent = e.message; }
  };
}

function loginButtons() {
  return `<button class="pay-btn apple" id="ac-apple"><svg viewBox="0 0 17 20" aria-hidden="true"><path fill="currentColor" d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C3.6 4.8 2 5.8 1.1 7.4c-1.8 3.2-.5 7.9 1.3 10.5.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.9 3.4-.9s2 .9 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.9-1.1-3-4.2zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>Apple でサインイン</button>
    ${GOOGLE_IOS_CLIENT_ID ? `<button class="pay-btn google" id="ac-google"><b class="g">G</b>Google でログイン</button>` : ''}`;
}
function wireLogin(el, msg, after) {
  const go = provider => async () => {
    msg.textContent = '';
    try {
      const j = await loginWith(provider);
      if (!j) return;
      if (j.needLink) { linkChoice(j.link, after); return; }
      saveLogin(j); after();
    } catch (e) { msg.textContent = e.message; }
  };
  const a = el.querySelector('#ac-apple'), g = el.querySelector('#ac-google');
  if (a) a.onclick = go('apple');
  if (g) g.onclick = go('google');
}

const fmtDay = ms => new Date(ms).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
function planLine() {
  if (!me) return '';
  if (!isMember()) return '無料版';
  const p = me.plan;
  if (!p || !p.active) return '会員（すべての範囲）';
  const name = p.kind === 'month' ? '月額' : '1年分';
  if (p.auto && p.ending) return `${name}・解約済み（${fmtDay(p.until - 2 * 86400000)} まで）`;
  return `${name}・${p.auto ? '次の更新' : '期限'} ${fmtDay(p.auto ? p.until - 2 * 86400000 : p.until)}`;
}

// ---------------------------------------------------------------
// アカウントの画面（メニューから）
export function account() {
  ensure();
  const el = screen('', topBar('アカウント') + `<div class="scroll" id="ac"></div>`);
  const body = el.querySelector('#ac');
  const render = () => {
    if (!me) {
      body.innerHTML = `<div class="pay-card"><b>ログイン</b>
        <p>ログインすると、会員になれます。Web 版と同じアカウントで、会員の期限やニックネームが共有されます。</p>
        ${loginButtons()}<p class="pay-msg" id="ac-msg"></p></div>`;
      wireLogin(body, body.querySelector('#ac-msg'), () => { stackRefresh(); });
      return;
    }
    const p = me.plan;
    body.innerHTML = `<div class="pay-card">
        <div class="ac-who">${icon('user')}<span><b>${esc(me.name)}</b><small>${esc(me.email)}</small></span></div>
        <div class="ac-plan ${isMember() ? 'on' : ''}">${icon(isMember() ? 'badge-check' : 'lock')}<span><b>${esc(planLine())}</b>
          ${isMember() ? `<small id="ac-sync"></small>` : '<small>大学受験・英会話・資格の 🔒 の範囲は、会員になると遊べます</small>'}</span></div>
        ${!isMember() || (p && !p.auto && p.kind === 'pass365') ? `<button class="pay-btn main" id="ac-join">${icon('crown')} ${isMember() ? '1年分を買い足す' : '会員になる'}</button>` : ''}
        ${p && p.auto && p.store === 'apple' ? `<button class="pay-btn ghost" id="ac-manage">サブスクリプションの管理（解約）</button>` : ''}
        <button class="pay-btn ghost" id="ac-restore">購入を復元</button>
        <p class="pay-msg" id="ac-msg"></p></div>
      <div class="pay-card">
        <button class="pay-btn ghost" id="ac-logout">ログアウト</button>
        <button class="pay-btn danger" id="ac-delete">アカウントを削除</button>
      </div>`;
    const msg = body.querySelector('#ac-msg');
    const syncEl = body.querySelector('#ac-sync');
    if (syncEl) {
      const tick = () => {
        if (!document.body.contains(syncEl)) return;
        syncEl.textContent = syncing ? `会員の問題をダウンロード中… ${syncState.done} / ${syncState.total}`
          : syncState.error ? 'ダウンロードできなかった問題があります（電波のあるところで開き直してください）' : 'すべての範囲が遊べます';
        if (syncing) setTimeout(tick, 400);
      };
      tick();
    }
    const join = body.querySelector('#ac-join');
    if (join) join.onclick = () => show(paywall);
    const manage = body.querySelector('#ac-manage');
    if (manage) manage.onclick = () => { const P = plugins().NativePurchases; if (P) P.manageSubscriptions().catch(() => {}); };
    body.querySelector('#ac-restore').onclick = () => restore(msg).then(render);
    body.querySelector('#ac-logout').onclick = async () => {
      if (!confirm('ログアウトしますか？')) return;
      try { await api('/app/logout', { body: {} }); } catch (e) {}
      const A = plugins().StudyAuth; if (A) A.signOutGoogle().catch(() => {});
      token = ''; store.set('auth.token', ''); setMe(null); render();
    };
    body.querySelector('#ac-delete').onclick = async () => {
      const warn = 'アカウントを削除すると、ニックネーム・ランキングの記録・会員の期限が消え、元に戻せません。' +
        (p && p.auto && p.store === 'apple' ? '\n\n月額の自動更新は止まらないので、先に「サブスクリプションの管理」から解約してください。' : '') +
        '\n\n削除しますか？';
      if (!confirm(warn)) return;
      try {
        await api('/app/account/delete', { body: {} });
        token = ''; store.set('auth.token', ''); setMe(null); render();
        alert('アカウントを削除しました');
      } catch (e) { msg.textContent = e.message; }
    };
  };
  const stackRefresh = () => render();
  render();
  if (me) api('/app/me').then(j => { setMe(j.me); render(); }).catch(() => {});
}

// ---------------------------------------------------------------
// 会員になる（購入の画面）
async function restore(msg) {
  const P = plugins().NativePurchases;
  if (!P || !token) { if (msg) msg.textContent = '先にログインしてください'; return; }
  if (msg) msg.textContent = '確認しています…';
  try {
    await P.restorePurchases();
    const { purchases } = await P.getPurchases({});
    let n = 0;
    for (const t of purchases || []) {
      if (!Object.values(PRODUCTS).includes(t.productIdentifier) || !t.transactionId) continue;
      try { const j = await api('/app/iap', { body: { transactionId: String(t.transactionId) } }); setMe(j.me); n++; } catch (e) {}
    }
    if (isMember()) syncMemberSets().catch(() => {});
    if (msg) msg.textContent = n ? (isMember() ? '購入を復元しました' : '有効な購入はありませんでした') : '復元できる購入はありませんでした';
  } catch (e) { if (msg) msg.textContent = e.message; }
}

export function paywall(what) {
  ensure();
  const el = screen('', topBar('会員になる') + `<div class="scroll"><div class="pay-hero">${icon('crown')}<b>会員になって、全部の範囲を</b>
      ${what ? `<small>「${esc(what)}」は会員の範囲です</small>` : ''}</div>
    <ul class="pay-perks">
      <li>${icon('list-checks')}<span><b>大学受験・英会話・資格の全部の範囲</b><small>約 6,400 問が増えます。ダウンロードすればオフラインでも</small></span></li>
      <li>${icon('swords')}<span><b>対戦も全部の範囲で</b><small>部屋を作ると、全部の範囲から出題</small></span></li>
      <li>${icon('eye-off')}<span><b>広告なし</b></span></li>
      <li>${icon('monitor')}<span><b>Web 版でも同じアカウントで会員</b><small>パソコンのブラウザでも全部の範囲</small></span></li>
    </ul>
    <div id="pay-body"></div></div>`);
  const box = el.querySelector('#pay-body');
  if (!me) {
    box.innerHTML = `<div class="pay-card"><b>まずログイン</b><p>会員の期限はアカウントに付くので、ほかの iPhone・iPad や Web 版でも使えます。</p>
      ${loginButtons()}<p class="pay-msg" id="pw-msg"></p></div>`;
    wireLogin(box, box.querySelector('#pw-msg'), () => { back(); show(() => paywall(what)); });
    return;
  }
  const p = me.plan;
  if (p && p.auto && p.active) {   // 月額に入っている（App Store でも Web でも）：もう買えない
    box.innerHTML = `<div class="pay-card"><b>会員です</b><p>${esc(planLine())}</p></div>`;
    return;
  }
  box.innerHTML = `<div class="pay-plans" id="pay-plans"><p class="pay-msg">読み込んでいます…</p></div>
    <p class="pay-msg" id="pw-msg"></p>
    <button class="pay-btn ghost" id="pw-restore">購入を復元</button>
    <p class="pay-legal">月額プランは、期間の終わりの 24 時間前までに解約しない限り、自動で更新され、Apple ID に請求されます。解約は iPhone の「設定」→ 名前 →「サブスクリプション」から。1年分は自動で更新されません（今の期限から 1 年延びます）。<br>
      <a href="${TERMS_URL}" target="_blank" rel="noopener">利用規約（EULA）</a>・<a href="${PRIVACY_URL}" target="_blank" rel="noopener">プライバシーポリシー</a></p>`;
  const msg = box.querySelector('#pw-msg');
  box.querySelector('#pw-restore').onclick = () => restore(msg).then(() => { if (isMember()) { back(); } });
  const P = plugins().NativePurchases;
  const plansEl = box.querySelector('#pay-plans');
  if (!P || !native()) { plansEl.innerHTML = '<p class="pay-msg">この端末では購入できません</p>'; return; }
  P.getProducts({ productIdentifiers: Object.values(PRODUCTS) }).then(({ products }) => {
    const by = Object.fromEntries((products || []).map(x => [x.identifier, x]));
    const m = by[PRODUCTS.month], y = by[PRODUCTS.pass365];
    if (!m && !y) { plansEl.innerHTML = '<p class="pay-msg">いまは購入できません。しばらくしてからお試しください</p>'; return; }
    plansEl.innerHTML = (m && !(p && p.active) ? `<button class="pay-plan best" data-id="${PRODUCTS.month}"><span class="flag">おすすめ</span>
        <b>月額プラン</b><span class="price">${esc(m.priceString)}<small>／月</small></span><small>毎月自動で更新。いつでも解約できます</small></button>` : '')
      + (y ? `<button class="pay-plan" data-id="${PRODUCTS.pass365}"><b>1年分</b><span class="price">${esc(y.priceString)}<small>／1年</small></span>
        <small>自動更新なし。${p && p.active ? '今の期限から 1 年延びます' : '買った日から 1 年'}</small></button>` : '');
    plansEl.querySelectorAll('[data-id]').forEach(b => b.onclick = () => buy(b.dataset.id, b, msg));
  }).catch(e => { plansEl.innerHTML = `<p class="pay-msg">${esc(e.message || '商品を読み込めませんでした')}</p>`; });
}

async function buy(productId, btn, msg) {
  const P = plugins().NativePurchases;
  btn.disabled = true; msg.textContent = '';
  try {
    const t = await P.purchaseProduct({ productIdentifier: productId, quantity: 1, appAccountToken: me.account });
    msg.textContent = '確認しています…';
    const j = await api('/app/iap', { body: { transactionId: String(t.transactionId) } });
    setMe(j.me);
    buzz.ok();
    if (isMember()) syncMemberSets().catch(() => {});
    msg.textContent = '';
    back();
    show(account);
  } catch (e) {
    const s = String(e && e.message || e);
    msg.textContent = /cancel/i.test(s) ? '' : /pending/i.test(s) ? '承認待ちです。承認されると会員になります' : s;
  } finally { btn.disabled = false; }
}
