// ===============================================================
// portal.js
// トップ（大分類のタイル・対戦の入口）と分類ページ（中分類 → 問題集のカード）。
// 並びはすべて sets.js の MENU / FEATURED から作るので、増やすときは sets.js だけ直す。
// 色は chrome.js と同じ <html data-theme="blue|dark"> で切り替わる。
// ===============================================================

import { MENU, FEATURED, setInfo, isPaidSet, PAID_CATS } from './sets.js';
import { icon } from './icons.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ロゴ（docs/logo/logo-a-keycap.svg と同じ形。紺の文字は暗い色のときに白へ変わる）
export const LOGO = `<svg class="logo" viewBox="0 0 560 140" role="img" aria-label="STUDY TYPE 打って、覚えて、対戦だ。">
  <g transform="translate(14 14)">
    <rect x="0" y="8" width="112" height="112" rx="22" fill="#0f1a3d"/>
    <rect x="0" y="0" width="112" height="104" rx="22" fill="#1d2b53"/>
    <rect x="12" y="10" width="88" height="80" rx="14" fill="#2b3d73"/>
    <text x="50" y="76" text-anchor="middle" font-family="'Arial Black','Hiragino Sans','Helvetica Neue',sans-serif" font-weight="900" font-size="68" fill="#fff">S</text>
    <rect x="80" y="30" width="7" height="46" rx="2" fill="#ff6b35" class="logo-caret"/>
  </g>
  <text x="148" y="84" font-family="'Arial Black','Helvetica Neue',sans-serif" font-weight="900" font-size="54" letter-spacing="1">
    <tspan class="logo-ink">STUDY</tspan><tspan fill="#ff6b35" dx="10">TYPE</tspan>
  </text>
  <text x="150" y="116" class="logo-sub" font-family="'Hiragino Sans','Noto Sans JP',sans-serif" font-weight="700" font-size="17" letter-spacing="3">打って、覚えて、対戦</text>
  <text x="347" y="117" transform="rotate(-5 347 117)" font-family="'Hiragino Sans','Noto Sans JP',sans-serif" font-weight="900" font-size="22" fill="#ff6b35" letter-spacing="1">だ。</text>
</svg>`;

// 背景のキーボード柄（キーの形を薄く並べる）
const KEY_PATTERN = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">' +
  '<rect x="6" y="6" width="28" height="28" rx="7" fill="none" stroke="#1d2b53" stroke-width="1.5"/>' +
  '<rect x="42" y="6" width="24" height="28" rx="7" fill="none" stroke="#1d2b53" stroke-width="1.5"/>' +
  '<rect x="6" y="42" width="60" height="24" rx="7" fill="none" stroke="#1d2b53" stroke-width="1.5"/></svg>');

