// ===============================================================
// chrome.js
// どの画面にも差し込む部品。
//   ・上のロゴ   … どの画面にも出す、トップへのリンク（トップ・分類ページは自前のロゴがあるので出さない）
//   ・右上のバー … Google ログイン／ログアウト、会員かどうか、色の切り替え
//   ・広告枠   … 会員でない人だけ。下の横長（どの画面も）、左右の縦長（広い画面のときだけ）、
//               画面の中の枠（data-st-ad="result" など。見えたときに中身を入れる）
// どちらもタイピング中は隠す（画面の「やめる」ボタンなどに重ならないように）
// AdSense は ADSENSE_CLIENT（ca-pub-…）と ADSENSE_SLOT（数字）が両方あるときだけ本物を出し、
// 枠ごとの広告ユニット ADSENSE_SLOT_RAIL / _RESULT / _LOBBY があればそれを、無ければ ADSENSE_SLOT を使う。
// 無ければ「広告枠」の見本を出す（mars-run の AdRail と同じ考え方）。
// ===============================================================

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const THEMES = ['blue', 'dark'];

// <html> に付ける色の指定。会員はアカウントの設定、それ以外はブラウザの設定（画面側で読む）
export function themeAttr(theme) {
  return THEMES.includes(theme) ? ` data-theme="${theme}"` : '';
}

