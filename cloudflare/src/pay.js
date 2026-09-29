// ===============================================================
// pay.js
// 有料プラン（Stripe）。会員は、有料の問題集（大学受験・英会話・資格）の全部の範囲が選べて、広告が出ない。
//
//   GET  /plan            … プランの案内と申し込み（?p=plan でも同じ）
//   GET  /legal           … 特定商取引法に基づく表記
//   POST /pay/checkout    … { plan } → Stripe の支払い画面の URL
//   GET  /pay/done        … 支払いのあと戻ってくる。支払いが済んでいれば、その場で会員にする
//   POST /pay/portal      … 月額・年額の解約や、カードの変更（Stripe の画面へ）
//   POST /pay/webhook     … Stripe からの知らせ（署名を確かめる）
//
// プラン（値引きはしない。迷わないよう 2 つだけ）
//   month   … 月額 100 円の自動更新（カード・Apple Pay・Google Pay）。更新の知らせ（invoice.paid）で期限を延ばす
//   pass365 … 1 年分 1,200 円。自動更新しない（PayPay・コンビニ・カード。払えるものは Stripe の設定しだい）。
//             期限の 30 日前から、画面に「あと○日」と出して買い足してもらう（買い足すと今の期限から 1 年延びる）
//
// 環境変数
//   STRIPE_SECRET_KEY      … sk_test_… / sk_live_…（wrangler secret put）。無ければ「準備中」と出す
//   STRIPE_WEBHOOK_SECRET  … whsec_…（wrangler secret put）
//   STRIPE_PASS_METHODS    … 1 年分で使える払い方（例 "card,paypay,konbini"）。無ければ Stripe の設定のまま
//   SELLER_*               … 特定商取引法に基づく表記（SELLER_NAME / SELLER_ADDRESS / SELLER_TEL / SELLER_EMAIL）
// ===============================================================

import { page, LOGO } from './portal.js';
import { icon } from './icons.js';

const DAY = 86400000;
export const PLANS = {
  month:   { label: '月額プラン', price: 100,  per: '月',   mode: 'subscription', interval: 'month', days: 31,
             pay: 'カード・Apple Pay・Google Pay', note: '毎月自動で更新。いつでも解約できます' },
  pass365: { label: '1年分',      price: 1200, per: '1年',  mode: 'payment', days: 366,
             pay: 'PayPay・コンビニ・カード', note: '自動更新なし。カードが無くても買えます' },
};
export const RENEW_NOTICE_DAYS = 30;   // 1 年分の期限がこれより近づいたら「あと○日」と出す
export const GRACE = 2 * DAY;   // 自動更新の支払いが少し遅れても、すぐには切らない

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const fmtDay = ms => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(ms));

// ---------------------------------------------------------------
// Stripe の API（form 形式で送る）
function form(obj, prefix, out) {
  out = out || new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(env, method, path, params) {
  const res = await fetch('https://api.stripe.com/v1/' + path, {
    method,
    headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : form(params || {})
  });
  const body = await res.json();
  if (!res.ok) throw new Error((body.error && body.error.message) || 'Stripe ' + res.status);
  return body;
}

// Stripe-Signature（t=…,v1=…）を確かめる。5 分より古いものは受けない
async function verifySignature(env, header, payload) {
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=')).filter(p => p.length === 2)
    .map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header || '').split(',').filter(p => p.trim().startsWith('v1=')).map(p => p.trim().slice(3));
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(parts.t + '.' + payload)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  return sigs.some(s => s.length === hex.length && [...s].every((c, i) => c === hex[i]));
}