const CSS = `<style>
:root,[data-theme="blue"]{
  --bg:#eef3fa; --bg2:#f8fafd; --card:#ffffff; --ink:#1d2b53; --text:#24304f; --muted:#5d6886; --line:#dde4ef;
  --shadow:0 1px 2px rgba(29,43,83,.06),0 8px 24px rgba(29,43,83,.08); --shadow-hi:0 2px 4px rgba(29,43,83,.08),0 18px 40px rgba(29,43,83,.16);
  --pattern-o:.055; --chip:#f1f4f9; --soon:#eef1f6;
}
[data-theme="dark"]{
  --bg:#0b1222; --bg2:#0f1830; --card:#141e37; --ink:#f2f5fb; --text:#dbe3f1; --muted:#93a1bd; --line:#24304d;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.28); --shadow-hi:0 2px 4px rgba(0,0,0,.35),0 18px 40px rgba(0,0,0,.45);
  --pattern-o:.10; --chip:#1b2744; --soon:#172038;
}
:root{
  --orange:#ff6b35; --navy:#1d2b53;
  --c-green:#12b886; --c-green2:#0b8f6a; --c-navy:#4263eb; --c-navy2:#243b99; --c-orange:#ff8a4c; --c-orange2:#f0561d;
  --c-purple:#9f5cf0; --c-purple2:#6b30d6; --c-sky:#1fb6e0; --c-sky2:#0a7fbf; --c-gold:#f6b93b; --c-gold2:#d9820b;
  --c-cosmic:#6d28d9; --c-cosmic2:#db2777;
}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100vh;color:var(--text);background:
  radial-gradient(1100px 520px at 88% -8%, rgba(255,107,53,.13), transparent 60%),
  radial-gradient(900px 520px at -8% 8%, rgba(31,182,224,.14), transparent 60%),
  linear-gradient(var(--bg2), var(--bg) 480px);
  font:15px/1.65 "Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
body::before{content:"";position:absolute;left:0;right:0;top:0;height:560px;pointer-events:none;z-index:0;opacity:var(--pattern-o);
  background:url("${KEY_PATTERN}") 0 0/72px 72px;
  -webkit-mask-image:linear-gradient(to bottom,#000 0,transparent 520px);mask-image:linear-gradient(to bottom,#000 0,transparent 520px)}
[data-theme="dark"] body::before{filter:invert(1)}
a{color:inherit}
.wrap{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:18px 16px 40px}
.ic{width:24px;height:24px;flex:none}

/* ---- ヘッダー ---- */
.top-head{display:flex;align-items:center;gap:12px;min-height:44px;padding-right:260px}
.top-head .logo{height:52px;width:auto;display:block}
.logo-ink{fill:var(--navy)} .logo-sub{fill:#6b7591}
[data-theme="dark"] .logo-ink{fill:#fff} [data-theme="dark"] .logo-sub{fill:#aab3cc}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 0 8px}
.hero .logo{width:min(520px,100%);height:auto}
.logo-caret{animation:blink 1.1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.logo-caret{animation:none}}
.crumb{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)}
.crumb a{text-decoration:none;color:var(--muted)} .crumb a:hover{color:var(--ink)}
.crumb .ic{width:14px;height:14px}

/* ---- 対戦の入口 ---- */
.play-row{display:grid;grid-template-columns:1fr 300px;gap:16px;margin:18px 0 8px}
.versus{position:relative;overflow:hidden;border-radius:20px;padding:22px 24px;color:#fff;
  background:linear-gradient(135deg,#1d2b53 0%,#2b3d73 55%,#3a2a6b 100%);box-shadow:var(--shadow-hi)}
[data-theme="dark"] .versus{background:linear-gradient(135deg,#243a7a 0%,#2f3f8a 50%,#4a2f86 100%);border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 50px rgba(74,47,134,.35)}
.versus::after{content:"VS";position:absolute;right:-6px;bottom:-38px;font:italic 900 150px/1 "Arial Black",sans-serif;
  color:rgba(255,255,255,.06);letter-spacing:-6px;pointer-events:none}
.versus .badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:800;
  background:rgba(255,107,53,.18);color:#ffb08f;letter-spacing:.08em}
.versus h2{margin:10px 0 2px;font-size:26px;line-height:1.3;font-weight:900;letter-spacing:.02em}
.versus h2 em{font-style:normal;color:var(--orange)}
.versus p{margin:0 0 16px;color:#c9d2ea;font-size:14px}
.join{display:flex;gap:8px;flex-wrap:wrap;position:relative;z-index:1}
.join input{width:9.5em;padding:12px 14px;border-radius:12px;border:2px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);
  color:#fff;font:800 20px/1 "SF Mono",Menlo,monospace;letter-spacing:.3em;text-align:center}
.join input::placeholder{color:rgba(255,255,255,.35)}
.join input:focus{outline:none;border-color:var(--orange);background:rgba(255,255,255,.12)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-radius:12px;border:0;
  font:inherit;font-weight:800;cursor:pointer;text-decoration:none;transition:transform .15s,box-shadow .15s,background .15s}
.btn-orange{background:var(--orange);color:#fff;box-shadow:0 6px 16px rgba(255,107,53,.35)}
.btn-orange:hover,.btn-orange:focus-visible{transform:translateY(-1px);box-shadow:0 10px 22px rgba(255,107,53,.45)}
.btn-ghost{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.2)}
.btn-ghost:hover,.btn-ghost:focus-visible{background:rgba(255,255,255,.18)}
.btn:focus-visible,.tile:focus-visible,.set:focus-visible,.feat:focus-visible,.side a:focus-visible{outline:3px solid var(--orange);outline-offset:3px}
.versus .how{margin:14px 0 0;font-size:12.5px;color:#aab6d6;position:relative;z-index:1}
.versus .how b{color:#fff}

.side{display:flex;flex-direction:column;gap:12px}
.side a{flex:1;display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:18px;background:var(--card);
  border:1px solid var(--line);box-shadow:var(--shadow);text-decoration:none;transition:transform .15s,box-shadow .15s}
.side a:hover{transform:translateY(-2px);box-shadow:var(--shadow-hi)}
.side .dot{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;color:#fff;flex:none}
.side b{display:block;color:var(--ink);font-size:16px} .side small{color:var(--muted);font-size:12.5px}

/* ---- 見出し ---- */
.sec-h{display:flex;align-items:baseline;gap:12px;margin:34px 0 14px}
.sec-h h2{margin:0;font-size:20px;font-weight:900;color:var(--ink);letter-spacing:.04em}
.sec-h span{font-size:12px;font-weight:800;letter-spacing:.2em;color:var(--orange)}

/* ---- 大分類のタイル ---- */
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.tile{--a:var(--c-navy);--b:var(--c-navy2);position:relative;display:flex;flex-direction:column;border-radius:20px;overflow:hidden;
  background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);text-decoration:none;
  transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s}
.tile:hover{transform:translateY(-4px);box-shadow:var(--shadow-hi)}
.tile .art{position:relative;height:112px;display:grid;place-items:center;background:linear-gradient(140deg,var(--a),var(--b));overflow:hidden}
.tile .art::before,.tile .art::after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.14)}
.tile .art::before{width:120px;height:120px;right:-40px;top:-50px}
.tile .art::after{width:70px;height:70px;left:-24px;bottom:-30px;background:rgba(255,255,255,.1)}
.tile .art .price{position:absolute;top:8px;left:8px;z-index:1;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.04em;
  background:#fff;color:#0b8f6a;box-shadow:0 2px 6px rgba(0,0,0,.15)}
.tile .art .price.paid{color:#c2410c}
.tile .art .ic{width:54px;height:54px;color:#fff;stroke-width:1.75;filter:drop-shadow(0 4px 8px rgba(0,0,0,.18));
  transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.tile:hover .art .ic{transform:scale(1.1) rotate(-6deg)}
.tile .body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:2px;flex:1}
.tile .en{font-size:10.5px;font-weight:800;letter-spacing:.18em;color:var(--b)}
[data-theme="dark"] .tile .en{color:var(--a)}
.tile b{font-size:19px;color:var(--ink);font-weight:900;letter-spacing:.04em}
.tile small{color:var(--muted);font-size:12.5px;line-height:1.5}
.tile .cnt{margin-top:auto;padding-top:8px;font-size:12px;font-weight:700;color:var(--muted);display:flex;align-items:center;gap:4px}
.tile .cnt .ic{width:14px;height:14px}
.k-green{--a:var(--c-green);--b:var(--c-green2)} .k-navy{--a:var(--c-navy);--b:var(--c-navy2)}
.k-orange{--a:var(--c-orange);--b:var(--c-orange2)} .k-purple{--a:var(--c-purple);--b:var(--c-purple2)}
.k-sky{--a:var(--c-sky);--b:var(--c-sky2)} .k-gold{--a:var(--c-gold);--b:var(--c-gold2)}
.k-cosmic{--a:var(--c-cosmic);--b:var(--c-cosmic2)}

/* ---- 市高・森羅万象 ---- */
.feats{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.feat{position:relative;display:flex;align-items:center;gap:16px;padding:18px 20px;border-radius:20px;overflow:hidden;color:#fff;
  text-decoration:none;background:linear-gradient(120deg,var(--a),var(--b));box-shadow:var(--shadow);transition:transform .18s,box-shadow .18s}
.feat:hover{transform:translateY(-3px);box-shadow:var(--shadow-hi)}
.feat::after{content:"";position:absolute;right:-30px;top:-40px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.12)}
.feat .ico{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;background:rgba(255,255,255,.2);flex:none}
.feat .ico .ic{width:30px;height:30px}
.feat b{display:block;font-size:20px;font-weight:900;letter-spacing:.06em}
.feat small{opacity:.9;font-size:13px}
.feat .go{margin-left:auto;position:relative;z-index:1}
.feat.locked{filter:grayscale(.55);opacity:.8;cursor:default}
.feat.locked:hover{transform:none}
.lock{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.2);font-size:11px;font-weight:800;vertical-align:middle}
.lock .ic{width:12px;height:12px}

/* ---- 分類ページ ---- */
.cat-hero{position:relative;overflow:hidden;margin:14px 0 6px;padding:26px 26px 24px;border-radius:24px;color:#fff;
  background:linear-gradient(130deg,var(--a),var(--b));box-shadow:var(--shadow-hi);display:flex;align-items:center;gap:20px}
.cat-hero::before{content:"";position:absolute;right:-60px;top:-80px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.12)}
.cat-hero::after{content:"";position:absolute;right:120px;bottom:-90px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.08)}
.cat-hero .ico{display:grid;place-items:center;width:84px;height:84px;border-radius:24px;background:rgba(255,255,255,.18);flex:none}
.cat-hero .ico .ic{width:46px;height:46px;stroke-width:1.75}
.cat-hero .en{font-size:12px;font-weight:800;letter-spacing:.24em;opacity:.8}
.cat-hero h1{margin:0;font-size:32px;line-height:1.2;font-weight:900;letter-spacing:.06em}
.cat-hero p{margin:4px 0 0;opacity:.92}
.jump{position:sticky;top:0;z-index:5;display:flex;gap:8px;flex-wrap:wrap;margin:14px -16px 0;padding:10px 16px;
  background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.jump a{padding:7px 14px;border-radius:999px;background:var(--card);border:1px solid var(--line);text-decoration:none;font-weight:700;font-size:13.5px;color:var(--ink)}
.jump a:hover{border-color:var(--a)}
.group{scroll-margin-top:64px}
.group h2{display:flex;align-items:center;gap:10px;margin:26px 0 12px;font-size:18px;font-weight:900;color:var(--ink)}
.group h2::before{content:"";width:6px;height:22px;border-radius:3px;background:linear-gradient(var(--a),var(--b))}
.sets{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.set{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;background:var(--card);border:1px solid var(--line);
  box-shadow:var(--shadow);text-decoration:none;transition:transform .15s,box-shadow .15s,border-color .15s}
.set:hover{transform:translateY(-2px);box-shadow:var(--shadow-hi);border-color:color-mix(in srgb,var(--a) 50%,var(--line))}
.set .ico{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;flex:none;color:var(--b);
  background:color-mix(in srgb,var(--a) 14%,transparent)}
[data-theme="dark"] .set .ico{color:var(--a);background:color-mix(in srgb,var(--a) 20%,transparent)}
.set b{display:block;color:var(--ink);font-size:15.5px;line-height:1.35}
.set small{display:block;color:var(--muted);font-size:12.5px;line-height:1.45}
.set .meta{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:4px}
.tag{display:inline-block;white-space:nowrap;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:800;background:var(--chip);color:var(--muted)}
.set .arrow{margin-left:auto;color:var(--muted);transition:transform .15s}
.set:hover .arrow{transform:translateX(3px);color:var(--b)}
.set.soon{background:var(--soon);box-shadow:none;cursor:default}
/* お気に入り（☆）。カードの右上に重ねる（会員のマイメニューに出る） */
.set-w{position:relative;display:flex;min-width:0}
.set-w > .set{flex:1;min-width:0;padding-right:30px}
.star{position:absolute;top:4px;right:4px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;
  border:0;background:transparent;color:var(--muted);font-size:19px;line-height:1;cursor:pointer;transition:transform .12s,color .12s}
.star:hover{transform:scale(1.15);color:#f59f00}
.star[aria-pressed="true"]{color:#f59f00}
.star:focus-visible{outline:3px solid var(--orange);outline-offset:1px}
/* マイメニュー（会員。トップのいちばん上） */
.mine{margin:0 0 22px;padding:16px 18px 18px;border-radius:20px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow)}
.mine h2{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:16px;font-weight:900;color:var(--ink)}
.mine h2 .ic{width:20px;height:20px;color:#f59f00}
.mine h2 small{margin-left:auto;font-size:12px;font-weight:700;color:var(--muted)}
.mine .sets{grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.mine .set{padding:10px 12px}
.mine .set .ico{width:40px;height:40px;border-radius:12px}
.mine .set .cat{display:block;font-size:11px;font-weight:800;color:var(--muted);letter-spacing:.06em}
.mine .empty{padding:14px;font-size:13.5px}
.set.soon:hover{transform:none;border-color:var(--line)}
.set.soon .ico{filter:grayscale(.4);opacity:.7}
.tag.soon{background:transparent;border:1px dashed var(--muted)}
.tag.paid{background:color-mix(in srgb,var(--orange) 14%,transparent);color:#c2410c}
.empty{padding:22px;border-radius:16px;border:1px dashed var(--line);color:var(--muted);text-align:center}

/* ---- ほかのアプリ（一番下） ---- */
.apps{margin-top:34px}
.app-card{position:relative;display:flex;align-items:center;gap:18px;padding:18px 22px;border-radius:20px;overflow:hidden;text-decoration:none;color:#f3ead8;
  background:radial-gradient(420px 180px at 85% 0%,rgba(255,196,92,.18),transparent 70%),linear-gradient(135deg,#1c1a24,#2a2233 60%,#1a2430);
  border:1px solid rgba(255,255,255,.08);box-shadow:var(--shadow);transition:transform .18s,box-shadow .18s}
.app-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-hi)}
.app-card::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.08;
  background:repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 24px),repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 24px)}
.app-card .app-ico{position:relative;flex:none;width:84px;height:84px;border-radius:18px;background:#141019;border:2px solid rgba(255,196,92,.35);
  display:grid;place-items:center;overflow:hidden}
.app-card .app-ico img{width:84px;height:84px;image-rendering:pixelated}
.app-card .app-txt{position:relative;display:flex;flex-direction:column;gap:2px}
.app-card .app-kicker{font-size:11px;font-weight:800;letter-spacing:.2em;color:#ffc45c}
.app-card b{font-size:21px;font-weight:900;letter-spacing:.04em;color:#fff}
.app-card small{font-size:13px;color:#cbbfa8}
.app-card .app-go{position:relative;margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:12px;
  background:#ffc45c;color:#2a1d07;font-weight:900;font-size:14px;white-space:nowrap}
@media (max-width:600px){ .app-card{padding:14px;gap:12px} .app-card .app-ico,.app-card .app-ico img{width:64px;height:64px} .app-card b{font-size:18px} .app-card .app-go{padding:8px 10px;font-size:12px} }
.foot{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;color:var(--muted)}
.foot a{color:var(--muted)}

/* ---- 幅ごと ---- */
@media (max-width:1000px){ .top-head{padding-right:0} .tiles{grid-template-columns:repeat(6,1fr)} .tile{grid-column:span 2} .tile:nth-child(n+4){grid-column:span 3} }
@media (max-width:760px){
  .play-row{grid-template-columns:1fr} .side{flex-direction:row} .side a{padding:12px 14px}
  .side .dot{width:36px;height:36px;border-radius:11px} .side small{display:none}
}
@media (max-width:600px){
  .wrap{padding-top:6px}
  .tiles{grid-template-columns:1fr 1fr;gap:10px} .tile,.tile:nth-child(n+4){grid-column:auto} .tile:last-child:nth-child(odd){grid-column:1/-1}
  .tile .art{height:84px} .tile .art .ic{width:42px;height:42px} .tile b{font-size:17px}
  .feats{grid-template-columns:1fr}
  .versus{padding:18px} .versus h2{font-size:21px}
  .join input{flex:1;width:auto;min-width:0} .join .btn-ghost{flex-basis:100%}
  .side b{font-size:14.5px;white-space:nowrap}
  .cat-hero{padding:18px;gap:14px} .cat-hero .ico{width:60px;height:60px;border-radius:18px} .cat-hero .ico .ic{width:32px;height:32px}
  .cat-hero h1{font-size:24px}
}
</style>`;