const CSS = `<style>
/* 色は大学受験モード（JukenCSS / ThemeCSS）と同じ値 */
:root,[data-theme="blue"]{--st-accent:#1ba9cc;--st-chip-bg:#fff;--st-chip-fg:#17394b;--st-chip-line:#a9dcea;--st-ad-bg:#f5fcfe;--st-dlg-bg:#fff;--st-dlg-fg:#17394b}
[data-theme="dark"]{--st-accent:#3bc9db;--st-chip-bg:#182236;--st-chip-fg:#c9d6ea;--st-chip-line:#2a3651;--st-ad-bg:#101a2b;--st-dlg-bg:#182236;--st-dlg-fg:#e8eef7}
#st-bar{position:fixed;top:6px;right:8px;z-index:9999;display:flex;gap:6px;align-items:center;
  font:12px/1.2 "Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif}
#st-bar .st-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;
  background:var(--st-chip-bg);color:var(--st-chip-fg);border:1px solid var(--st-chip-line);
  text-decoration:none;cursor:pointer;white-space:nowrap}
#st-bar button.st-chip{font:inherit}
#st-bar .st-member{background:var(--st-accent);color:#fff;border-color:transparent}
#st-bar .st-free{opacity:.85}
#st-bar .st-join{opacity:1;background:#ff6b35;color:#fff;border-color:transparent;font-weight:700}
/* 会員向けの案内（window.stPaywall）。鍵のかかった範囲を押したときなど */
#st-pay{border:0;border-radius:18px;padding:0;max-width:min(420px,calc(100vw - 32px));background:var(--st-dlg-bg);color:var(--st-dlg-fg);
  box-shadow:0 20px 60px rgba(0,0,0,.35);font:14px/1.7 "Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif}
#st-pay::backdrop{background:rgba(10,16,32,.55)}
#st-pay .pw-top{padding:22px 22px 8px;text-align:center}
#st-pay .pw-lock{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:16px;background:#fff1ea;color:#ff6b35;font-size:26px}
#st-pay h2{margin:10px 0 4px;font-size:19px}
#st-pay p{margin:0 0 6px}
#st-pay ul{margin:8px 22px 0;padding:0 0 0 1.2em;font-size:13.5px}
#st-pay .pw-price{margin:12px 0 0;text-align:center;font-weight:800;font-size:15px}
#st-pay .pw-price b{font-size:26px;color:#ff6b35}
#st-pay .pw-price small{font-size:12px;font-weight:700;opacity:.75}
#st-pay .pw-row{display:flex;gap:8px;padding:16px 22px 22px}
#st-pay .pw-row a,#st-pay .pw-row button{flex:1;padding:11px;border-radius:12px;font:inherit;font-weight:800;text-align:center;text-decoration:none;cursor:pointer}
#st-pay .pw-go{background:linear-gradient(135deg,#ff7a45,#f0561d);color:#fff;border:0}
#st-pay .pw-no{background:transparent;color:inherit;border:1px solid var(--st-chip-line)}
#st-gsi{min-height:0}
#st-bar .st-apple{display:inline-flex;align-items:center;gap:5px;background:#000;color:#fff;border-color:#000;text-decoration:none}
#st-bar .st-apple svg{width:12px;height:14px}
[data-theme="dark"] #st-bar .st-apple{background:#fff;color:#000;border-color:#fff}
/* 上のロゴ（トップへ）。紺の文字は暗い色のときに白 */
#st-home{display:flex;justify-content:center;padding:10px 12px 0;position:relative;z-index:5}
#st-home a{display:inline-flex;align-items:center;border-radius:12px;text-decoration:none;transition:transform .15s}
#st-home a:hover{transform:translateY(-1px)}
#st-home a:focus-visible{outline:3px solid #ff6b35;outline-offset:3px}
#st-home svg{height:40px;width:auto;display:block}
#st-home .ink{fill:#1d2b53} [data-theme="dark"] #st-home .ink{fill:#fff}
@media (max-width:600px){#st-home{padding-top:4px} #st-home svg{height:34px}}
/* タイピング画面の文字だけの見出し「Study Type」は、ロゴがあるので出さない */
body:has(#st-home) #big-title .bt-text{display:none}
/* 中くらいの幅では、右上のバーが見出しに重ならないよう上を空ける */
@media (min-width:601px) and (max-width:1000px){ body{padding-top:36px} }
/* スマホでは画面の上に 1 段取って並べる（戻るボタンなどに重ならないように） */
@media (max-width:600px){
  #st-bar{position:static;justify-content:flex-end;flex-wrap:wrap;padding:6px 8px 0}
  #home-link{position:static !important;margin:6px 10px 0}
}
.st-ad{position:fixed;left:0;right:0;bottom:0;z-index:9998;display:flex;justify-content:center;
  padding:6px 8px calc(6px + env(safe-area-inset-bottom));background:var(--st-ad-bg);
  border-top:1px solid var(--st-chip-line)}
.st-ad-inner{width:100%;max-width:728px;min-height:60px;display:flex;align-items:center;justify-content:center}
.st-ad-sample{width:100%;min-height:60px;display:flex;align-items:center;justify-content:center;gap:10px;
  border:1px dashed var(--st-chip-line);border-radius:8px;color:var(--st-chip-fg);font-size:12px}
.st-ad-sample a{color:var(--st-accent)}
body.st-has-ad{padding-bottom:84px}
/* Google から「出す広告なし」（審査中・在庫なしなど）と返ってきた枠は、空の帯を残さず隠す */
.st-ad:has(ins[data-ad-status="unfilled"]),.st-rail:has(ins[data-ad-status="unfilled"]),.st-ad-box:has(ins[data-ad-status="unfilled"]){display:none !important}
body.st-has-ad:has(.st-ad ins[data-ad-status="unfilled"]){padding-bottom:0}
/* 左右の縦長：本文（最大 1080px）の外に 160px の枠が入る広さのときだけ */
.st-rail{display:none;position:fixed;top:64px;z-index:9997;width:160px;min-height:600px}
.st-rail-l{left:max(8px,calc((100vw - 1080px) / 4 - 80px))} .st-rail-r{right:max(8px,calc((100vw - 1080px) / 4 - 80px))}
@media (min-width:1440px) and (min-height:700px){.st-rail{display:block}}
.st-rail .st-ad-sample{min-height:600px;flex-direction:column;text-align:center;padding:8px}
/* 画面の中の枠（結果の下・待合室）。中身が入るまで高さを取っておき、画面がずれないようにする */
.st-ad-box{display:none;flex-direction:column;align-items:center;gap:4px;margin:16px auto;max-width:336px;min-height:280px;width:100%}
body.st-ads .st-ad-box{display:flex}
.st-ad-box .st-ad-label{font-size:10px;letter-spacing:.1em;color:var(--st-chip-fg);opacity:.55}
.st-ad-box .st-ad-sample{min-height:250px;flex-direction:column;text-align:center}
body.playing-game :is(.st-ad,#st-bar,#st-home),
body:has(#screen-game:not([hidden])) :is(.st-ad,#st-bar,#st-home),
body:has(#screen-zu:not([hidden])) :is(.st-ad,#st-bar,#st-home),
body:has(.vs-playing) :is(.st-ad,#st-bar,#st-home){display:none}
/* 左右の縦長は、打っている間も出したまま（本文から離れているので打つ邪魔にならない） */
#st-nick-dlg{border:1px solid var(--st-chip-line);border-radius:14px;padding:20px;max-width:340px;width:calc(100% - 32px);
  background:var(--st-dlg-bg);color:var(--st-dlg-fg);font:14px/1.6 "Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif}
#st-nick-dlg::backdrop{background:rgba(0,0,0,.45)}
#st-nick-dlg h2{font-size:1.1rem;margin:0 0 6px}
#st-nick-dlg p{margin:0 0 12px;font-size:.85rem;opacity:.8}
#st-nick-dlg input{width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;font-size:16px;border-radius:8px;
  border:1px solid var(--st-chip-line);background:var(--st-chip-bg);color:inherit}
#st-nick-dlg .st-err{color:#e04848;min-height:1.4em;font-size:.85rem;margin:6px 0 0}
#st-nick-dlg .st-row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
#st-nick-dlg button{padding:8px 16px;border-radius:8px;border:1px solid var(--st-chip-line);background:transparent;color:inherit;font:inherit;cursor:pointer}
#st-nick-dlg button.st-ok{background:var(--st-accent);border-color:transparent;color:#fff}
</style>`;

