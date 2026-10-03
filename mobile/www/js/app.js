// ===============================================================
// app.js
// STUDY TYPE（アプリ）の画面。トップ → 大分類 → プレイ設定 → ゲーム → 結果。
// 問題は www/data/（build-data.mjs が作る）をアプリの中から読むので、電波が無くても遊べる。
//
// 遊び方は Web 版の「本番」と同じ：
//   レベル … 写経（読みが見える）/ 基本（少しずつヒント）/ 極（ヒントなし）
//   コース … 60 / 90 / 120 秒。正解で +秒、ミスで −秒、ノーミスで続けるとボーナス秒
//   点数   … 打った文字 × 10 × レベルの重み × コンボ、称号は 1 分あたりの点数
// 自己ベストはこの端末に残す（localStorage）。
// ===============================================================

import { icon } from './icons.js';
import { Keyboard, kbPrefs } from './keyboard.js';
import { alts, tryAppend, tryCycle, nextChars, bestAnswer, isLatin, prefixState } from './match.js';
import { lobby as versusLobby } from './versus.js';
import { adsFor } from './ads.js';
import { hayaoshi, hyKanji } from './hayaoshi.js';
import * as sound from './sound.js';
import { account, paywall, memberSet, isMember, initAccount, getMe, onAccountChange } from './account.js';

const $app = document.getElementById('app');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 問題文は Web 版と同じく、取り込むときに &lt; などにしてある
export const qhtml = s => String(s ?? '').replace(/\n/g, '<br>');