// 矢印キーで、画面上の近いカードへ動く。Esc は「トップへ」
const KEYS = `<script>
(function(){
  var sel = '.nav-item';
  function items(){ return Array.prototype.filter.call(document.querySelectorAll(sel), function(el){ return el.offsetParent !== null; }); }
  document.addEventListener('keydown', function(e){
    if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    var t = e.target, tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    }
    var dir = { ArrowRight:[1,0], ArrowLeft:[-1,0], ArrowDown:[0,1], ArrowUp:[0,-1] }[e.key];
    if (e.key === 'Escape') { var b = document.getElementById('back'); if (b) { e.preventDefault(); b.focus(); } return; }
    if (!dir) return;
    var list = items(); if (!list.length) return;
    e.preventDefault();
    var cur = document.activeElement;
    if (list.indexOf(cur) < 0 && !(cur && cur.id === 'join-code')) { list[0].focus(); return; }
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = null, bestD = 1e9;
    list.forEach(function(el){
      if (el === cur) return;
      var q = el.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      var along = dx * dir[0] + dy * dir[1]; if (along <= 4) return;
      var across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      var d = along + across * 2; if (d < bestD) { bestD = d; best = el; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block:'nearest', behavior:'smooth' }); }
  });
})();
</script>`;

export function page(title, body, desc) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${esc(desc || '受験・資格・英会話・雑学を、タイピングで覚えるサイト。友達とのタイピング対戦も。')}">
${CSS}
</head>
<body>
<div class="wrap">
${body}
<footer class="foot"><span>© STUDY TYPE</span><a href="/?p=ranking">ランキング</a><a href="/?p=me">わたしの戦績</a><a href="/plan">会員プラン</a><a href="/legal">特定商取引法に基づく表記</a>
<span>アイコン：<a href="https://lucide.dev" target="_blank" rel="noopener">Lucide</a>（ISC）</span></footer>
</div>
${KEYS}
</body>
</html>`;
}

const liveSets = (m, available) => {
  const kbns = [...new Set(m.groups.flatMap(g => g.sets))];
  return kbns.filter(k => { const c = setInfo(k); return c && !c.soon && (!available || available.has(k)); });
};

// ---------------------------------------------------------------
// トップ
export function renderHome(viewer, available, favs) {
  const tiles = MENU.map(m => {
    const n = liveSets(m, available).length;
    const price = PAID_CATS.includes(m.key) ? '<span class="price paid">3割無料</span>' : '<span class="price">無料</span>';
    return `<a class="tile nav-item k-${m.color}" href="?p=${m.key}">
  <div class="art">${icon(m.icon)}${price}</div>
  <div class="body"><span class="en">${esc(m.en)}</span><b>${esc(m.title)}</b><small>${esc(m.lead)}</small>
  <span class="cnt">${icon('book-open')}${n ? n + ' 問題集' : 'まもなく公開'}</span></div>