// ニックネームを決める窓。初めてログインしたときは自動で開く
function nickDialog(viewer) {
  if (!viewer.email) return '';
  return `<dialog id="st-nick-dlg" data-first="${viewer.needsNickname ? '1' : ''}">
  <form method="dialog" id="st-nick-form">
    <h2>ニックネーム</h2>
    <p>ランキングに出る名前です（12文字まで）。本名でなくてかまいません。</p>
    <input id="st-nick-input" maxlength="12" autocomplete="nickname" value="${esc(viewer.name)}">
    <div class="st-err" id="st-nick-err"></div>
    <div class="st-row">
      <button type="button" id="st-nick-cancel">あとで</button>
      <button type="submit" class="st-ok">決める</button>
    </div>
  </form>
</dialog>`;
}

function bar(viewer, env) {
  const theme = `<button type="button" class="st-chip" id="st-theme" title="画面の色を切り替える">🎨 色</button>`;
  if (viewer.email) {
    // 1 年分（自動更新なし）の期限が 30 日を切ったら「あと○日」と出して、買い足してもらう
    const p = viewer.plan, left = p && p.active && !p.auto ? Math.ceil((p.until - Date.now()) / 86400000) : 99;
    const badge = viewer.member && left <= 30
      ? `<a class="st-chip st-join" href="/plan" title="1年分の期限が近づいています">会員 あと${left}日</a>`
      : viewer.member
      ? `<a class="st-chip st-member" href="/plan" title="すべての問題が遊べます">会員</a>`
      : `<a class="st-chip st-free st-join" href="/plan" title="月100円で全部の範囲が遊べます">会員になる</a>`;
    const admin = viewer.admin ? `<a class="st-chip" href="/admin">管理</a>` : '';
    return `<div id="st-bar">${badge}${admin}${theme}
      <button type="button" class="st-chip" id="st-nick" title="ニックネームを変える">${esc(viewer.name)}</button>
      <button type="button" class="st-chip" id="st-logout" title="${esc(viewer.email)}">ログアウト</button></div>`;
  }
  const apple = env.APPLE_SERVICES_ID
    ? `<a class="st-chip st-apple" id="st-apple" href="/auth/apple" title="Apple でログイン"><svg viewBox="0 0 17 20" aria-hidden="true"><path fill="currentColor" d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C3.6 4.8 2 5.8 1.1 7.4c-1.8 3.2-.5 7.9 1.3 10.5.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.9 3.4-.9s2 .9 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.9-1.1-3-4.2zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>Apple でログイン</a>`
    : '';
  const login = env.GOOGLE_CLIENT_ID
    ? `<div id="st-gsi"></div>${apple}`
    : (apple || `<span class="st-chip st-free">無料版</span>`);
  return `<div id="st-bar"><a class="st-chip st-free st-join" href="/plan" title="月100円で全部の範囲が遊べます">会員になる</a>${theme}${login}</div>`;
}