// ---------------------------------------------------------------
// 会員の期限
async function planOf(env, email) {
  return await env.DB.prepare('SELECT * FROM plans WHERE email = ?').bind(email).first();
}
// 同じ支払いを 2 度数えない（知らせと /pay/done のどちらが先でも 1 回だけ）
async function once(env, id) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO pay_events (id, at) VALUES (?, ?)').bind(id, Date.now()).run();
  return r.meta.changes > 0;
}
// 1 年分：今の期限（切れていれば今）から days 日延ばす
async function extend(env, email, kind, days, customer) {
  const p = await planOf(env, email);
  const until = Math.max(Date.now(), (p && p.until) || 0) + days * DAY;
  await env.DB.prepare(
    `INSERT INTO plans (email, until, kind, customer, sub, updated_at) VALUES (?, ?, ?, ?, '', ?)
     ON CONFLICT(email) DO UPDATE SET until = excluded.until, kind = CASE WHEN plans.sub <> '' THEN plans.kind ELSE excluded.kind END,
       customer = CASE WHEN excluded.customer <> '' THEN excluded.customer ELSE plans.customer END, updated_at = excluded.updated_at`
  ).bind(email, until, kind, customer || '', Date.now()).run();
}
// 自動更新：支払った期間の終わり（＋少し）まで。1 年分の残りのほうが長ければそちら
async function setSubscription(env, email, kind, periodEnd, customer, sub) {
  const p = await planOf(env, email);
  const until = Math.max((p && p.until) || 0, periodEnd + GRACE);
  await env.DB.prepare(
    `INSERT INTO plans (email, until, kind, customer, sub, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET until = excluded.until, kind = excluded.kind, customer = excluded.customer, sub = excluded.sub, updated_at = excluded.updated_at`
  ).bind(email, until, kind, customer || '', sub || '', Date.now()).run();
}

// 支払いの済んだ Checkout Session を反映する（知らせからも /pay/done からも呼ぶ）
async function applySession(env, s) {
  const email = String((s.metadata && s.metadata.email) || s.client_reference_id || '').toLowerCase();
  const plan = PLANS[s.metadata && s.metadata.plan];
  if (!email || !plan || s.payment_status !== 'paid') return false;
  if (!(await once(env, 'cs:' + s.id))) return true;
  if (plan.mode === 'payment') await extend(env, email, s.metadata.plan, plan.days, s.customer || '');
  else await setSubscription(env, email, s.metadata.plan, Date.now() + plan.days * DAY, s.customer || '', s.subscription || '');
  return true;
}

// ---------------------------------------------------------------
// 画面
const PLAN_CSS = `<style>
.plan-wrap{max-width:860px;margin:0 auto}
.plan-hero{text-align:center;margin:8px 0 26px}
.plan-hero h1{margin:6px 0 6px;font-size:30px;color:var(--ink);letter-spacing:.02em}
.plan-hero p{margin:0;color:var(--muted)}
.plan-now{margin:0 auto 22px;max-width:620px;padding:14px 18px;border-radius:16px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.plan-now b{color:var(--ink)} .plan-now .grow{flex:1}
.plan-now.ok{border-color:color-mix(in srgb,#12b886 55%,var(--line))}
.plan-now button{padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--chip);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
.perks{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:0 0 26px}
.perk{padding:16px;border-radius:16px;background:var(--card);border:1px solid var(--line)}
.perk .ic{width:26px;height:26px;color:var(--orange)} .perk b{display:block;margin:6px 0 2px;color:var(--ink)} .perk small{color:var(--muted);font-size:13px;line-height:1.5}
.plans{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.plan{position:relative;display:flex;flex-direction:column;gap:6px;padding:20px;border-radius:20px;background:var(--card);border:2px solid var(--line);box-shadow:var(--shadow)}
.plan.best{border-color:var(--orange)}
.plan .flag{position:absolute;top:-11px;left:18px;padding:2px 10px;border-radius:999px;background:var(--orange);color:#fff;font-size:12px;font-weight:800}
.plan h2{margin:0;font-size:17px;color:var(--ink)}
.plan .price{font-size:34px;font-weight:900;color:var(--ink);line-height:1.1} .plan .price small{font-size:14px;color:var(--muted);font-weight:700;margin-left:4px}
.plan p{margin:0;color:var(--muted);font-size:13px}
.plan button{margin-top:auto;padding:12px;border-radius:12px;border:0;font:inherit;font-weight:800;font-size:15px;color:#fff;cursor:pointer;background:linear-gradient(135deg,#ff7a45,#f0561d)}
.plan button.sub{background:var(--navy)}
.plan button[disabled]{opacity:.5;cursor:default}
.plan-h{margin:28px 0 10px;font-size:15px;color:var(--muted)}
.plan-free{margin:26px 0 0;padding:16px 18px;border-radius:16px;border:1px dashed var(--line);color:var(--muted);font-size:13.5px;line-height:1.7}
.plan-free b{color:var(--ink)}
.plan-msg{margin:14px 0 0;text-align:center;color:#d9480f;font-weight:700;min-height:1.4em}
.legal{max-width:760px;margin:0 auto}
.legal h1{font-size:22px;color:var(--ink)}
.legal table{width:100%;border-collapse:collapse;background:var(--card);border-radius:14px;overflow:hidden}
.legal th,.legal td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:14px}
.legal th{width:32%;color:var(--muted);font-weight:700;background:var(--chip)}
@media (max-width:640px){ .perks{grid-template-columns:1fr} .plans{grid-template-columns:1fr} .plan-hero h1{font-size:24px} .legal th{width:38%} }
</style>`;