// 確認・お知らせ・入力の小さな窓（confirm / alert / prompt の代わり）。
// iOS では confirm などのボタンが英語になる（Capacitor が "Ok" "Cancel" と決め打ち）ので、画面の中に出す。
// 外付けキーボード：Enter で OK、Esc でキャンセル。開いているあいだのキーは、うしろの画面（遊んでいる画面）に渡さない
function dialog({ msg, ok = 'OK', cancel, input, danger }) {
  return new Promise(done => {
    const prev = document.activeElement;
    const box = document.createElement('div');
    box.className = 'dlg-back';
    box.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><p>${qhtml(esc(msg))}</p>
      ${input ? `<input class="dlg-in" maxlength="${input.max || 100}" value="${esc(input.value || '')}" autocomplete="off">` : ''}
      <div class="dlg-btns">${cancel ? `<button class="dlg-no">${esc(cancel)}</button>` : ''}<button class="dlg-ok${danger ? ' danger' : ''}">${esc(ok)}</button></div></div>`;
    document.body.appendChild(box);
    const inp = box.querySelector('.dlg-in');
    const onKey = e => {
      e.stopImmediatePropagation();
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); yes(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel ? no() : yes(); }
    };
    const close = v => {
      window.removeEventListener('keydown', onKey, true);
      box.remove();
      try { if (prev && prev.focus) prev.focus(); } catch (e) {}
      done(v);
    };
    const yes = () => close(inp ? inp.value : true);
    const no = () => close(inp ? null : false);
    window.addEventListener('keydown', onKey, true);
    box.querySelector('.dlg-ok').onclick = yes;
    const n = box.querySelector('.dlg-no');
    if (n) n.onclick = no;
    if (inp) { inp.focus(); inp.select(); } else box.querySelector('.dlg-ok').focus();
  });
}
// ask … はい／いいえ（true / false）。tell … お知らせ。askText … 文字を入れてもらう（キャンセルは null）
export const ask = (msg, opt) => dialog(Object.assign({ msg, cancel: 'キャンセル' }, opt));
export const tell = msg => dialog({ msg });
export const askText = (msg, value, max) => dialog({ msg, cancel: 'キャンセル', input: { value, max } });

export const LEVELS = [
  { key: 'shakyo', label: '写経', sub: '読みが見える', plus: 1, minus: 0.5, weight: 0.5 },
  { key: 'kihon',  label: '基本', sub: '少しずつヒント', plus: 2, minus: 1, weight: 1 },
  { key: 'kiwami', label: '極',   sub: 'ヒントなし', plus: 3, minus: 2, weight: 1.5 },
];
const COURSES = [60, 90, 120];
const FAIL_SEC = 3;
const HY_CARD_MS = 20000;   // 1 人の早押し・拡大は、Web の 1 問の持ち時間（20 秒）と同じ見せ方（12 秒で全部見える）
const TITLES = [[0, '見習い'], [600, '駆け出し'], [1200, '一人前'], [2000, '腕利き'], [3000, '達人'], [4200, '師範'], [5600, '名人'], [7500, '神']];

// ---- ふるえ（Capacitor の Haptics。ブラウザでは何もしない） ----
const haptics = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
export const buzz = {
  tap()  { const h = prefs.haptics && haptics(); if (h) h.impact({ style: 'LIGHT' }).catch(() => {}); },
  miss() { const h = prefs.haptics && haptics(); if (h) h.notification({ type: 'ERROR' }).catch(() => {}); },
  ok()   { const h = prefs.haptics && haptics(); if (h) h.notification({ type: 'SUCCESS' }).catch(() => {}); },
};

// ---- 保存（この端末） ----
export const store = {
  get(k, d) { try { const v = localStorage.getItem('st.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('st.' + k, JSON.stringify(v)); } catch (e) {} },
};
// hyText 早押し（問題文を少しずつ）・hyZoom 拡大（絵の一部から引いていく）。不利になるだけなので自己ベストにも数える
const settings = Object.assign({ level: 'kihon', sec: 90, hyText: false, hyZoom: false }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

// 画面設定（メニュー）：色・振動・フリックの感度・キーの大きさ
const FLICK_DIST = { short: 12, normal: 18, long: 28 };
const prefs = Object.assign({ theme: 'dark', haptics: true, sound: true, flick: 'normal', keys: 'normal' }, store.get('prefs', {}));
function applyPrefs() {
  sound.setSound(prefs.sound);
  document.body.classList.toggle('light', prefs.theme === 'light');
  document.body.classList.toggle('kb-large', prefs.keys === 'large');
  kbPrefs.flickMin = FLICK_DIST[prefs.flick] || 18;
  const sb = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
  // DARK は明るい文字（暗い地のとき）、LIGHT は暗い文字
  if (sb) sb.setStyle({ style: prefs.theme === 'light' ? 'LIGHT' : 'DARK' }).catch(() => {});
}
const savePrefs = () => { store.set('prefs', prefs); applyPrefs(); };

// ---- データ ----
let MENU = null, SETS = null;
export const getSets = () => SETS;
// iPad か iPhone か（画面の文言用。keyboard.js と同じ見分け方）
export const DEVICE = Math.min(window.screen.width, window.screen.height) >= 700 ? 'iPad' : 'iPhone';
const setCache = {};
async function loadMenu() {
  const j = await fetch('data/menu.json').then(r => r.json());
  MENU = j.menu; SETS = j.sets;
  // 森羅万象：全部の問題集からまぜて出す（kbn は Web 版と同じ 'shinra'。対戦の部屋も作れる）
  SETS.shinra = { label: '森羅万象', icon: 'orbit', desc: '全部の問題集からまぜて出題', paid: false,
    n: Object.values(SETS).reduce((a, x) => a + x.n, 0), all: Object.values(SETS).reduce((a, x) => a + (x.all || x.n), 0) };
}
// 森羅万象の問題：どの問題集からも同じくらいずつ（1 つの問題集から最大 SHINRA_PER 問）、問題文の頭に【問題集】
const SHINRA_PER = 12;
async function loadShinra() {
  const kbns = Object.keys(SETS).filter(k => k !== 'shinra');
  const all = await Promise.all(kbns.map(k => loadSet(k).then(d => [k, d])));
  const q = [];
  for (const [k, d] of all) {
    const pick = d.q.slice().sort(() => Math.random() - 0.5).slice(0, SHINRA_PER);
    pick.forEach(x => q.push(['【' + SETS[k].label + '】' + x[0], ...x.slice(1)]));
  }
  return { scopes: [], q };
}
// 会員は、ダウンロードしてある全部の問題（account.js）。無ければアプリの中の無料の問題
async function loadSet(kbn) {
  const m = await memberSet(kbn);
  if (m) return m;
  if (!setCache[kbn]) setCache[kbn] = await fetch('data/sets/' + kbn + '.json').then(r => r.json());
  return setCache[kbn];
}

// ---- 画面の切り替え（戻るは積んだ順に） ----
// onLeave(f) … 今の画面を離れるときに f を呼ぶ（つないだままの通信を閉じるなど）
const stack = [];
let leaving = [];
export const onLeave = f => leaving.push(f);
function leave() { const l = leaving; leaving = []; l.forEach(f => { try { f(); } catch (e) {} }); }
// 広告は、遊んでいる最中（.game の画面）には出さない
// 会員には広告を出さない
// 会員には広告を出さない。アカウント・会員になる画面（.no-ads）にも出さない
const syncAds = () => setTimeout(() => adsFor(!isMember() && !$app.querySelector('.screen.game, .screen.no-ads')), 0);
export function show(render, push) {
  if (push !== false) stack.push(render);
  leave();
  $app.innerHTML = '';
  Promise.resolve(render()).then(syncAds);
}
export function back() {
  stack.pop();
  const r = stack[stack.length - 1];
  if (r) { leave(); $app.innerHTML = ''; Promise.resolve(r()).then(syncAds); }
}
export const topBar = (title, right) => `<div class="top"><button class="icon-btn" data-back aria-label="戻る">${icon('chevron-left')}</button><h1>${esc(title)}</h1>${right || '<span class="sp"></span>'}</div>`;
function wire(el) {
  el.querySelectorAll('[data-back]').forEach(b => b.onclick = back);
  el.querySelectorAll('.flip').forEach(s => { s.style.transform = 'scaleX(-1)'; });
}
// 問題文を読めるように収める。まず図を小さくし（72px まで）、それでも入らなければ字を小さくする（13px まで）。
// それでも長ければ、文の枠の中で指で動かして読む
export function fitText(el) {
  const img = el.parentNode.querySelector('.q-img');
  el.style.fontSize = '';
  if (img) img.style.flexBasis = '';
  requestAnimationFrame(() => {
    const over = () => el.scrollHeight > el.clientHeight + 1;
    if (img && img.firstChild) {
      let h = img.clientHeight;
      while (over() && h > 72) { h -= 12; img.style.flexBasis = h + 'px'; }
    }
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (over() && size > 13) { size -= 1; el.style.fontSize = size + 'px'; }
  });
}

export function screen(cls, html) {
  const el = document.createElement('div');
  el.className = 'screen ' + (cls || '');
  el.innerHTML = html;
  $app.appendChild(el);
  wire(el);
  return el;
}

const LOGO = `<svg viewBox="0 0 330 92" role="img" aria-label="STUDY TYPE 打って、覚えて、対戦だ。">
  <rect x="2" y="6" width="56" height="56" rx="12" fill="#0a1230"/><rect x="2" y="2" width="56" height="52" rx="12" fill="#26356a"/>
  <rect x="8" y="7" width="44" height="40" rx="8" fill="#34488a"/>
  <text x="26" y="40" text-anchor="middle" font-family="'Arial Black','Hiragino Sans',sans-serif" font-weight="900" font-size="34" fill="#fff">S</text>
  <rect x="41" y="17" width="4" height="22" rx="1.5" fill="#ff6b35"/>
  <text x="72" y="44" font-family="'Arial Black','Helvetica Neue',sans-serif" font-weight="900" font-size="32" letter-spacing="1"><tspan fill="#fff" class="logo-ink">STUDY</tspan><tspan fill="#ff6b35" dx="7">TYPE</tspan></text>
  <text x="74" y="78" font-family="'Hiragino Sans',sans-serif" font-weight="700" font-size="15" fill="#93a1bd">打って、覚えて、対戦<tspan fill="#ff6b35" font-size="18">だ。</tspan></text>
</svg>`;

// ---------------------------------------------------------------
// トップ
function home() {
  const tiles = MENU.map(m => `<button class="tile k-${m.color}" data-cat="${m.key}">
    <div class="art">${icon(m.icon)}${isMember() ? '' : `<span class="price${m.paid ? ' paid' : ''}">${m.paid ? '一部無料' : '無料'}</span>`}</div>
    <div class="body"><span class="en">${esc(m.en)}</span><b>${esc(m.title)}</b><small>${esc(m.lead)}</small></div></button>`).join('');
  const n = Object.entries(SETS).filter(([k]) => k !== 'shinra').reduce((a, [, s]) => a + (isMember() ? s.all || s.n : s.n), 0);   // 会員はダウンロードした分も
  const el = screen('', `<button class="icon-btn home-menu" id="menu" aria-label="メニュー（設定）">${icon('settings')}</button><div class="scroll">
    <div class="hero">${LOGO}<span class="offline">● オフラインでも遊べます（${n.toLocaleString()} 問）</span></div>
    <button class="vs-home" id="vs-home">${icon('swords')}<span><b>対戦する</b><small>ランダム対戦・部屋番号で入る・近くの部屋（Web の人とも）</small></span>${icon('chevron-right')}</button>
    <div class="sec-h">何を勉強する？</div>
    <div class="tiles">${tiles}</div>
    <button class="shinra" id="shinra">${icon('orbit')}<span><b>森羅万象</b><small>全部の問題集からまぜて出題（${n.toLocaleString()} 問から）</small></span>${icon('chevron-right')}</button>
  </div>`);
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => show(() => category(b.dataset.cat)));
  el.querySelector('#menu').onclick = () => show(menu);
  el.querySelector('#vs-home').onclick = () => show(() => versusLobby(null, null));
  el.querySelector('#shinra').onclick = () => show(() => setup('shinra', 'shinra'));
}

// ---------------------------------------------------------------
// メニュー（画面設定・記録・このアプリについて）
function menu() {
  const seg = (key, opts) => `<div class="seg" data-pref="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${prefs[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const bests = store.get('best', {});
  const nBest = Object.keys(bests).length;
  const me = getMe();
  const el = screen('', topBar('メニュー') + `<div class="scroll">
    <div class="m-sec">アカウント</div>
    <div class="m-card">
      <button class="m-row" id="m-account">${icon(me ? 'user' : 'log-in')}<span class="grow"><b>${me ? esc(me.name) : 'ログイン'}</b><small>${me ? (isMember() ? '会員' : '無料版') + '・' + esc(me.email) : 'Apple・Google でログイン（Web 版と同じアカウント）'}</small></span>${icon('chevron-right')}</button>
      ${isMember() ? '' : `<button class="m-row" id="m-join">${icon('crown')}<span class="grow"><b>会員になる</b><small>大学受験・英会話・資格の全部の範囲・広告なし</small></span>${icon('chevron-right')}</button>`}
    </div>

    <div class="m-sec">画面設定</div>
    <div class="m-card">
      <div class="m-row">${icon(prefs.theme === 'light' ? 'sun' : 'moon')}<span class="grow"><b>画面の色</b></span>${seg('theme', [['dark', '暗い'], ['light', '明るい']])}</div>
      <div class="m-row">${icon('vibrate')}<span class="grow"><b>振動</b><small>キーを押したとき・ミス・正解</small></span><button class="switch${prefs.haptics ? ' on' : ''}" id="sw-haptics" aria-label="振動"></button></div>
      <div class="m-row">${icon('volume-2')}<span class="grow"><b>効果音</b><small>打つ音・まちがえた音・対戦の出題の音</small></span><button class="switch${prefs.sound ? ' on' : ''}" id="sw-sound" aria-label="効果音"></button></div>
      <div class="m-row">${icon('hand')}<span class="grow"><b>フリックの感度</b><small>どれだけ指を動かしたらフリックになるか</small></span>${seg('flick', [['short', '敏感'], ['normal', 'ふつう'], ['long', 'にぶい']])}</div>
      <div class="m-row">${icon('keyboard')}<span class="grow"><b>キーの大きさ</b></span>${seg('keys', [['normal', 'ふつう'], ['large', '大きい']])}</div>
    </div>

    <div class="m-sec">記録</div>
    <div class="m-card">
      <button class="m-row danger" id="reset-best">${icon('trash-2')}<span class="grow"><b>自己ベストを消す</b><small>この ${DEVICE} に残っている ${nBest} 件</small></span></button>
    </div>

    <div class="m-sec">このアプリについて</div>
    <div class="m-card">
      <div class="m-row">${icon('info')}<span class="grow"><b>STUDY TYPE</b><small>打って、覚えて、対戦だ。</small></span></div>
      <div class="m-row"><span class="grow"><small>問題の図・写真は Wikimedia Commons ほか（作者とライセンスは各問題の解説に）。地図は Natural Earth。アイコンは Lucide（ISC）</small></span></div>
      <a class="m-row" href="https://studytype.umekobo.com/privacy" target="_blank" rel="noopener"><span class="grow"><b>プライバシーポリシー</b><small>studytype.umekobo.com/privacy</small></span>${icon('chevron-right')}</a>
    </div>
  </div>`);
  el.querySelector('#m-account').onclick = () => show(account);
  const join = el.querySelector('#m-join');
  if (join) join.onclick = () => show(() => paywall());
  el.querySelectorAll('[data-pref]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
    prefs[g.dataset.pref] = b.dataset.v; savePrefs(); buzz.tap();
    g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (g.dataset.pref === 'theme') { stack.pop(); show(menu); }
  }));
  el.querySelector('#sw-sound').onclick = e => { prefs.sound = !prefs.sound; savePrefs(); e.currentTarget.classList.toggle('on', prefs.sound); sound.key(); };
  el.querySelector('#sw-haptics').onclick = e => { prefs.haptics = !prefs.haptics; savePrefs(); e.currentTarget.classList.toggle('on', prefs.haptics); buzz.tap(); };
  el.querySelector('#reset-best').onclick = async () => {
    if (!nBest || !(await ask('この ' + DEVICE + ' の自己ベスト（' + nBest + ' 件）を消しますか？', { ok: '消す', danger: true }))) return;
    store.set('best', {}); stack.pop(); show(menu);
  };
}