// 枠ごとの広告ユニット。専用のユニットが無ければ、下の横長と同じユニットを使う
function adSlots(env) {
  const client = String(env.ADSENSE_CLIENT || '').trim();
  const base = String(env.ADSENSE_SLOT || '').trim();
  const pick = v => { v = String(v || '').trim(); return /^\d+$/.test(v) ? v : base; };
  const ok = /^ca-pub-\d+$/.test(client) && /^\d+$/.test(base);
  return ok ? { client, rail: pick(env.ADSENSE_SLOT_RAIL), result: pick(env.ADSENSE_SLOT_RESULT), lobby: pick(env.ADSENSE_SLOT_LOBBY) } : null;
}

const SAMPLE = '<div class="st-ad-sample"><span>広告枠</span><span>会員になると広告が消えます</span></div>';

// 左右の縦長（広い画面のときだけ CSS で出す）
function rails(env) {
  const a = adSlots(env);
  const one = side => `<div class="st-rail st-rail-${side}" role="complementary" aria-label="広告">` + (a
    ? `<ins class="adsbygoogle" style="display:block;width:160px;height:600px" data-ad-client="${a.client}" data-ad-slot="${a.rail}"></ins>`
    : SAMPLE) + '</div>';
  return one('l') + one('r');
}

// 画面の中の枠（data-st-ad）は、見えたときに中身を入れる。隠れた枠へ入れると AdSense が大きさを測れないため
function boxScript(env) {
  const a = adSlots(env);
  return `<script>
(function(){
  var A = ${JSON.stringify(a)};
  var SAMPLE = ${JSON.stringify(SAMPLE)};
  function fill(el){
    if (el.dataset.stAdDone) return;
    el.dataset.stAdDone = '1';
    var kind = el.getAttribute('data-st-ad');
    var slot = A && A[kind];
    el.innerHTML = '<span class="st-ad-label">広告</span>' + (slot
      ? '<ins class="adsbygoogle" style="display:inline-block;width:336px;height:280px;max-width:100%" data-ad-client="' + A.client + '" data-ad-slot="' + slot + '"></ins>'
      : SAMPLE);
    if (slot) try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  }
  document.body.classList.add('st-ads');
  function watch(){
    var els = document.querySelectorAll('[data-st-ad]');
    if (!('IntersectionObserver' in window)) { els.forEach(fill); return; }
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } });
    });
    els.forEach(function(el){ io.observe(el); });
  }
  watch();
  // 縦長の枠
  if (A) document.querySelectorAll('.st-rail ins.adsbygoogle').forEach(function(el){
    if (el.offsetWidth) try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  });
})();
</script>`;
}

function ad(env) {
  const client = String(env.ADSENSE_CLIENT || '').trim();
  const slot = String(env.ADSENSE_SLOT || '').trim();
  const real = /^ca-pub-\d+$/.test(client) && /^\d+$/.test(slot);
  const inner = real
    ? `<ins class="adsbygoogle" style="display:block;width:100%;min-height:60px" data-ad-client="${client}" data-ad-slot="${slot}" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
       <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>
       <script>(window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1; (window.adsbygoogle = window.adsbygoogle || []).push({});</script>`
    : `<div class="st-ad-sample"><span>広告枠</span><span><a href="/plan">会員（月100円）</a>になると広告が消えて、全部の範囲が遊べます</span></div>`;
  return `<div class="st-ad" role="complementary" aria-label="広告"><div class="st-ad-inner">${inner}</div></div>`;
}