</a>`;
  }).join('\n');

  const feats = FEATURED.map(f => {
    const locked = f.juken && !viewer.juken;
    const inner = `<span class="ico">${icon(f.icon)}</span>
  <span><b>${esc(f.title)}${locked ? `<span class="lock">${icon('lock')}メンバー限定</span>` : ''}</b><small>${esc(f.sub)}</small></span>
  ${locked ? '' : `<span class="go">${icon('arrow-right')}</span>`}`;
    return locked
      ? `<div class="feat locked k-${f.color}" title="許可されたメンバーだけが遊べます">${inner}</div>`
      : `<a class="feat nav-item k-${f.color}" href="${esc(f.href)}">${inner}</a>`;
  }).join('\n');

  // マイメニュー（会員）：分類ページの ☆ で入れた問題集
  let mine = '';
  if (viewer.member && viewer.email) {
    const catOf = key => MENU.find(m => m.key === key);
    const cards = (favs || []).map(f => {
      const c = setInfo(f.kbn), m = catOf(f.cat) || MENU.find(x => x.groups.some(g => g.sets.includes(f.kbn)));
      if (!c || !m || (available && !available.has(f.kbn))) return '';
      return `<a class="set nav-item k-${m.color}" href="?p=${m.key}&amp;k=${encodeURIComponent(f.kbn)}">
  <span class="ico">${icon(c.icon)}</span><span><span class="cat">${esc(m.title)}</span><b>${esc(c.label)}</b></span>
  <span class="arrow">${icon('chevron-right')}</span></a>`;
    }).join('\n');
    mine = `<section class="mine" aria-label="マイメニュー"><h2>${icon('star')}マイメニュー<small>分類ページの ☆ で追加</small></h2>
  ${cards ? `<div class="sets">${cards}</div>` : '<p class="empty">分類ページで問題集の ☆ を押すと、ここに並びます。よく遊ぶ問題集をすぐ始められます</p>'}</section>`;
  }

  const body = `