export function renderPlan(viewer, env, url) {
  const ready = !!env.STRIPE_SECRET_KEY;
  const p = viewer.plan;
  const state = url.searchParams.get('pay');
  let now = '';
  if (viewer.email && viewer.member && p && p.active) {
    const left = Math.ceil((p.until - Date.now()) / DAY);
    const soon = !p.auto && left <= RENEW_NOTICE_DAYS;
    now = `<div class="plan-now ok">${icon('badge-check')}<span class="grow"><b>会員です</b>（${esc((PLANS[p.kind] || {}).label || '会員')}）<br>
      <small>${p.auto ? '次の更新' : '使える期限'}：${fmtDay(p.until)}${soon ? `（<b>あと ${left} 日</b>。下の「1年分」を買うと、今の期限から 1 年延びます）` : ''}</small></span>
      ${p.auto ? '<button type="button" id="pay-portal">解約・カードの変更</button>' : ''}</div>`;
  } else if (viewer.email && viewer.member) {
    now = `<div class="plan-now ok">${icon('badge-check')}<span class="grow"><b>会員です</b>（すべての問題が遊べます）</span></div>`;
  } else if (!viewer.email) {
    now = `<div class="plan-now">${icon('log-in')}<span class="grow">申し込むには、先に<b>右上の「Google でログイン」</b>からログインしてください。</span></div>`;
  }
  if (state === 'pending') now += `<div class="plan-now">${icon('clock')}<span class="grow">お支払いの手続きを受け付けました。コンビニなどで支払いが済むと、会員になります。</span></div>`;
  if (state === 'cancel') now += `<div class="plan-now">${icon('info')}<span class="grow">お申し込みは取り消しました。</span></div>`;

  const locked = !viewer.email || !ready;
  const hasAuto = !!(p && p.active && p.auto);
  const card = (key, best) => {
    const pl = PLANS[key];
    // 月額に入っている間は、どちらも買えない（1 年分に替えるときは、先に月額を解約する）
    const dis = locked || hasAuto;
    return `<div class="plan${best ? ' best' : ''}">${best ? '<span class="flag">おすすめ</span>' : ''}
      <h2>${pl.label}</h2><div class="price">${pl.price.toLocaleString()}円<small>／${pl.per}</small></div>
      <p><b>${pl.pay}</b><br>${pl.note}</p>
      <button type="button" class="${pl.mode === 'subscription' ? 'sub' : ''}" data-plan="${key}"${dis ? ' disabled' : ''}>${pl.mode === 'subscription' ? '月額で申し込む' : '1年分を買う'}</button>
      ${hasAuto && pl.mode === 'payment' ? '<p>月額プランに入っています。1年分に替えるときは、先に月額を解約してください</p>' : ''}</div>`;
  };
  const body = `${PLAN_CSS}
<header class="top-head"><a href="/" aria-label="トップへ">${LOGO}</a></header>
<nav class="crumb"><a id="back" href="/">トップ</a>${icon('chevron-right')}<span>会員プラン</span></nav>
<div class="plan-wrap">
  <section class="plan-hero"><h1>会員になって、全部の範囲を</h1>
    <p>月 100 円。大学受験・英会話・資格の問題集が、全部の範囲から選べます</p></section>
  ${now}
  <div class="perks">
    <div class="perk">${icon('list-checks')}<b>全部の範囲が選べる</b><small>無料版は、はじめのいくつかの範囲だけ。会員は ITパスポートのテクノロジも、世界史の 20 世紀も</small></div>
    <div class="perk">${icon('swords')}<b>対戦も全部の範囲で</b><small>会員が作った部屋は、友達が無料版でも全部の範囲から出ます</small></div>
    <div class="perk">${icon('star')}<b>マイメニュー</b><small>☆ を付けた問題集がトップに並びます。選んだ範囲も、どのブラウザ・スマホでも同じに</small></div>
    <div class="perk">${icon('eye-off')}<b>広告なし</b><small>画面の広告が出なくなります</small></div>
  </div>
  ${ready ? '' : `<div class="plan-now">${icon('construction')}<span class="grow">お支払いの準備中です。もうしばらくお待ちください。</span></div>`}
  <div class="plans">${card('month', true)}${card('pass365')}</div>
  <p class="plan-msg" id="pay-msg"></p>
  <div class="plan-free"><b>ずっと無料</b>：高校受験（中学生向け）と雑学は、会員でなくても全部遊べます。
    大学受験・英会話・資格も、はじめのいくつかの範囲は無料です。<br>
    <a href="/legal">特定商取引法に基づく表記</a>・<a href="/privacy">プライバシーポリシー</a></div>
</div>
<script>
(function(){
  var msg = document.getElementById('pay-msg');
  function go(path, body, btn){
    if (btn) btn.disabled = true; msg.textContent = '';
    fetch(path, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body || {}) })
      .then(function(r){ return r.json(); })
      .then(function(j){ if (j.url) location.href = j.url; else { msg.textContent = j.error || 'うまくいきませんでした'; if (btn) btn.disabled = false; } })
      .catch(function(){ msg.textContent = '通信できませんでした'; if (btn) btn.disabled = false; });
  }
  document.querySelectorAll('[data-plan]').forEach(function(b){ b.addEventListener('click', function(){ go('/pay/checkout', { plan: b.dataset.plan, origin: location.origin }, b); }); });
  var portal = document.getElementById('pay-portal');
  if (portal) portal.addEventListener('click', function(){ go('/pay/portal', { origin: location.origin }, portal); });
})();
</script>`;
  return page('会員プラン | STUDY TYPE', body, 'STUDY TYPE の会員プラン。月100円で、大学受験・英会話・資格の全部の範囲が遊べて、広告も出ません。');
}