function script(viewer, env) {
  return `<script>
(function(){
  var THEMES = ${JSON.stringify(THEMES)};
  var loggedIn = ${viewer.email ? 'true' : 'false'};
  function setTheme(t){
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('st-theme', t); } catch (e) {}
    if (loggedIn) fetch('/api/setTheme', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify([t]) });
  }
  var tb = document.getElementById('st-theme');
  if (tb) tb.onclick = function(){
    var cur = document.documentElement.getAttribute('data-theme') || THEMES[0];
    setTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
  };
  var dlg = document.getElementById('st-nick-dlg');
  if (dlg && dlg.showModal) {
    var input = document.getElementById('st-nick-input'), err = document.getElementById('st-nick-err');
    var open = function(){ err.textContent = ''; dlg.showModal(); input.select(); };
    document.getElementById('st-nick').onclick = open;
    document.getElementById('st-nick-cancel').onclick = function(){ dlg.close(); };
    document.getElementById('st-nick-form').onsubmit = function(e){
      e.preventDefault();
      fetch('/auth/nickname', { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ nickname: input.value }) })
        .then(function(r){ return r.json(); })
        .then(function(j){ if (j.error) err.textContent = j.error; else location.reload(); });
    };
    if (dlg.dataset.first) open();
  }
  var lo = document.getElementById('st-logout');
  if (lo) lo.onclick = function(){
    fetch('/auth/logout', { method:'POST' }).then(function(){ location.reload(); });
  };
  if (document.querySelector('.st-ad')) document.body.classList.add('st-has-ad');
  // 会員向けの案内。what は「ITパスポートの『セキュリティ』」のような、開けようとしたもの
  // opt … { title, text } で見出しと説明を差し替える（範囲以外の会員機能の案内）
  window.stPaywall = function(what, opt){
    var d = document.getElementById('st-pay');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'st-pay';
      d.innerHTML = '<div class="pw-top"><span class="pw-lock">🔒</span><h2>会員向けの範囲です</h2><p class="pw-what"></p></div>' +
        '<ul><li>大学受験・英会話・資格の<b>全部の範囲</b>が選べる</li><li>会員が作った対戦部屋は、全部の範囲から出る</li><li><b>マイメニュー</b>：お気に入りの問題集をトップに並べる</li><li>広告が出ない</li></ul>' +
        '<p class="pw-price">月 <b>100</b> 円<br><small>自動更新なしの 1年分 1,200 円も</small></p>' +
        '<div class="pw-row"><button type="button" class="pw-no">あとで</button><a class="pw-go" href="/plan">会員プランを見る</a></div>';
      document.body.appendChild(d);
      d.querySelector('.pw-no').onclick = function(){ d.close(); };
      d.addEventListener('click', function(e){ if (e.target === d) d.close(); });
    }
    d.querySelector('h2').textContent = (opt && opt.title) || '会員向けの範囲です';
    d.querySelector('.pw-what').textContent = (opt && opt.text) || (what ? what + ' は会員になると選べます。無料版で選べるのは、はじめのいくつかの範囲だけです' : '無料版で選べるのは、はじめのいくつかの範囲だけです');
    if (d.showModal) d.showModal(); else location.href = '/plan';
    setTimeout(function(){ var g = d.querySelector('.pw-go'); if (g) g.focus(); }, 0);
  };
  // Apple でログインしたあと、今の画面に戻る
  var ap = document.getElementById('st-apple');
  if (ap) ap.href = '/auth/apple?to=' + encodeURIComponent(location.pathname + location.search);
  var gsi = document.getElementById('st-gsi');
  // 家の中の端末から手元版を開いたとき（192.168.… など）は Google ログインが使えないので、メールで入る画面へ
  if (gsi && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)) {
    gsi.innerHTML = '<a class="st-chip" href="/auth/dev?to=' + encodeURIComponent(location.pathname + location.search) + '">ログイン</a>';
    gsi = null;
  }
  if (gsi) {
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = function(){
      google.accounts.id.initialize({
        client_id: ${JSON.stringify(String(env.GOOGLE_CLIENT_ID || ''))},
        callback: function(r){
          fetch('/auth/google', { method:'POST', headers:{'content-type':'application/json'},
            body: JSON.stringify({ credential: r.credential }) })
            .then(function(x){ return x.json(); })
            .then(function(j){ if (j.error) alert(j.error); else location.reload(); });
        }
      });
      google.accounts.id.renderButton(gsi, { type:'standard', size:'small', text:'signin', shape:'pill', locale:'ja' });
    };
    document.head.appendChild(s);
  }
})();
</script>`;
}