<header class="hero">${LOGO}</header>
${mine}

<section class="play-row">
  <div class="versus">
    <span class="badge">${icon('swords', 'ic')} ONLINE BATTLE</span>
    <h2>友達と<em>タイピング対戦</em>！</h2>
    <p>部屋番号を送るだけ。同じ問題で、早く正しく打った方が 1 本。</p>
    <form class="join" action="/" method="get" autocomplete="off">
      <input type="hidden" name="p" value="shikaku">
      <input id="join-code" name="join" inputmode="numeric" pattern="[0-9]{4,5}" maxlength="5" placeholder="1234" required aria-label="部屋番号">
      <button class="btn btn-orange nav-item" type="submit">${icon('log-in')}部屋に入る</button>
      <a class="btn btn-ghost nav-item" href="#cats">${icon('plus')}部屋をつくる</a>
    </form>
    <p class="how">部屋をつくるには、下から問題集をえらんで <b>⚔ 対戦</b> を押します</p>
  </div>
  <div class="side">
    <a class="nav-item" href="?p=ranking"><span class="dot" style="background:linear-gradient(140deg,var(--c-gold),var(--c-gold2))">${icon('trophy')}</span>
      <span><b>ランキング</b><small>問題集ごとのトップ</small></span></a>
    <a class="nav-item" href="?p=me"><span class="dot" style="background:linear-gradient(140deg,var(--c-sky),var(--c-sky2))">${icon('chart-column')}</span>
      <span><b>わたしの戦績</b><small>対戦成績と苦手な問題</small></span></a>
  </div>
