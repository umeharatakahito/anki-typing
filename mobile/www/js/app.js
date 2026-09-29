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
import { Keyboard } from './keyboard.js';
import { alts, tryAppend, tryCycle, nextChars, bestAnswer, isLatin, prefixState } from './match.js';

const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 問題文は Web 版と同じく、取り込むときに &lt; などにしてある
const qhtml = s => String(s ?? '').replace(/\n/g, '<br>');

const LEVELS = [
  { key: 'shakyo', label: '写経', sub: '読みが見える', plus: 1, minus: 0.5, weight: 0.5 },
  { key: 'kihon',  label: '基本', sub: '少しずつヒント', plus: 2, minus: 1, weight: 1 },
  { key: 'kiwami', label: '極',   sub: 'ヒントなし', plus: 3, minus: 2, weight: 1.5 },
];
const COURSES = [60, 90, 120];
const FAIL_SEC = 3;
const TITLES = [[0, '見習い'], [600, '駆け出し'], [1200, '一人前'], [2000, '腕利き'], [3000, '達人'], [4200, '師範'], [5600, '名人'], [7500, '神']];

// ---- ふるえ（Capacitor の Haptics。ブラウザでは何もしない） ----
const haptics = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
const buzz = {
  tap()  { const h = haptics(); if (h) h.impact({ style: 'LIGHT' }).catch(() => {}); },
  miss() { const h = haptics(); if (h) h.notification({ type: 'ERROR' }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate(40); },
  ok()   { const h = haptics(); if (h) h.notification({ type: 'SUCCESS' }).catch(() => {}); },
};

// ---- 保存（この端末） ----
const store = {
  get(k, d) { try { const v = localStorage.getItem('st.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('st.' + k, JSON.stringify(v)); } catch (e) {} },
};
const settings = Object.assign({ level: 'kihon', sec: 90 }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

// ---- データ ----
let MENU = null, SETS = null;
const setCache = {};
async function loadMenu() {
  const j = await fetch('data/menu.json').then(r => r.json());
  MENU = j.menu; SETS = j.sets;
}
async function loadSet(kbn) {
  if (!setCache[kbn]) setCache[kbn] = await fetch('data/sets/' + kbn + '.json').then(r => r.json());
  return setCache[kbn];
}

// ---- 画面の切り替え（戻るは積んだ順に） ----
const stack = [];
function show(render, push) {
  if (push !== false) stack.push(render);
  $app.innerHTML = '';
  render();
}
function back() {
  stack.pop();
  const r = stack[stack.length - 1];
  if (r) { $app.innerHTML = ''; r(); }
}
const topBar = (title, right) => `<div class="top"><button class="icon-btn" data-back aria-label="戻る">${icon('chevron-left')}</button><h1>${esc(title)}</h1>${right || '<span class="sp"></span>'}</div>`;
function wire(el) {
  el.querySelectorAll('[data-back]').forEach(b => b.onclick = back);
  el.querySelectorAll('.flip').forEach(s => { s.style.transform = 'scaleX(-1)'; });
}
function screen(cls, html) {
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
  <text x="72" y="44" font-family="'Arial Black','Helvetica Neue',sans-serif" font-weight="900" font-size="32" letter-spacing="1"><tspan fill="#fff">STUDY</tspan><tspan fill="#ff6b35" dx="7">TYPE</tspan></text>
  <text x="74" y="78" font-family="'Hiragino Sans',sans-serif" font-weight="700" font-size="15" fill="#93a1bd">打って、覚えて、対戦<tspan fill="#ff6b35" font-size="18">だ。</tspan></text>
</svg>`;

// ---------------------------------------------------------------
// トップ
function home() {
  const tiles = MENU.map(m => `<button class="tile k-${m.color}" data-cat="${m.key}">
    <div class="art">${icon(m.icon)}<span class="price${m.paid ? ' paid' : ''}">${m.paid ? '3割無料' : '無料'}</span></div>
    <div class="body"><span class="en">${esc(m.en)}</span><b>${esc(m.title)}</b><small>${esc(m.lead)}</small></div></button>`).join('');
  const n = Object.values(SETS).reduce((a, s) => a + s.n, 0);
  const el = screen('', `<div class="scroll">
    <div class="hero">${LOGO}<span class="offline">● オフラインでも遊べます（${n.toLocaleString()} 問）</span></div>
    <div class="sec-h">何を勉強する？</div>
    <div class="tiles">${tiles}</div>
  </div>`);
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => show(() => category(b.dataset.cat)));
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
      <span><b>${esc(s.label)}</b><small>${s.n.toLocaleString()} 問${s.paid ? '（無料の範囲）' : ''}</small>${best ? `<span class="best">ベスト ${best.toLocaleString()}</span>` : ''}</span>
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
  const m = MENU.find(x => x.key === cat), s = SETS[kbn];
  const data = await loadSet(kbn);
  const scopes = data.scopes || [];
  const usable = scopes.filter(x => x.free).map(x => x.scope);
  const picked = () => { const want = store.get('scopes.' + kbn, null); const c = Array.isArray(want) ? usable.filter(x => want.includes(x)) : usable; return c.length ? c : usable; };
  const el = screen('k-' + m.color, topBar(s.label) + `<div class="scroll">
    <div id="scope-row"></div>
    <div class="lab">レベル</div>
    <div class="chips" id="lv">${LEVELS.map(l => `<button class="chip" data-lv="${l.key}"><b>${l.label}</b><small>${l.sub}</small></button>`).join('')}</div>
    <div class="lab">コース（持ち時間）</div>
    <div class="chips" id="sec">${COURSES.map(c => `<button class="chip" data-sec="${c}"><b>${c}秒</b><small>${c === 60 ? 'おてがる' : c === 90 ? 'ふつう' : 'じっくり'}</small></button>`).join('')}</div>
    <p class="note" id="lv-note"></p>
    <button class="start" id="go">${icon('play')}スタート</button>
    <p class="note">かなの答えはフリック、英語の答えは英字キーボードで打ちます。わからないときは「パス」、ヒントは次の 1 文字</p>
  </div>`);
  const renderScopes = () => {
    const row = el.querySelector('#scope-row');
    if (scopes.length < 2) { row.innerHTML = ''; return; }
    const c = new Set(picked());
    row.innerHTML = `<div class="lab">出題範囲${c.size < usable.length ? '<button id="sc-all">全部</button>' : ''}</div>
      <div class="scopes">${scopes.map((x, i) => x.free
        ? `<button class="sc${c.has(x.scope) ? ' on' : ''}" data-i="${i}"><span class="bx">${c.has(x.scope) ? '✓' : ''}</span>${esc(x.scope)}</button>`
        : `<span class="sc locked">🔒 ${esc(x.scope)}</span>`).join('')}</div>
      ${s.paid ? '<p class="note">🔒 の範囲は会員向けです（アプリ内の会員は準備中）</p>' : ''}`;
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
    const l = LEVELS.find(x => x.key === settings.level);
    el.querySelector('#lv-note').textContent = `正解 +${l.plus}秒・ミス −${l.minus}秒。ノーミスで続けるとボーナス秒`;
  };
  el.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { settings.level = b.dataset.lv; saveSettings(); renderChips(); buzz.tap(); });
  el.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { settings.sec = Number(b.dataset.sec); saveSettings(); renderChips(); buzz.tap(); });
  el.querySelector('#go').onclick = () => {
    const sel = new Set(picked());
    const pool = data.q.filter(q => scopes.length < 2 || sel.has(q[4]));
    show(() => game({ cat, kbn, pool, all: sel.size === usable.length }));
  };
  renderScopes(); renderChips();
}

// ---------------------------------------------------------------
// ゲーム
function game({ cat, kbn, pool, all }) {
  const m = MENU.find(x => x.key === cat), s = SETS[kbn];
  const lv = LEVELS.find(x => x.key === settings.level);
  const total = settings.sec * 1000;
  // やさしい問題から少しずつ難しく：レベル順に並べて、近いレベルの中でまぜる
  const deck = pool.map(q => ({ q, r: q[3] + Math.random() * 3 })).sort((a, b) => a.r - b.r).map(x => x.q);
  const st = { left: total, active: 0, score: 0, keys: 0, miss: 0, combo: 0, comboMax: 0, correct: 0, i: 0, t: '', card: null, answers: [],
    cardStart: 0, hints: 0, cardMiss: 0, log: [], over: false, paused: false, lock: false };

  const el = screen('game', `
    <div class="hud">
      <button class="icon-btn" id="quit" aria-label="やめる">${icon('x')}</button>
      <div class="clock"><div class="bar" id="bar"><i style="width:100%"></i></div><div class="sec"><b id="secs">${settings.sec.toFixed(1)}</b> 秒</div></div>
      <div class="score"><b id="score">0</b><small>${esc(lv.label)}・${settings.sec}秒</small></div>
    </div>
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
    onCycle: () => { if (!ready()) return; const r = tryCycle(st.t, st.answers); if (r.ok) { st.t = r.t; after(r); } },
    onBack: () => { if (!ready() || !st.t) return; st.t = st.t.slice(0, -1); draw(); },
    onHint: () => { if (!ready()) return; hint(); },
    onPass: () => { if (!ready()) return; finishCard(false); },
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
    $('meta').textContent = (q[4] ? q[4] + '・' : '') + 'Lv' + q[3];
    $('qimg').innerHTML = q[5] ? `<img src="${esc(q[5])}" alt="">` : '';
    $('qtext').innerHTML = qhtml(q[0]);
    $('qtext').scrollTop = 0;
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
    if (!r.ok) {
      st.miss++; st.cardMiss++; st.combo = 0;
      buzz.miss();
      const a = $('ans'); a.classList.remove('miss'); void a.offsetWidth; a.classList.add('miss');
      addTime(-lv.minus);
      return;
    }
    const gained = r.t.replace(/[ .,\-]/g, '').length - st.t.replace(/[ .,\-]/g, '').length;
    if (gained > 0) st.keys += gained;
    st.t = r.t;
    after(r);
  }
  function after(r) {
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
    cancelAnimationFrame(raf);
    st.score += st.comboMax * 50;
    const title = (() => { const perMin = st.score / (total / 60000); let t = TITLES[0][1]; TITLES.forEach(([min, n]) => { if (perMin >= min) t = n; }); return t; })();
    // 自己ベスト（全部の範囲で遊んだときだけ）
    const key = `${kbn}|${lv.key}|${settings.sec}`;
    const bests = store.get('best', {});
    const newBest = all && st.score > 0 && (!bests[key] || st.score > bests[key].score);
    if (newBest) { bests[key] = { score: st.score, at: Date.now() }; store.set('best', bests); }
    stack.pop();
    show(() => result({ cat, kbn, lv, st, title, newBest, all, pool }), true);
  }

  el.querySelector('#quit').onclick = () => { st.over = true; cancelAnimationFrame(raf); back(); };

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
  try {
    const sb = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
    if (sb) sb.setStyle({ style: 'DARK' }).catch(() => {});
  } catch (e) {}
  await loadMenu();
  show(home);
})();