// 色が決まっていなければ、このブラウザで選んだ色、それも無ければ水色系。
// 画面を描く前に決めたいので <head> の先頭に置く
const HEAD = `<script>
(function(){
  var d = document.documentElement;
  if (d.getAttribute('data-theme')) return;
  var t = null; try { t = localStorage.getItem('st-theme'); } catch (e) {}
  d.setAttribute('data-theme', ${JSON.stringify(THEMES)}.indexOf(t) >= 0 ? t : ${JSON.stringify(THEMES[0])});
})();
</script>`;

// 上のロゴ（キーの形の S と STUDY TYPE）。押すとトップへ
const HOME = `<div id="st-home"><a href="/" aria-label="STUDY TYPE トップへ" title="トップへ">
<svg viewBox="0 0 330 64" role="img" aria-hidden="true">
  <rect x="2" y="6" width="56" height="56" rx="12" fill="#0f1a3d"/><rect x="2" y="2" width="56" height="52" rx="12" fill="#1d2b53"/>
  <rect x="8" y="7" width="44" height="40" rx="8" fill="#2b3d73"/>
  <text x="26" y="40" text-anchor="middle" font-family="'Arial Black','Hiragino Sans',sans-serif" font-weight="900" font-size="34" fill="#fff">S</text>
  <rect x="41" y="17" width="4" height="22" rx="1.5" fill="#ff6b35"/>
  <text x="72" y="44" font-family="'Arial Black','Helvetica Neue',sans-serif" font-weight="900" font-size="32" letter-spacing="1"><tspan class="ink">STUDY</tspan><tspan fill="#ff6b35" dx="7">TYPE</tspan></text>
</svg></a></div>`;

// ページの HTML に部品を差し込む
export function decorate(html, viewer, env, theme) {
  // 画面側が「ログインしているか・ニックネーム」を知るため
  const who = `<script>window.ST_VIEWER = ${JSON.stringify(viewer.email ? { name: viewer.name, member: viewer.member } : null).replace(/</g, '\\u003c')};</script>`;
  html = html.replace(/<html([^>]*)>/i, (m, attrs) => '<html' + attrs.replace(/\sdata-theme="[^"]*"/, '') + themeAttr(theme) + '>');
  html = html.replace(/<head>/i, '<head>\n' + HEAD + who);
  html = html.replace('</head>', CSS + '\n</head>');
  // バーは <body> のすぐ後（スマホでは画面の上に並ぶ）、それ以外は </body> の前
  // トップ・分類ページ（portal.js）は大きなロゴを自分で持っているので、上のロゴは足さない
  const home = /<svg class="logo"/.test(html) ? '' : HOME;
  html = html.replace(/<body([^>]*)>/i, m => m + '\n' + bar(viewer, env) + home);
  const parts = nickDialog(viewer) + (viewer.member ? '' : ad(env) + rails(env) + boxScript(env)) + script(viewer, env);
  return html.replace(/<\/body>(?![\s\S]*<\/body>)/i, parts + '\n</body>');
}