</section>

<div class="sec-h" id="cats"><h2>何を勉強する？</h2><span>CATEGORY</span></div>
<nav class="tiles">
${tiles}
</nav>
<div class="feats">
${feats}
</div>

<section class="apps" aria-label="ほかのアプリ">
  <div class="sec-h"><h2>ほかのアプリ</h2><span>MORE GAMES</span></div>
  <a class="app-card nav-item" href="https://studydungeons.umekobo.com/" target="_blank" rel="noopener">
    <span class="app-ico"><img src="/fig/apps/studydungeons.png" alt="" width="84" height="84"></span>
    <span class="app-txt"><span class="app-kicker">ROGUELIKE RPG</span><b>勉強ダンジョンズ</b><small>ローグライクRPGで学習。英語・IT資格・受験の洞窟にもぐろう</small></span>
    <span class="app-go">遊ぶ ${icon('arrow-right')}</span>
  </a>
</section>`;
  return page('STUDY TYPE — 打って、覚えて、対戦だ。', body);
}

// ---------------------------------------------------------------
// 分類ページ（?p=<大分類>）
export function renderCategory(m, available, viewer, favs) {
  const favSet = new Set((favs || []).map(f => f.kbn));
  const card = k => {
    const c = setInfo(k);
    if (!c) return '';
    const soon = c.soon || (available && !available.has(k));
    const n = available && available.get ? available.get(k) : 0;
    const tags = soon ? '<span class="tag soon">準備中</span>'
      : (n ? `<span class="tag">${n.toLocaleString()} 問</span>` : '') + (c.levels ? '<span class="tag">Lv 上がる</span>' : '')
        + (isPaidSet(k) ? '<span class="tag paid">3割無料</span>' : '');
    const inner = `<span class="ico">${icon(c.icon)}</span>
  <span><b>${esc(c.label)}</b><small>${esc(c.desc)}</small><span class="meta">${tags}</span></span>
  ${soon ? '' : `<span class="arrow">${icon('chevron-right')}</span>`}`;
    if (soon) return `<div class="set soon" aria-disabled="true">${inner}</div>`;
    const on = favSet.has(k);
    return `<div class="set-w"><a class="set nav-item" href="?p=${m.key}&amp;k=${encodeURIComponent(k)}">${inner}</a>
  <button type="button" class="star" data-kbn="${esc(k)}" aria-pressed="${on}" title="${on ? 'マイメニューから外す' : 'マイメニューに入れる'}" aria-label="${esc(c.label)}をマイメニューに入れる">${on ? '★' : '☆'}</button></div>`;
  };
  const groups = m.groups.map((g, i) => `<section class="group" id="g${i + 1}">
  <h2>${esc(g.label)}</h2>
  <div class="sets">${g.sets.map(card).join('\n')}</div>