// ---------------------------------------------------------------
// 大分類（問題集の一覧）
function category(key) {
  const m = MENU.find(x => x.key === key);
  const bestOf = kbn => { const b = store.get('best', {}); return Math.max(0, ...Object.entries(b).filter(([k]) => k.startsWith(kbn + '|')).map(([, v]) => v.score)); };
  const groups = m.groups.map(g => `<div class="group-h">${esc(g.label)}</div>` + g.sets.map(k => {
    const s = SETS[k];
    const best = bestOf(k);
    return `<button class="set" data-kbn="${k}"><span class="ico">${icon(s.icon)}</span>
      <span><b>${esc(s.label)}</b><small>${isMember() ? `${(s.all || s.n).toLocaleString()} 問` : `${s.n.toLocaleString()} 問${s.paid ? '（無料の範囲）' : ''}`}</small>${best ? `<span class="best">ベスト ${best.toLocaleString()}</span>` : ''}</span>
      <span class="go">${icon('chevron-right')}</span></button>`;
  }).join('')).join('');
  const el = screen('k-' + m.color, topBar(m.title) + `<div class="scroll">
    <div class="cat-hero">${icon(m.icon)}<div><b>${esc(m.title)}</b><small>${esc(m.lead)}</small></div></div>
    ${groups}</div>`);
  el.querySelectorAll('[data-kbn]').forEach(b => b.onclick = () => show(() => setup(key, b.dataset.kbn)));
}