export function renderLegal(env) {
  const v = (k, d) => esc(env[k] || d);
  const rows = [
    ['販売事業者', v('SELLER_NAME', '（準備中）')],
    ['運営責任者', v('SELLER_NAME', '（準備中）')],
    ['所在地', v('SELLER_ADDRESS', '請求があれば遅滞なく開示します')],
    ['電話番号', v('SELLER_TEL', '請求があれば遅滞なく開示します')],
    ['メールアドレス', v('SELLER_EMAIL', '（準備中）')],
    ['販売価格', '月額プラン 100 円（税込）／1年分 1,200 円（税込）'],
    ['商品代金以外の必要料金', 'インターネット接続にかかる通信料はお客様のご負担です'],
    ['支払方法', '月額プラン：クレジットカード、Apple Pay、Google Pay。1年分：これらに加えて PayPay・コンビニ払いなど'],
    ['支払時期', '月額プラン：申し込み時と、以後の毎月の更新日に自動で請求します。1年分：購入時（コンビニ払いは支払い期限まで）。自動更新はしません'],
    ['サービスの提供時期', 'お支払いの確認後、すぐに使えます'],
    ['解約・返品', 'デジタルサービスのため、お支払い後の返金はいたしません。月額プランは「会員プラン」の画面からいつでも解約でき、次の更新日からは請求されません（それまでは使えます）'],
    ['動作環境', 'パソコン・スマートフォンの最新のブラウザ（Chrome・Safari・Edge など）'],
  ];
  const body = `${PLAN_CSS}
<header class="top-head"><a href="/" aria-label="トップへ">${LOGO}</a></header>
<nav class="crumb"><a id="back" href="/">トップ</a>${icon('chevron-right')}<a href="/plan">会員プラン</a>${icon('chevron-right')}<span>特定商取引法に基づく表記</span></nav>
<div class="legal"><h1>特定商取引法に基づく表記</h1>
<p style="font-size:13px"><a href="/privacy">プライバシーポリシー</a></p>
<table>${rows.map(([k, x]) => `<tr><th>${k}</th><td>${x}</td></tr>`).join('')}</table></div>`;
  return page('特定商取引法に基づく表記 | STUDY TYPE', body);
}