</section>`).join('\n');

  const body = `
<header class="top-head">
  <a href="/" aria-label="トップへ">${LOGO}</a>
</header>
<nav class="crumb"><a id="back" href="/">トップ</a>${icon('chevron-right')}<span>${esc(m.title)}</span></nav>
<div class="k-${m.color}">
  <section class="cat-hero">
    <span class="ico">${icon(m.icon)}</span>
    <div><div class="en">${esc(m.en)}</div><h1>${esc(m.title)}</h1><p>${esc(m.lead)}</p></div>
  </section>
  ${m.groups.length > 1 ? `<nav class="jump">${m.groups.map((g, i) => `<a href="#g${i + 1}">${esc(g.label)}</a>`).join('')}</nav>` : ''}
  ${groups || '<p class="empty">問題集を準備中です</p>'}
</div>
<script>
(function(){
  // ☆ を押すとマイメニュー（トップ）に入れる。会員の機能なので、会員でなければ案内を出す
  var member = ${viewer && viewer.member && viewer.email ? 'true' : 'false'}, cat = ${JSON.stringify(m.key)};
  document.querySelectorAll('.star').forEach(function(b){
    b.addEventListener('click', function(){
      if (!member) {
        if (window.stPaywall) window.stPaywall('', { title: 'マイメニューは会員の機能です', text: '☆ を押した問題集が、トップのいちばん上に並びます。選んだ出題範囲も、どのブラウザ・スマホでも同じになります' });
        else location.href = '/plan';
        return;
      }
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '★' : '☆';
      fetch('/api/setFavorite', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify([b.dataset.kbn, on, cat]) })
        .then(function(r){ return r.json(); })
        .then(function(j){ var v = j.value || {}; if (j.error || v.error) { b.setAttribute('aria-pressed', String(!on)); b.textContent = on ? '☆' : '★'; alert(v.error || j.error); } });
    });
  });
})();
</script>`;
  return page(m.title + ' | STUDY TYPE', body, m.title + 'の問題をタイピングで覚える。' + m.lead);
}