// ---------------------------------------------------------------
// プレイ設定（範囲・レベル・コース）
async function setup(cat, kbn) {
  const m = MENU.find(x => x.key === cat) || { color: 'cosmic' }, s = SETS[kbn];
  let data = kbn === 'shinra' ? await loadShinra() : await loadSet(kbn);
  const scopes = data.scopes || [];
  const member = isMember() && !!data.at;   // 会員の問題がそろっている
  const usable = scopes.filter(x => x.free || member).map(x => x.scope);
  const picked = () => { const want = store.get('scopes.' + kbn, null); const c = Array.isArray(want) ? usable.filter(x => want.includes(x)) : usable; return c.length ? c : usable; };
  const el = screen('k-' + m.color, topBar(s.label) + `<div class="scroll">
    <div id="scope-row"></div>
    <div class="lab">レベル</div>
    <div class="chips" id="lv">${LEVELS.map(l => `<button class="chip" data-lv="${l.key}"><b>${l.label}</b><small>${l.sub}</small></button>`).join('')}</div>
    <div class="lab">コース（持ち時間）</div>
    <div class="chips" id="sec">${COURSES.map(c => `<button class="chip" data-sec="${c}"><b>${c}秒</b><small>${c === 60 ? 'おてがる' : c === 90 ? 'ふつう' : 'じっくり'}</small></button>`).join('')}</div>
    <p class="note" id="lv-note"></p>
    <div class="lab">見せ方</div>
    <div class="chips" id="hy"><button class="chip" data-hy="hyText"><b>早押し</b><small>問題文を少しずつ</small></button><button class="chip" data-hy="hyZoom"><b>拡大</b><small>絵の一部から引いていく</small></button></div>
    <button class="start" id="go">${icon('play')}ひとりでスタート</button>
    <button class="btn wide vs-btn" id="vs">${icon('swords')} 対戦（ランダム・部屋・近くの人）</button>
    <p class="note">かなの答えはフリック、英語の答えは英字キーボードで打ちます。わからないときは「パス」、ヒントは次の 1 文字</p>
  </div>`);
  const renderScopes = () => {
    const row = el.querySelector('#scope-row');
    if (scopes.length < 2) { row.innerHTML = ''; return; }
    const c = new Set(picked());
    row.innerHTML = `<div class="lab">出題範囲${c.size < usable.length ? '<button id="sc-all">全部</button>' : ''}</div>
      <div class="scopes">${scopes.map((x, i) => (x.free || member)
        ? `<button class="sc${c.has(x.scope) ? ' on' : ''}" data-i="${i}"><span class="bx">${c.has(x.scope) ? '✓' : ''}</span>${esc(x.scope)}<small>${x.n}</small></button>`
        : `<button class="sc locked" data-lock="${i}">🔒 ${esc(x.scope)}<small>${x.n}</small></button>`).join('')}</div>
      ${s.paid && !member ? (() => {
        const freeN = scopes.filter(x => x.free).reduce((a, x) => a + x.n, 0), allN = scopes.reduce((a, x) => a + x.n, 0);
        return `<p class="note">無料で遊べるのは ${usable.length} / ${scopes.length} 範囲（${freeN.toLocaleString()} 問）。🔒 の範囲も合わせると全部で <b>${allN.toLocaleString()} 問</b>。<button class="link" id="sc-join">会員になると全部遊べます</button></p>`;
      })() : ''}`;
    row.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => show(() => paywall(scopes[Number(b.dataset.lock)].scope)));
    const scJoin = row.querySelector('#sc-join');
    if (scJoin) scJoin.onclick = () => show(() => paywall());
    row.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      const sc = scopes[Number(b.dataset.i)].scope, cur = picked();
      const next = cur.includes(sc) ? cur.filter(v => v !== sc) : usable.filter(v => v === sc || cur.includes(v));
      if (!next.length) return;
      store.set('scopes.' + kbn, next.length === usable.length ? null : next);
      renderScopes();
    });
    const all = row.querySelector('#sc-all');
    if (all) all.onclick = () => { store.set('scopes.' + kbn, null); renderScopes(); };
  };
  const renderChips = () => {
    el.querySelectorAll('[data-lv]').forEach(b => b.classList.toggle('on', b.dataset.lv === settings.level));
    el.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', Number(b.dataset.sec) === settings.sec));
    el.querySelectorAll('[data-hy]').forEach(b => b.classList.toggle('on', !!settings[b.dataset.hy]));
    const l = LEVELS.find(x => x.key === settings.level);
    el.querySelector('#lv-note').textContent = `正解 +${l.plus}秒・ミス −${l.minus}秒。ノーミスで続けるとボーナス秒`;
  };
  el.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { settings.level = b.dataset.lv; saveSettings(); renderChips(); buzz.tap(); });
  el.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { settings.sec = Number(b.dataset.sec); saveSettings(); renderChips(); buzz.tap(); });
  el.querySelectorAll('[data-hy]').forEach(b => b.onclick = () => { settings[b.dataset.hy] = !settings[b.dataset.hy]; saveSettings(); renderChips(); buzz.tap(); });
  el.querySelector('#vs').onclick = () => show(() => versusLobby(cat, kbn));
  el.querySelector('#go').onclick = async () => {
    if (kbn === 'shinra') data = await loadShinra();   // 毎回ちがう組み合わせに
    const sel = new Set(picked());
    const pool = data.q.filter(q => scopes.length < 2 || sel.has(q[4]));
    show(() => game({ cat, kbn, pool, all: sel.size === usable.length }));
  };
  renderScopes(); renderChips();
}