// プライバシーポリシー（/privacy）。書くのは、このサイトとアプリが実際に集めて残しているものだけ
// （migrations の表・auth.js・chrome.js の広告・typing-versus.js の近くの部屋）。集めるものを変えたら、ここも直す
export function renderPrivacy(env) {
  const v = (k, d) => esc(env[k] || d);
  const sec = (h, body) => `<h2>${h}</h2>${body}`;
  const body = `${PLAN_CSS}
<style>.legal b{display:inline} .legal h2{margin:26px 0 8px;font-size:17px;color:var(--ink)} .legal p,.legal li{font-size:14px;line-height:1.85;color:var(--text)} .legal ul{padding-left:1.3em;margin:6px 0} .legal .date{color:var(--muted);font-size:13px}</style>
<header class="top-head"><a href="/" aria-label="トップへ">${LOGO}</a></header>
<nav class="crumb"><a id="back" href="/">トップ</a>${icon('chevron-right')}<span>プライバシーポリシー</span></nav>
<div class="legal"><h1>プライバシーポリシー</h1>
<p>STUDY TYPE（以下「本サービス」。Web 版 https://studytype.umekobo.com とスマホアプリ）を運営する ${v('SELLER_NAME', '運営者')}（以下「運営者」）は、利用者の情報を次のとおり扱います。</p>
${sec('1. 集める情報', `<ul>
  <li><b>ログインしたとき</b>（Google でログイン）：Google アカウントのメールアドレスと名前。ランキングに出すニックネーム</li>
  <li><b>遊んだ記録</b>：スコア・到達レベル・日時、対戦の結果、苦手な問題の印、選んだ出題範囲・お気に入り（マイメニュー）、画面の色の設定。ログインしていない人の記録は、名前を付けずに残ります</li>
  <li><b>問題の報告</b>：報告の内容と、ログインしていればメールアドレス</li>
  <li><b>有料プラン</b>：プランの種類と期限、決済サービス（Stripe）のお客さま番号。<b>カード番号などの支払い情報は Stripe が扱い、運営者は受け取りません</b></li>
  <li><b>対戦</b>：部屋の中で相手に見える名前（ニックネーム、アプリでは入力した名前）</li>
  <li><b>接続の情報</b>：IP アドレスなど。サーバー（Cloudflare）が通信のために使います。「近くの部屋」（同じ Wi-Fi の部屋を出す機能）では、IP アドレスから作った短い印を、部屋がある間だけ使います。IP アドレスそのものは保存しません</li>
</ul><p>位置情報、電話帳、写真などは集めません。</p>`)}
${sec('2. 使いみち', `<ul>
  <li>ログインの状態を保ち、記録・ランキング・戦績・マイメニューを出すため</li>
  <li>対戦の部屋をつなぐため</li>
  <li>有料プランの会員かどうかを確かめ、期限を管理するため</li>
  <li>問題の誤りを直し、サービスを良くするため</li>
  <li>不正な利用を防ぐため</li>
</ul>`)}
${sec('3. Cookie と端末への保存', `<p>ログインの状態を保つために Cookie（st_session）を使います。画面の色・出題範囲などの設定や、アプリの自己ベストは、利用者の端末（ブラウザの保存領域・アプリ）に保存します。</p>`)}
${sec('4. 広告', `<p>本サービスは、Google が提供する広告サービス「Google AdSense」を使います（有料プランの会員には広告を出しません）。Google などの広告配信事業者は、Cookie を使って広告を配信することがあります。本サービスでは、利用者の興味に合わせた広告（パーソナライズド広告）を求めない設定にしています。Google による広告での情報の使い方は <a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener">Google の広告に関するポリシー</a> を、広告の設定は <a href="https://adssettings.google.com/" target="_blank" rel="noopener">広告設定</a> をご覧ください。</p>`)}
${sec('5. 外部のサービス', `<p>本サービスは次のサービスを使い、その中で必要な情報が扱われます。</p><ul>
  <li>Google（ログイン・広告）</li><li>Stripe（有料プランの決済）</li><li>Cloudflare（サーバー・データの保存）</li></ul>`)}
${sec('6. 第三者への提供', `<p>法令にもとづく場合を除き、本人の同意なく個人情報を第三者に提供しません。ランキングや対戦では、ニックネーム（名前）とスコアがほかの利用者に見えます。</p>`)}
${sec('7. 未成年の方', `<p>中学生・高校生などの未成年の方が有料プランを申し込むときは、保護者の方の同意を得てください。</p>`)}
${sec('8. 情報の確認・削除', `<p>ご自身の情報の確認・訂正・削除（アカウントと記録の削除）を希望するときは、下の問い合わせ先までご連絡ください。ご本人であることを確かめたうえで対応します。</p>`)}
${sec('9. 安全のために', `<p>通信は暗号化（https）しています。パスワードは本サービスでは保存しません（ログインは Google で行います）。</p>`)}
${sec('10. 変更', `<p>このポリシーは、必要に応じて変えることがあります。変えたときは、このページでお知らせします。</p>`)}
${sec('11. 問い合わせ先', `<p>${v('SELLER_NAME', '運営者')}<br>メール：${v('SELLER_EMAIL', '（準備中）')}</p>`)}
<p class="date">2026年9月29日 制定</p>
</div>`;
  return page('プライバシーポリシー | STUDY TYPE', body, 'STUDY TYPE のプライバシーポリシー');
}

// ---------------------------------------------------------------
// /pay/* を受け持つ。該当しなければ null
export async function handlePay(request, env, url, viewer) {
  if (!url.pathname.startsWith('/pay/')) return null;
  // 戻り先。手元の wrangler dev は request.url・Origin からポート番号を消すので、画面が送る location.origin を使う
  // （ホスト名が同じときだけ。本番では url.origin と同じになる）
  const originOf = body => {
    const asked = String((body && body.origin) || '');
    return /^https?:\/\/[^/]+$/.test(asked) && new URL(asked).hostname === url.hostname ? asked : url.origin;
  };

  if (url.pathname === '/pay/webhook' && request.method === 'POST') {
    const payload = await request.text();
    if (!env.STRIPE_WEBHOOK_SECRET || !(await verifySignature(env, request.headers.get('stripe-signature'), payload))) {
      return new Response('bad signature', { status: 400 });
    }
    const ev = JSON.parse(payload);
    const o = ev.data && ev.data.object || {};
    try {
      if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
        await applySession(env, o);
      } else if (ev.type === 'invoice.paid' || ev.type === 'invoice.payment_succeeded') {
        // 自動更新の支払い。だれのものかは、申し込みのとき付けた印（subscription の metadata）かメールアドレスで
        const meta = (o.parent && o.parent.subscription_details && o.parent.subscription_details.metadata) || o.subscription_details && o.subscription_details.metadata || {};
        const email = String(meta.email || o.customer_email || '').toLowerCase();
        const line = o.lines && o.lines.data && o.lines.data[0];
        const end = line && line.period && line.period.end;
        const sub = o.subscription || (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription) || '';
        if (email && end && PLANS[meta.plan]) await setSubscription(env, email, meta.plan, end * 1000, o.customer || '', sub);
      } else if (ev.type === 'customer.subscription.deleted') {
        // 解約。払った期間の終わりまでは使える（until はそのまま）
        await env.DB.prepare(`UPDATE plans SET sub = '', updated_at = ? WHERE sub = ?`).bind(Date.now(), o.id).run();
      }
    } catch (e) {
      return new Response('error: ' + e.message, { status: 500 });   // Stripe が送り直してくれる
    }
    return json({ received: true });
  }

  if (!env.STRIPE_SECRET_KEY) return json({ error: 'お支払いの準備中です' }, 503);

  if (url.pathname === '/pay/checkout' && request.method === 'POST') {
    if (!viewer.email) return json({ error: '先にログインしてください' }, 401);
    let body = {};
    try { body = await request.json(); } catch (e) { /* 空 */ }
    const key = String(body.plan || '');
    const origin = originOf(body);
    const pl = PLANS[key];
    if (!pl) return json({ error: 'プランが違います' }, 400);
    const cur = await planOf(env, viewer.email);
    if (cur && cur.sub && cur.until > Date.now()) {
      return json({ error: pl.mode === 'subscription' ? 'もう月額プランに入っています' : '月額プランに入っています。1年分に替えるときは、先に月額を解約してください' }, 409);
    }
    const params = {
      mode: pl.mode, locale: 'ja',
      // Managed Payments（Stripe が売り手になって税を扱う有料の仕組み。新しいアカウントは最初から有効）は使わない。
      // 値段は税込みで決めてある
      managed_payments: { enabled: false },
      success_url: origin + '/pay/done?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/plan?pay=cancel',
      client_reference_id: viewer.email,
      metadata: { email: viewer.email, plan: key },
      line_items: { 0: { quantity: 1, price_data: {
        currency: 'jpy', unit_amount: pl.price,
        product_data: { name: 'STUDY TYPE ' + pl.label },
        recurring: pl.mode === 'subscription' ? { interval: pl.interval } : null
      } } },
    };
    if (cur && cur.customer) params.customer = cur.customer;
    else if (pl.mode === 'subscription') params.customer_email = viewer.email;
    else { params.customer_email = viewer.email; params.customer_creation = 'always'; }
    if (pl.mode === 'subscription') params.subscription_data = { metadata: { email: viewer.email, plan: key } };
    else {
      params.payment_intent_data = { metadata: { email: viewer.email, plan: key } };
      const methods = String(env.STRIPE_PASS_METHODS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (methods.length) params.payment_method_types = Object.fromEntries(methods.map((m, i) => [i, m]));
    }
    try {
      const s = await stripe(env, 'POST', 'checkout/sessions', params);
      return json({ url: s.url });
    } catch (e) {
      return json({ error: '支払い画面を開けませんでした: ' + e.message }, 502);
    }
  }

  if (url.pathname === '/pay/done' && request.method === 'GET') {
    const id = String(url.searchParams.get('session_id') || '');
    let to = '/plan';
    if (/^cs_[\w]+$/.test(id)) {
      try {
        const s = await stripe(env, 'GET', 'checkout/sessions/' + id);
        const mine = viewer.email && String(s.client_reference_id || '').toLowerCase() === viewer.email;
        if (mine && await applySession(env, s)) to = '/plan?pay=ok';
        else if (mine && s.status === 'complete') to = '/plan?pay=pending';
      } catch (e) { /* 知らせのほうで反映される */ }
    }
    return new Response(null, { status: 303, headers: { location: to } });
  }

  if (url.pathname === '/pay/portal' && request.method === 'POST') {
    if (!viewer.email) return json({ error: '先にログインしてください' }, 401);
    let body = {};
    try { body = await request.json(); } catch (e) { /* 空 */ }
    const origin = originOf(body);
    const cur = await planOf(env, viewer.email);
    if (!cur || !cur.customer) return json({ error: '自動更新のプランがありません' }, 404);
    try {
      const s = await stripe(env, 'POST', 'billing_portal/sessions', { customer: cur.customer, return_url: origin + '/plan', locale: 'ja' });
      return json({ url: s.url });
    } catch (e) {
      return json({ error: '手続きの画面を開けませんでした: ' + e.message }, 502);
    }
  }
  return new Response('Not Found', { status: 404 });
}
