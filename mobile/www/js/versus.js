// ===============================================================
// versus.js
// アプリの対戦。Web 版と同じサーバーの部屋（/vs/ws）につなぐので、Web の人とも、Wi-Fi と 5G の間でも対戦できる。
//
//   対戦の画面 … 近くの部屋（同じ Wi-Fi）/ ランダム対戦 / 部屋を作る / 番号で入る
//   部屋       … 部屋番号・招待・「ランダムで招待する」（みんなの部屋に出す）・参加者（📱 アプリ / ⌨️ Web）
//   試合       … 先取・サバイバルは 1 問ずつ早い者勝ち。タイムアタックは 1 人用のタイム制で点数を送り合う
//
// やりとりの決まりは cloudflare/src/typing-versus.js の頭に書いてある。
// ===============================================================

import { icon } from './icons.js';
import { getMe, onAccountChange } from './account.js';
import { Keyboard } from './keyboard.js';
import { alts, tryAppend, tryCycle, bestAnswer, isLatin, prefixState, nextChars } from './match.js';
import { hayaoshi, hyKanji } from './hayaoshi.js';
import * as sound from './sound.js';
import { show, back, screen, topBar, esc, qhtml, store, LEVELS, buzz, game, onLeave, getSets, fitText } from './app.js';

const SERVER = () => store.get('server', 'https://studytype.umekobo.com');
const wsUrl = path => SERVER().replace(/^http/, 'ws') + path;
const MODE_OF = { shakyo: '写経モード', kihon: '通常モード', kiwami: '極みモード' };
const LV_OF = { '写経モード': 'shakyo', '通常モード': 'kihon', '極みモード': 'kiwami' };
const RULES = {
  first:    { name: '先取', targets: [3, 5, 7, 10], def: 5, unit: t => t + '本先取' },
  survival: { name: 'サバイバル', targets: [1, 3, 5], def: 3, unit: t => 'ライフ' + t },
  time:     { name: 'タイムアタック', targets: [60, 90, 120], def: 90, unit: t => t + '秒' },
};
const ROUND_SEC = 30;   // 1 問の持ち時間（過ぎたら、その問題はもう打てない）
// 対戦の設定（この端末）。app.js との読み込み順のため、初めて使うときに読む
let prefs = null, watching = false;
const loadPrefs = () => {
  if (prefs) return prefs;
  if (!watching) { watching = true; onAccountChange(() => { prefs = null; }); }   // アカウントで名前を変えたら読み直す
  prefs = Object.assign({ rule: 'first', target: { first: 5, survival: 3, time: 90 }, level: 'kihon', nick: '', near: true }, store.get('vs', {}));
  const me = getMe();
  if (!prefs.nick && me && me.name) prefs.nick = me.name;   // 名前が空ならアカウントの表示名
  return prefs;
};
const savePrefs = () => store.set('vs', prefs);

// サーバーの問題 → アプリの問題の形 [que, kan, ans, level, scope, img, note, kbn]（図はサーバーから。kbn は早押しの見せ方を決める）
const toCard = q => [q.que, q.kan, q.ans, q.level || 1, '', q.img ? (/^https?:/.test(q.img) ? q.img : SERVER() + q.img) : '', q.note, q.kbn || ''];

// ---- つなぎ（部屋 1 つ分。部屋を出るまで画面をまたいで持つ） ----
const vs = { ws: null, seat: 0, room: null, players: [], host: 0, pub: false, ui: {}, start: null };
const vsSend = m => { if (vs.ws && vs.ws.readyState === 1) vs.ws.send(JSON.stringify(m)); };
function vsClose() { if (vs.ws) { const w = vs.ws; vs.ws = null; try { w.close(); } catch (e) {} } }
const nameOf = s => s === vs.seat ? 'あなた' : ((vs.players.find(p => p.seat === s) || {}).name || '相手');
const devOf = s => ((vs.players.find(p => p.seat === s) || {}).dev === 'app' ? '📱' : '⌨️');