// ---------------------------------------------------------------
// ゲーム
// ta があるときは対戦のタイムアタック：部屋の問題を部屋の順に、部屋の持ち時間とレベルで打ち、点数を ta.onScore で送る
export function game({ cat, kbn, pool, all, ta }) {
  const lv = LEVELS.find(x => x.key === (ta ? ta.level : settings.level)) || LEVELS[1];
  const secs = ta ? ta.seconds : settings.sec;
  const total = secs * 1000;
  // やさしい問題から少しずつ難しく：レベル順に並べて、近いレベルの中でまぜる（対戦は部屋の順のまま）
  const deck = ta ? pool.slice() : pool.map(q => ({ q, r: q[3] + Math.random() * 3 })).sort((a, b) => a.r - b.r).map(x => x.q);
  const st = { left: total, active: 0, score: 0, keys: 0, miss: 0, combo: 0, comboMax: 0, correct: 0, i: 0, t: '', card: null, answers: [],
    cardStart: 0, hints: 0, cardMiss: 0, log: [], over: false, paused: false, lock: false, hy: null };

  const el = screen('game', `
    <div class="hud">
      <button class="icon-btn" id="quit" aria-label="やめる">${icon('x')}</button>
      <div class="clock"><div class="bar" id="bar"><i style="width:100%"></i></div><div class="sec"><b id="secs">${secs.toFixed(1)}</b> 秒</div></div>
      <div class="score"><b id="score">0</b><small>${ta ? '⚔ ' : ''}${esc(lv.label)}・${secs}秒</small></div>
    </div>
    ${ta && ta.meters ? '<div class="ta-meters" id="ta-meters"></div>' : ''}
    <div class="stage" id="stage">
      <div class="q-meta" id="meta"></div>
      <div class="q-img" id="qimg"></div>
      <div class="q-text" id="qtext"></div>
      <div class="answer" id="ans"><div class="typed" id="typed"></div><div class="reveal" id="reveal"></div></div>
    </div>
    <div class="kb" id="kb"></div>`);
  const $ = id => el.querySelector('#' + id);

  const kb = new Keyboard($('kb'), {
    onPress: () => buzz.tap(),
    onChar: ch => input(ch),
    onCycle: () => { if (!ready()) return; const r = tryCycle(st.t, st.answers); if (r.ok) { st.t = r.t; after(r); } else if (r.miss) missed(); },
    onBack: () => { if (!ready() || !st.t) return; st.t = st.t.slice(0, -1); draw(); },
    onHint: () => { if (!ready()) return; hint(); },
    onPass: () => { if (!ready()) return; finishCard(false); },
    peek: n => st.card ? nextChars(st.t, st.answers, n) : '',
  });
  const ready = () => !st.over && !st.lock && st.card;

  function float(text, cls) {
    const f = document.createElement('div');
    f.className = 'float ' + cls;
    f.textContent = text;
    $('stage').appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }
  function addTime(sec, label, cls) {
    if (!sec) return;
    st.left = Math.max(0, st.left + sec * 1000);
    float(label || ((sec > 0 ? '+' : '−') + Math.abs(sec) + '秒'), cls || (sec > 0 ? 'plus' : 'minus'));
  }

  function nextCard() {
    if (st.i >= deck.length) st.i = 0;
    const q = deck[st.i++];
    st.card = q; st.answers = alts(q[2]); st.t = ''; st.hints = 0; st.cardMiss = 0; st.cardStart = performance.now(); st.lock = false;
    kb.setMode(isLatin(st.answers) ? 'latin' : 'kana');
    $('meta').textContent = [q[4], q[3] ? 'Lv' + q[3] : ''].filter(Boolean).join('・');
    // 早押し・拡大（hayaoshi.js）。難読漢字はいつも漢字を大きく。対戦のタイムアタックは部屋の決まりのまま
    if (st.hy) { st.hy.stop(false); st.hy = null; }
    const nk = ta ? null : hyKanji(kbn, q[0], q[1]);
    $('qimg').innerHTML = q[5] && !nk ? `<img src="${esc(q[5])}" alt="">` : '';
    $('qtext').innerHTML = qhtml(nk ? nk.que : q[0]);
    $('qtext').scrollTop = 0;
    if (!ta && (nk || settings.hyText || settings.hyZoom)) {
      st.hy = hayaoshi({ holder: $('qimg'), textEl: $('qtext'), kbn, img: settings.hyZoom ? q[5] : '', kanji: nk && nk.kanji,
        text: settings.hyText, ms: HY_CARD_MS, paused: () => st.paused });
    }
    fitText($('qtext'));
    const im = $('qimg').querySelector('img');
    if (im) im.addEventListener('load', () => fitText($('qtext')));
    $('ans').className = 'answer';
    $('reveal').innerHTML = '';
    draw();
  }

  // 打った文字と、まだの文字（写経は読みを全部、基本は時間がたつと少しずつ、極はヒントを押した分だけ）
  function draw() {
    const a = bestAnswer(st.t, st.answers);
    const state = prefixState(st.t, a);
    let reveal = st.hints;
    if (lv.key === 'shakyo') reveal = a.length;
    else if (lv.key === 'kihon') reveal = Math.max(reveal, Math.floor(Math.max(0, (performance.now() - st.cardStart) / 1000 - 4) / 2.5));
    const rest = a.slice(st.t.length, Math.max(st.t.length, reveal));
    const typed = state === 'near' ? esc(st.t.slice(0, -1)) + `<span class="near">${esc(st.t.slice(-1))}</span>` : esc(st.t);
    const html = typed + '<span class="caret"></span>' + (rest ? `<span class="rest">${esc(rest)}</span>` : '');
    if (html !== st.drawn) { $('typed').innerHTML = html; st.drawn = html; }
  }

  function input(ch) {
    if (!ready()) return;
    const r = tryAppend(st.t, ch, st.answers);
    if (!r.ok) { missed(); return; }
    const gained = r.t.replace(/[ .,\-]/g, '').length - st.t.replace(/[ .,\-]/g, '').length;
    if (gained > 0) st.keys += gained;
    st.t = r.t;
    after(r);
  }
  // ミス：時間を減らし、答えの枠を赤くゆらす（字は入れない）
  function missed() {
    st.miss++; st.cardMiss++; st.combo = 0;
    buzz.miss(); sound.miss();
    const a = $('ans'); a.classList.remove('miss'); void a.offsetWidth; a.classList.add('miss');
    addTime(-lv.minus);
  }
  function after(r) {
    sound.key();
    draw();
    if (r.done) finishCard(true);
  }
  function hint() {
    const nx = nextChars(st.t, st.answers, 1);
    if (!nx) return;
    st.hints = Math.max(st.hints, st.t.length + 1);
    addTime(-1, 'ヒント −1秒', 'minus');
    draw();
  }

  function finishCard(ok) {
    st.lock = true;
    if (st.hy) st.hy.stop(true);   // 答えが出たら、問題文も絵も全部見せる
    const q = st.card;
    st.log.push({ q, ok, miss: st.cardMiss });
    const a = $('ans');
    if (ok) {
      st.correct++;
      st.combo = st.cardMiss ? 0 : st.combo + 1;
      st.comboMax = Math.max(st.comboMax, st.combo);
      const chars = bestAnswer(st.t, st.answers).replace(/[ .,\-]/g, '').length;
      const mult = 1 + Math.min(st.combo, 20) * 0.05;
      st.score += Math.round(chars * 10 * lv.weight * mult * (st.hints ? 0.5 : 1));
      $('score').textContent = st.score.toLocaleString();
      if (ta) ta.onScore(st.score, st.correct, false);
      buzz.ok();
      addTime(lv.plus);
      const c = st.combo, bonus = c === 3 ? 3 : (c >= 5 && c % 5 === 0 ? 5 : 0);
      if (bonus) setTimeout(() => addTime(bonus, `🔥${c}連続 +${bonus}秒`, 'bonus'), 250);
      a.className = 'answer done';
    } else {
      st.combo = 0;
      addTime(-FAIL_SEC, 'パス −3秒', 'minus');
      a.className = 'answer miss';
      st.t = bestAnswer('', st.answers);
      draw();
    }
    // 答え（漢字）と、写経・基本は解説のさわりを少し見せてから次へ
    const note = lv.key !== 'kiwami' && q[6] ? '　' + esc(String(q[6]).split('\n')[0]).slice(0, 80) : '';
    $('reveal').innerHTML = `<b>${ok ? '○' : '×'} ${esc(q[1])}</b>${note}`;
    setTimeout(() => { if (!st.over) nextCard(); }, ok ? (note ? 900 : 450) : 1400);
  }

  // 時計：問題が出ている間だけ、実際にたった時間ぶん進める
  let last = performance.now(), raf = 0;
  function tick(now) {
    const dt = Math.min(250, now - last); last = now;
    if (!st.over && !st.paused) {
      st.active += dt;
      if (!st.lock) st.left -= dt;
      if (st.left <= 0) { st.left = 0; end(); }
      const p = st.left / total;
      const bar = $('bar');
      bar.querySelector('i').style.width = Math.max(0, Math.min(100, p * 100)) + '%';
      bar.classList.toggle('low', st.left < 10000);
      $('secs').textContent = (st.left / 1000).toFixed(1);
      if (lv.key === 'kihon' && st.card && !st.lock) draw();
    }
    if (!st.over) raf = requestAnimationFrame(tick);
  }

  function end() {
    st.over = true;
    if (st.hy) st.hy.stop(false);
    cancelAnimationFrame(raf);
    st.score += st.comboMax * 50;
    // 対戦：最後の点数を送り、みんなが終わるのを待つ（結果はサーバーから）
    if (ta) { ta.onScore(st.score, st.correct, true); ta.onEnd(st); return; }
    const title = (() => { const perMin = st.score / (total / 60000); let t = TITLES[0][1]; TITLES.forEach(([min, n]) => { if (perMin >= min) t = n; }); return t; })();
    // 自己ベスト（全部の範囲で遊んだときだけ）
    const key = `${kbn}|${lv.key}|${settings.sec}`;
    const bests = store.get('best', {});
    const newBest = all && st.score > 0 && (!bests[key] || st.score > bests[key].score);
    if (newBest) { bests[key] = { score: st.score, at: Date.now() }; store.set('best', bests); }
    stack.pop();
    show(() => result({ cat, kbn, lv, st, title, newBest, all, pool }), true);
  }

  el.querySelector('#quit').onclick = async () => {
    if (ta && (!(await ask('対戦をやめますか？', { ok: 'やめる' })) || st.over)) return;
    st.over = true; cancelAnimationFrame(raf);
    if (st.hy) st.hy.stop(false);
    if (ta) ta.onQuit(); else back();
  };

  // 3・2・1 のあとで始める
  const cd = document.createElement('div');
  cd.className = 'count';
  el.appendChild(cd);
  let n = 3;
  const step = () => {
    if (st.over) return;
    if (n === 0) { cd.remove(); nextCard(); last = performance.now(); raf = requestAnimationFrame(tick); return; }
    cd.textContent = n--; buzz.tap();
    setTimeout(step, 650);
  };
  step();
}