// 点数のメーター（Web の scoreMeters と同じ形）。先取は区切りつきのバー、サバイバルはライフ、タイムアタックは点数
// 自分は赤、ほかは席の順に 青・緑・橙。いちばん多い人に 👑
const COLORS = ['c1', 'c2', 'c3'];
function meterHtml(rule, target, scores, lives) {
  const seats = [vs.seat, ...vs.players.map(p => p.seat).filter(x => x !== vs.seat)];
  const val = x => rule === 'survival' && lives ? (lives[x] || 0) : (scores[x] || 0);
  const max = rule === 'time' ? Math.max(1, ...seats.map(val)) : target;
  const best = Math.max(...seats.map(val));
  return `<div class="vs-meters">${seats.map((x, i) => {
    const v = val(x), dead = rule === 'survival' && lives && !lives[x];
    const shown = rule === 'survival' ? ('❤'.repeat(v) || '脱落') : rule === 'time' ? v.toLocaleString() : v + '/' + target;
    const color = x === vs.seat ? 'me' : COLORS[(i - 1) % 3];
    return `<div class="vm ${color}${dead ? ' dead' : ''}${v === best && v > 0 && seats.length > 1 ? ' lead' : ''}">
      <span class="vm-who">${esc(nameOf(x))} ${devOf(x)}</span>
      <span class="vm-track"${rule === 'time' ? '' : ` style="--seg:${100 / target}%"`}><span class="vm-fill" style="width:${Math.min(100, v / max * 100)}%"></span></span>
      <span class="vm-val">${shown}</span></div>`;
  }).join('')}</div>`;
}

function connect(params, onFail) {
  vsClose();
  const q = new URLSearchParams(Object.assign({ dev: 'app', nick: loadPrefs().nick || '' }, params));
  const ws = new WebSocket(wsUrl('/vs/ws?' + q));
  vs.ws = ws;
  ws.onmessage = e => {
    if (vs.ws !== ws) return;
    const m = JSON.parse(e.data);
    if (m.t === 'error') {
      ws.gotError = true;
      if (m.message === 'busy') { connect(params, onFail); return; }   // 番号がかぶったら作り直す
      if (onFail) { onFail(m.message); return; }
      if (vs.ui.onError) vs.ui.onError(m.message);
      return;
    }
    onMessage(m);
  };
  ws.onclose = () => { if (vs.ws !== ws) return; vs.ws = null; if (!ws.gotError && vs.ui.onClose) vs.ui.onClose(); };
}

function onMessage(m) {
  if (m.t === 'room') {
    vs.seat = m.seat; vs.room = m; vs.pub = !!m.pub;
    show(room);
    return;
  }
  if (m.t === 'players') {
    vs.players = m.players; vs.host = m.host; vs.pub = !!m.pub;
    if (vs.ui.onPlayers) vs.ui.onPlayers(m);
    return;
  }
  if (m.t === 'start') {
    vs.start = m;
    if (m.rule === 'time') startTimeAttack(m); else show(() => rounds(m), false);
    return;
  }
  if (m.t === 'move') { connect({ code: m.code }); return; }   // Web の「同じメンバーで部屋を変える」
  const f = vs.ui['on' + m.t[0].toUpperCase() + m.t.slice(1)];
  if (f) f(m);
}

// ---------------------------------------------------------------
// 対戦の画面（問題集をえらんでいれば部屋も作れる。トップからなら入るだけ）
export function lobby(cat, kbn) {
  loadPrefs();
  const s = kbn ? getSets()[kbn] : null;
  const seg = (key, opts, cur) => `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const el = screen('', topBar(s ? '対戦・' + s.label : '対戦') + `<div class="scroll vs-lobby">
    <div class="vs-near" id="near"><div class="vn-h"><span class="vn-dot"></span>近くの部屋（同じ Wi-Fi）</div><div id="near-list"><p class="note">探しています…</p></div></div>

    <button class="start" id="random">🎲 ランダム対戦</button>
    <p class="note">みんなの部屋から、入れる部屋にでたらめに入ります。${s ? 'なければ、この問題集で部屋を作って相手を待ちます' : '（部屋を作るには、問題集をえらんでから「対戦」へ）'}</p>

    ${s ? `<div class="m-sec">部屋を作る</div>
    <div class="m-card">
      <div class="m-row"><span class="grow"><b>ルール</b></span>${seg('rule', Object.entries(RULES).map(([k, r]) => [k, r.name]), prefs.rule)}</div>
      <div class="m-row"><span class="grow"><b id="t-lab">本数</b></span><span id="t-seg"></span></div>
      <div class="m-row"><span class="grow"><b>レベル</b></span>${seg('level', LEVELS.map(l => [l.key, l.label]), prefs.level)}</div>
      <div class="m-row"><span class="grow"><b>同じ Wi-Fi の人に出す</b><small>近くの人の画面に、この部屋が出ます</small></span><button class="switch${prefs.near ? ' on' : ''}" id="sw-near"></button></div>
    </div>
    <button class="btn primary wide" id="create">＋ 部屋を作る</button>` : ''}

    <div class="m-sec">部屋番号で入る</div>
    <div class="join-row"><input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="5" placeholder="1234" autocomplete="off"><button class="btn" id="join">入る</button></div>

    <div class="m-sec">あなたの名前（対戦で相手に見える）</div>
    <input id="nick" class="nick" maxlength="12" placeholder="ゲスト" value="${esc(prefs.nick)}" autocomplete="off">
    <p class="note" id="msg"></p>
  </div>`);
  const $ = sel => el.querySelector(sel);
  const msg = t => { $('#msg').textContent = t || ''; };
  const drawTarget = () => {
    if (!s) return;
    const r = RULES[prefs.rule];
    $('#t-lab').textContent = prefs.rule === 'time' ? '持ち時間' : prefs.rule === 'survival' ? 'ライフ' : '本数';
    $('#t-seg').innerHTML = `<div class="seg" data-k="target">${r.targets.map(t => `<button data-v="${t}" class="${prefs.target[prefs.rule] === t ? 'on' : ''}">${prefs.rule === 'time' ? t + '秒' : t}</button>`).join('')}</div>`;
    bindSegs();
  };
  function bindSegs() {
    el.querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = g.dataset.k, v = b.dataset.v;
      if (k === 'target') prefs.target[prefs.rule] = Number(v); else prefs[k] = v;
      savePrefs(); buzz.tap();
      g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (k === 'rule') drawTarget();
    }));
  }
  bindSegs(); drawTarget();
  $('#nick').onchange = e => { prefs.nick = e.target.value.trim().slice(0, 12); savePrefs(); };
  if ($('#sw-near')) $('#sw-near').onclick = e => { prefs.near = !prefs.near; savePrefs(); e.currentTarget.classList.toggle('on', prefs.near); };

  const createParams = extra => Object.assign({ create: 1, kbn, mode: MODE_OF[prefs.level], rule: prefs.rule,
    target: prefs.target[prefs.rule], near: prefs.near ? '1' : '0' }, extra || {});
  vs.ui = { onError: t => msg(t), onClose: () => msg('通信が切れました。もう一度お試しください') };
  if ($('#create')) $('#create').onclick = () => { msg('部屋を作っています…'); connect(createParams()); };
  $('#join').onclick = () => {
    const code = $('#code').value.replace(/\D/g, '');
    if (code.length < 4) { msg('4 桁の部屋番号を入れてください'); return; }
    msg('入っています…'); connect({ code });
  };
  // ランダム対戦：みんなの部屋から入れる部屋に入る。どこも入れなければ、この問題集でみんなの部屋を作る
  $('#random').onclick = () => {
    msg('入れる部屋を探しています…');
    const w = new WebSocket(wsUrl('/vs/public'));
    w.onerror = () => msg('通信できませんでした（電波を確かめてください）');
    w.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t !== 'near') return;
      w.close();
      const list = (m.rooms || []).filter(r => r.n < r.max).sort(() => Math.random() - 0.5);
      const next = () => {
        const r = list.shift();
        if (!r) {
          if (!s) { msg('いま入れる部屋がありません。問題集をえらんでから「対戦」を押すと、部屋を作って待てます'); return; }
          msg('入れる部屋が無かったので、部屋を作って相手を待ちます');
          connect(createParams({ pub: 1 }));
          return;
        }
        msg((r.host || 'だれか') + ' さんの部屋（' + r.label + '）に入っています…');
        connect({ code: r.code }, next);
      };
      next();
    };
  };

  // 近くの部屋（同じ Wi-Fi）。見ている間だけつなぐ
  let nearWs = null, retry = null;
  const watch = () => {
    nearWs = new WebSocket(wsUrl('/vs/near'));
    nearWs.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t !== 'near') return;
      const rooms = m.rooms || [];
      $('#near-list').innerHTML = rooms.length ? rooms.map(r => `<button class="vn-room" data-code="${esc(r.code)}">
        <span><b>${esc(r.host || 'ゲスト')} の部屋</b><small>${esc(r.label)}・${esc((LEVELS.find(l => l.key === LV_OF[r.mode]) || {}).label || '')}・${esc((RULES[r.rule] || RULES.first).unit(r.target))}・${r.n}/${r.max}人</small></span><em>入る</em></button>`).join('')
        : '<p class="note">同じ Wi-Fi の人が部屋を作ると、ここに出ます。押すだけで入れます</p>';
      el.querySelectorAll('.vn-room').forEach(b => b.onclick = () => { msg('入っています…'); connect({ code: b.dataset.code }); });
    };
    nearWs.onerror = () => { $('#near-list').innerHTML = '<p class="note">オフラインです（対戦は電波がいります）</p>'; };
    nearWs.onclose = () => { retry = setTimeout(() => { if (nearWs) watch(); }, 5000); };
  };
  watch();
  onLeave(() => { clearTimeout(retry); const w = nearWs; nearWs = null; if (w) { w.onclose = null; try { w.close(); } catch (e) {} } });
}

// ---------------------------------------------------------------
// 部屋（相手を待つ）
function room() {
  const r = vs.room;
  const s = getSets()[r.kbn];
  const label = (s ? s.label : r.kbn) + '・' + ((LEVELS.find(l => l.key === LV_OF[r.mode]) || {}).label || '') + '・' + (RULES[r.rule] || RULES.first).unit(r.target);
  const link = 'https://studytype.umekobo.com/?p=shikaku&join=' + r.code;
  const el = screen('', topBar('部屋') + `<div class="scroll vs-room">
    <p class="note center">${esc(label)}</p>
    <div class="code-box"><small>部屋番号</small><b>${esc(r.code)}</b></div>
    <div class="row2"><button class="btn" id="share">📨 招待を送る</button><button class="btn" id="pub"></button></div>
    <div class="m-sec">参加者 <span id="count"></span></div>
    <div class="m-card" id="players"></div>
    <button class="start" id="begin" hidden>▶ この人数で始める</button>
    <p class="note center" id="wait"></p>
  </div>`);
  const $ = sel => el.querySelector(sel);
  const draw = () => {
    $('#count').textContent = `${vs.players.length}/4 人`;
    $('#players').innerHTML = vs.players.map(p => `<div class="m-row"><span class="grow"><b>${p.seat === vs.host ? '👑 ' : ''}${esc(p.seat === vs.seat ? 'あなた' : p.name)}</b></span><span title="${p.dev === 'app' ? 'スマホアプリ' : 'Web'}">${p.dev === 'app' ? '📱' : '⌨️'}</span></div>`).join('');
    const isHost = vs.host === vs.seat;
    $('#begin').hidden = !(isHost && vs.players.length >= 2);
    $('#pub').hidden = !isHost;
    $('#pub').textContent = vs.pub ? '🌐 みんなに公開中' : '🌐 ランダムで招待';
    $('#pub').classList.toggle('primary', vs.pub);
    $('#wait').textContent = vs.players.length < 2 ? (vs.pub ? 'みんなの部屋に出しています。だれかが入るのを待っています' : '友達が入るのを待っています。部屋番号を伝えるか、招待を送ってください')
      : isHost ? '4 人そろうか「この人数で始める」を押すと始まります' : '部屋を作った人が始めるのを待っています';
  };
  vs.ui = {
    onPlayers: m => { draw(); if (m.left) $('#wait').textContent = m.left + ' さんが抜けました'; },
    onError: t => { $('#wait').textContent = t; },
    onClose: () => { $('#wait').textContent = '通信が切れました'; },
  };
  $('#begin').onclick = () => { vsSend({ t: 'begin' }); $('#begin').hidden = true; };
  $('#pub').onclick = () => vsSend({ t: 'public', on: !vs.pub });
  $('#share').onclick = async () => {
    const text = `STUDY TYPE で対戦しよう！ 部屋番号 ${r.code}`;
    try { if (navigator.share) { await navigator.share({ title: 'STUDY TYPE 対戦', text, url: link }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(text + ' ' + link); $('#wait').textContent = '招待のリンクをコピーしました'; } catch (e) {}
  };
  el.querySelector('[data-back]').onclick = () => { vsClose(); back(); };
  draw();
}

// ---------------------------------------------------------------
// 試合：先取・サバイバル（1 問ずつ早い者勝ち）
function rounds(start) {
  const lv = LEVELS.find(l => l.key === LV_OF[vs.room.mode]) || LEVELS[1];
  const missLimit = lv.key === 'kiwami' ? 5 : 10;
  const qs = start.questions.map(toCard);
  const g = { r: -1, t: '', answers: [], cardMiss: 0, out: true, done: false, scores: {}, lives: start.lives || null, opp: {}, timer: null, progAt: 0, progT: null, over: false, hy: null };
  const el = screen('game vs-game', `
    <div class="hud vs-hud"><button class="icon-btn" id="quit" aria-label="やめる">${icon('x')}</button><div class="meters" id="meters"></div></div>
    <div class="stage" id="stage">
      <div class="q-meta" id="meta"></div>
      <div class="q-img" id="qimg"></div>
      <div class="q-text" id="qtext"></div>
      <div class="opps" id="opps"></div>
      <div class="answer" id="ans"><div class="typed" id="typed"></div><div class="reveal" id="reveal"></div></div>
    </div>
    <div class="kb" id="kb"></div>
    <div class="vs-point" id="point" hidden></div>`);
  const $ = id => el.querySelector('#' + id);
  const kb = new Keyboard($('kb'), {
    onPress: () => buzz.tap(),
    onChar: ch => input(ch),
    onCycle: () => { if (!ready()) return; const r = tryCycle(g.t, g.answers); if (r.ok) { g.t = r.t; after(r); } else if (r.miss) miss(); },
    onBack: () => { if (!ready() || !g.t) return; g.t = g.t.slice(0, -1); draw(); prog(); },
    onHint: () => {},
    onPass: () => { if (ready()) giveUp('あきらめました'); },
    noHint: true, passLabel: 'あきらめる<small>この問題</small>',
    peek: n => g.r >= 0 ? nextChars(g.t, g.answers, n) : '',
  });
  const ready = () => !g.over && !g.out && !g.done && g.r >= 0;

  function meters(scores, lives) {
    $('meters').innerHTML = meterHtml(vs.room.rule, vs.room.target, scores, lives);
  }
  function opps() {
    // iPad（広い画面）は Web 版と同じく、問題の下に「自分の入力」と相手ごとの枠を横に並べる
    if (matchMedia('(min-width: 700px)').matches) {
      const others = vs.players.filter(p => p.seat !== vs.seat);
      $('stage').style.setProperty('--vs-n', String(others.length + 1));
      $('stage').classList.add('vs-wide');
      $('ans').dataset.who = 'あなた';
      $('opps').innerHTML = others.map((p, i) => {
        const o = g.opp[p.seat] || {};
        const pct = o.total ? Math.round(o.done / o.total * 100) : 0;
        return `<div class="op-panel ${COLORS[i % 3]}${o.out ? ' out' : ''}">
          <div class="op-name">${esc(p.name)} ${p.dev === 'app' ? '📱' : '⌨️'}</div>
          <div class="op-typed">${esc(o.typed || '')}${o.out ? '<small>（打てません）</small>' : ''}</div>
          <div class="bar"><i style="width:${o.out ? 100 : pct}%"></i></div></div>`;
      }).join('');
      return;
    }
    $('stage').classList.remove('vs-wide');
    $('opps').innerHTML = vs.players.filter(p => p.seat !== vs.seat).map(p => {
      const o = g.opp[p.seat] || {};
      const pct = o.total ? Math.round(o.done / o.total * 100) : 0;
      return `<div class="opp"><span>${esc(p.name)} ${p.dev === 'app' ? '📱' : '⌨️'}</span><div class="bar"><i style="width:${o.out ? 100 : pct}%${o.out ? ';background:var(--muted)' : ''}"></i></div></div>`;
    }).join('');
  }
  function draw() {
    const a = bestAnswer(g.t, g.answers);
    const state = prefixState(g.t, a);
    // 写経は読みを全部、ほかは出さない（相手と公平に）
    const rest = lv.key === 'shakyo' ? a.slice(g.t.length) : '';
    const typed = state === 'near' ? esc(g.t.slice(0, -1)) + `<span class="near">${esc(g.t.slice(-1))}</span>` : esc(g.t);
    $('typed').innerHTML = typed + '<span class="caret"></span>' + (rest ? `<span class="rest">${esc(rest)}</span>` : '');
  }
  function prog() {
    clearTimeout(g.progT);
    const sendNow = () => { g.progAt = Date.now(); vsSend({ t: 'prog', r: g.r, done: g.t.length, total: bestAnswer(g.t, g.answers).length, typed: g.t, miss: g.cardMiss }); };
    if (Date.now() - g.progAt > 120) sendNow(); else g.progT = setTimeout(sendNow, 120);
  }
  function setRound(r) {
    g.r = r; g.t = ''; g.cardMiss = 0; g.out = false; g.done = false; g.opp = {};
    const q = qs[r];
    if (!q) return;
    g.answers = alts(q[2]);
    kb.setMode(isLatin(g.answers) ? 'latin' : 'kana');
    $('meta').textContent = `第 ${r + 1} 問・ミス ${missLimit} 回まで`;
    sound.jajan();   // 出題の「ジャ・ジャーン」
    // 早押し：問題文は少しずつ、絵は寄りから引いていく（hayaoshi.js）
    if (g.hy) g.hy.stop(false);
    const nk = hyKanji(q[7], q[0], q[1]);
    $('qimg').innerHTML = q[5] && !nk ? `<img src="${esc(q[5])}" alt="">` : '';
    $('qtext').innerHTML = qhtml(nk ? nk.que : q[0]);
    g.hy = hayaoshi({ holder: $('qimg'), textEl: $('qtext'), kbn: q[7], img: q[5], kanji: nk && nk.kanji, ms: ROUND_SEC * 1000 });
    fitText($('qtext'));
    const im = $('qimg').querySelector('img');
    if (im) im.addEventListener('load', () => fitText($('qtext')));
    $('ans').className = 'answer';
    $('reveal').innerHTML = '';
    $('point').hidden = true;
    draw(); opps();
    clearTimeout(g.timer);
    g.timer = setTimeout(() => { if (ready()) giveUp('時間切れ'); }, ROUND_SEC * 1000);
  }
  function input(ch) {
    if (!ready()) return;
    const r = tryAppend(g.t, ch, g.answers);
    if (!r.ok) { miss(); return; }
    g.t = r.t;
    after(r);
  }
  function after(r) {
    sound.key();
    draw(); prog();
    if (r.done) {
      g.done = true; clearTimeout(g.timer);
      vsSend({ t: 'win', r: g.r });
      buzz.ok();
      $('ans').className = 'answer done';
      $('reveal').textContent = '打ち終えました！';
    }
  }
  function miss() {
    g.cardMiss++; buzz.miss(); sound.miss();
    const a = $('ans'); a.classList.remove('miss'); void a.offsetWidth; a.classList.add('miss');
    $('meta').textContent = `第 ${g.r + 1} 問・ミス ${g.cardMiss}/${missLimit}`;
    prog();
    if (g.cardMiss >= missLimit) giveUp('ミスが多すぎたので、この問題はもう打てません');
  }
  function giveUp(why) {
    g.out = true; clearTimeout(g.timer);
    vsSend({ t: 'out', r: g.r, miss: g.cardMiss });
    $('reveal').textContent = why + '（ほかの人を待っています）';
  }

  vs.ui = {
    onOpp: m => { if (m.r !== g.r) return; g.opp[m.seat] = Object.assign(g.opp[m.seat] || {}, m); opps(); },
    onPoint: m => {
      g.scores = m.scores; if (m.lives) g.lives = m.lives;
      clearTimeout(g.timer); g.out = true;
      if (g.hy) g.hy.stop(true);   // 結果を出すときは、問題文も絵も全部見せる
      const q = qs[m.r] || [];
      const who = m.seat == null ? 'だれも取れませんでした' : m.seat === vs.seat ? 'あなたが 1 本！' : nameOf(m.seat) + ' さんが 1 本';
      if (m.seat === vs.seat) buzz.ok();
      const p = $('point');
      p.innerHTML = `<div class="pt-card"><b class="${m.seat === vs.seat ? 'win' : ''}">${esc(who)}</b><p>答え：<b>${esc(q[1] || '')}</b></p>
        ${q[6] ? `<small>${esc(String(q[6]).split('\n')[0]).slice(0, 90)}</small>` : ''}
        ${meterHtml(vs.room.rule, vs.room.target, m.scores, m.lives)}<p class="pt-next">${m.final ? '決着！' : '次の問題へ…'}</p></div>`;
      p.hidden = false;
      meters(g.scores, g.lives);
    },
    onRound: m => setRound(m.r),
    onMore: m => { qs.push(...m.questions.map(toCard)); },
    onPlayers: m => { meters(g.scores, g.lives); opps(); if (m.left) $('reveal').textContent = m.left + ' さんが抜けました'; },
    onEnd: m => { g.over = true; clearTimeout(g.timer); if (g.hy) g.hy.stop(false); show(() => result(m), false); },
    onClose: () => { if (!g.over) $('reveal').textContent = '通信が切れました'; },
  };
  $('quit').onclick = () => { if (!confirm('対戦をやめて部屋を出ますか？')) return; g.over = true; clearTimeout(g.timer); if (g.hy) g.hy.stop(false); vsClose(); leaveToLobby(); };
  meters({}, g.lives); opps();
  // 3・2・1（サーバーの in ミリ秒に合わせる）
  const cd = document.createElement('div');
  cd.className = 'count';
  el.appendChild(cd);
  const until = Date.now() + (start.in || 3000);
  const tick = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    if (left <= 0 || g.over) { cd.remove(); if (!g.over) setRound(0); return; }
    cd.textContent = left; setTimeout(tick, 200);
  };
  tick();
}

// ---------------------------------------------------------------
// 試合：タイムアタック（1 人用のタイム制を、部屋の問題・持ち時間で）
function startTimeAttack(start) {
  const others = {};
  let mine = 0;
  // 試合中の画面の上に、みんなの点数のメーター
  const drawTa = () => {
    const el = document.getElementById('ta-meters');
    if (!el) return;
    const sc = Object.fromEntries(Object.entries(others).map(([k, v]) => [k, v.score || 0]));
    sc[vs.seat] = mine;
    el.innerHTML = meterHtml('time', start.target, sc, null);
  };
  show(() => game({ cat: '', kbn: vs.room.kbn, pool: start.questions.map(toCard), all: false, ta: {
    seconds: start.target, level: LV_OF[vs.room.mode] || 'kihon', meters: true,
    onScore: (score, correct, fin) => { mine = score; drawTa(); vsSend({ t: 'ta', score, correct, fin }); },
    onEnd: st => show(() => taWait(st, others), false),
    onQuit: () => { vsClose(); leaveToLobby(); },
  } }), false);
  setTimeout(drawTa, 50);
  vs.ui = {
    onTas: m => { others[m.seat] = m; drawTa(); },
    onEnd: m => show(() => result(m), false),
    onPlayers: () => {},
  };
}
function taWait(st, others) {
  const el = screen('', `<div class="scroll result"><div class="big">${st.score.toLocaleString()}<small>点</small></div>
    <p class="title">ほかの人が終わるのを待っています…</p><div class="m-card" id="others"></div></div>`);
  const draw = () => {
    el.querySelector('#others').innerHTML = vs.players.filter(p => p.seat !== vs.seat).map(p => {
      const o = others[p.seat] || {};
      return `<div class="m-row"><span class="grow"><b>${esc(p.name)} ${p.dev === 'app' ? '📱' : '⌨️'}</b></span><b>${(o.score || 0).toLocaleString()}</b><small>${o.fin ? ' 終了' : ' プレイ中'}</small></div>`;
    }).join('');
  };
  vs.ui.onTas = m => { others[m.seat] = m; draw(); };
  draw();
}

// ---------------------------------------------------------------
// 結果（もう一度 / 部屋を出る）
function result(m) {
  const lives = m.lives, time = vs.start && vs.start.rule === 'time';
  const order = vs.players.map(p => p.seat).sort((a, b) => lives ? (lives[b] || 0) - (lives[a] || 0) : (m.scores[b] || 0) - (m.scores[a] || 0));
  const win = m.winner === vs.seat;
  const el = screen('', `<div class="scroll result">
    <div class="vs-res ${win ? 'win' : ''}">${m.winner == null ? '引き分け' : win ? '🏆 あなたの勝ち！' : esc(nameOf(m.winner)) + ' さんの勝ち'}</div>
    ${m.left ? `<p class="note center">${esc(nameOf(m.left))} さんが抜けました</p>` : ''}
    ${meterHtml(vs.start ? vs.start.rule : 'first', vs.start ? vs.start.target : 5, m.scores || {}, lives)}
    <div class="m-card">${order.map((s, i) => `<div class="m-row${s === vs.seat ? ' me' : ''}"><b class="rank">${i + 1}</b><span class="grow"><b>${esc(nameOf(s))} ${devOf(s)}</b></span>
      <b>${lives ? ('❤'.repeat(lives[s] || 0) || '脱落') : time ? (m.scores[s] || 0).toLocaleString() + ' 点' : (m.scores[s] || 0) + ' 本'}</b></div>`).join('')}</div>
    <div class="row2"><button class="btn" id="leave">部屋を出る</button><button class="btn primary" id="again">もう一度</button></div>
    <p class="note center" id="ready"></p>
  </div>`);
  if (win) buzz.ok();
  const $ = sel => el.querySelector(sel);
  const drawReady = () => { const n = vs.players.filter(p => p.again).length; $('#ready').textContent = `もう一度：準備OK ${n}/${vs.players.length}`; };
  vs.ui = { onPlayers: drawReady, onClose: () => { $('#ready').textContent = '部屋が閉じました'; $('#again').disabled = true; } };
  $('#again').onclick = () => { vsSend({ t: 'again' }); $('#again').disabled = true; $('#again').textContent = 'ほかの人を待っています…'; };
  $('#leave').onclick = () => { vsClose(); leaveToLobby(); };
  drawReady();
}

// 部屋を出て、対戦の画面（入る前にいた画面）へ戻る
function leaveToLobby() {
  vs.room = null; vs.players = []; vs.ui = {};
  back();
}