// ---------------------------------------------------------------
// 結果
function result({ cat, kbn, lv, st, title, newBest, all, pool }) {
  const s = SETS[kbn];
  const acc = st.keys ? Math.round(st.keys / (st.keys + st.miss) * 1000) / 10 : 0;
  const speed = st.active ? st.keys / (st.active / 1000) : 0;
  const review = st.log.slice(-30).reverse().map(x => `<li><span class="mk ${x.ok ? 'ok' : 'ng'}">${x.ok ? '○' : '×'}</span>
    <span><b>${esc(x.q[1])}</b><small>${qhtml(String(x.q[0])).slice(0, 90)}</small></span></li>`).join('');
  const el = screen('', topBar('結果') + `<div class="scroll result">
    <span class="course">${esc(s.label)}・${esc(lv.label)}・${settings.sec}秒${all ? '' : '（範囲をしぼった練習）'}</span>
    <div class="big">${st.score.toLocaleString()}<small>点</small></div>
    ${newBest ? '<span class="newbest">★ 自己ベスト！</span>' : ''}
    <p class="title">称号<b>${esc(title)}</b></p>
    <div class="stats">
      <div><small>正解</small><b>${st.correct}</b></div>
      <div><small>正確率</small><b>${acc}%</b></div>
      <div><small>速さ</small><b>${speed.toFixed(1)}</b><small>字/秒</small></div>
      <div><small>最大コンボ</small><b>${st.comboMax}</b></div>
      <div><small>ミス</small><b>${st.miss}</b></div>
      <div><small>ボーナス</small><b>+${(st.comboMax * 50).toLocaleString()}</b></div>
    </div>
    <div class="row2"><button class="btn" data-back>問題集へ</button><button class="btn primary" id="again">もう一度</button></div>
    ${review ? `<div class="review"><div class="lab">ふりかえり</div><ul>${review}</ul></div>` : ''}
  </div>`);
  buzz.ok();
  el.querySelector('#again').onclick = () => { stack.pop(); show(() => game({ cat, kbn, pool, all })); };
}

// ---------------------------------------------------------------
(async function start() {
  applyPrefs();
  await loadMenu();
  show(home);
  initAccount().then(syncAds);
  onAccountChange(() => { for (const k in setCache) delete setCache[k]; syncAds(); });
})();
