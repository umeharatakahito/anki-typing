// ===============================================================
// keyboard.js
// アプリの中に出す自作キーボード（スマホ本体のキーボードは使わない）。
//
//   かな … 12 キーのフリック。押して、上下左右に滑らせた向きで あ段〜お段（押しただけなら あ段）。
//          押している間は、キーの上に 5 方向の字を出す。゛゜小 は最後の文字を回す。
//   英字 … QWERTY と数字。
//   どちらにも ヒント（次の 1 文字）と パス、⌫ がある。
//
// new Keyboard(el, { onChar(ch), onCycle(), onBack(), onHint(), onPass(), onMode(mode), peek(n), noHint, passLabel })
//   peek(n) … 次に打つ字（外付けキーボードで、n を「ん」にするか・英字をそのまま渡すかを決めるのに使う）
//   noHint … ヒントのキーを出さない（対戦）。passLabel … パスのキーの字（対戦は「あきらめる」）
// ===============================================================

// [押しただけ, 左, 上, 右, 下]
const FLICK = {
  'あ': ['あ', 'い', 'う', 'え', 'お'], 'か': ['か', 'き', 'く', 'け', 'こ'], 'さ': ['さ', 'し', 'す', 'せ', 'そ'],
  'た': ['た', 'ち', 'つ', 'て', 'と'], 'な': ['な', 'に', 'ぬ', 'ね', 'の'], 'は': ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  'ま': ['ま', 'み', 'む', 'め', 'も'], 'や': ['や', '', 'ゆ', '', 'よ'], 'ら': ['ら', 'り', 'る', 'れ', 'ろ'],
  'わ': ['わ', 'を', 'ん', 'ー', ''],
};
const QWERTY = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

// ---- 外付けキーボード（iPad の Magic Keyboard など）：ローマ字をかなに直して 1 字ずつ渡す ----
// 日本語入力（IME）を通さず、英字のまま打ったキーをここでかなにする。Web 版と同じような打ち方を受け付ける
const ROMA = (() => {
  const m = {};
  const add = (k, v) => k.split(' ').forEach(x => { if (x) m[x] = v; });
  const rows = { '': 'あいうえお', k: 'かきくけこ', s: 'さしすせそ', t: 'たちつてと', n: 'なにぬねの', h: 'はひふへほ', m: 'まみむめも',
    r: 'らりるれろ', g: 'がぎぐげご', z: 'ざじずぜぞ', d: 'だぢづでど', b: 'ばびぶべぼ', p: 'ぱぴぷぺぽ' };
  for (const [c, ks] of Object.entries(rows)) [...'aiueo'].forEach((v, i) => add(c + v, ks[i]));
  add('ya', 'や'); add('yu', 'ゆ'); add('yo', 'よ'); add('wa', 'わ'); add('wo', 'を'); add('yi', 'い'); add('wu', 'う');
  add('shi ci', 'し'); add('chi', 'ち'); add('tsu', 'つ'); add('fu', 'ふ'); add('ji', 'じ'); add('ca', 'か'); add('cu qu', 'く'); add('co', 'こ'); add('ce', 'せ');
  const yo = { ky: 'き', gy: 'ぎ', sy: 'し', sh: 'し', zy: 'じ', jy: 'じ', ty: 'ち', cy: 'ち', ch: 'ち', dy: 'ぢ', ny: 'に', hy: 'ひ', by: 'び', py: 'ぴ', my: 'み', ry: 'り' };
  for (const [c, k] of Object.entries(yo)) { add(c + 'a', k + 'ゃ'); add(c + 'u', k + 'ゅ'); add(c + 'o', k + 'ょ'); }
  add('ja', 'じゃ'); add('ju', 'じゅ'); add('jo', 'じょ'); add('je jye zye', 'じぇ'); add('she sye', 'しぇ'); add('che tye cye', 'ちぇ');
  add('fa fwa', 'ふぁ'); add('fi fwi fyi', 'ふぃ'); add('fe fwe fye', 'ふぇ'); add('fo fwo', 'ふぉ'); add('fyu', 'ふゅ');
  add('va', 'ゔぁ'); add('vi', 'ゔぃ'); add('vu', 'ゔ'); add('ve', 'ゔぇ'); add('vo', 'ゔぉ');
  add('thi', 'てぃ'); add('dhi', 'でぃ'); add('dhu', 'でゅ'); add('twu', 'とぅ'); add('dwu', 'どぅ'); add('tsa', 'つぁ');
  add('wi whi', 'うぃ'); add('we whe', 'うぇ'); add('who', 'うぉ'); add('ye', 'いぇ'); add('kwa qa', 'くぁ'); add('gwa', 'ぐぁ');
  [...'aiueo'].forEach((v, i) => add('x' + v + ' l' + v, 'ぁぃぅぇぉ'[i]));
  add('xya lya', 'ゃ'); add('xyu lyu', 'ゅ'); add('xyo lyo', 'ょ'); add('xtu ltu xtsu ltsu', 'っ'); add('xwa lwa', 'ゎ');
  add('nn xn', 'ん'); add("n'", 'ん'); add('-', 'ー');
  return m;
})();
const ROMA_KEYS = Object.keys(ROMA);
const isAsciiCh = c => /^[ -~]$/.test(c || '');
// これより動かしたらフリック（px）。メニューの「フリックの感度」で変える
export const kbPrefs = { flickMin: 18 };

export class Keyboard {
  constructor(el, handlers) {
    this.el = el;
    this.h = handlers;
    this.mode = 'kana';
    this.pop = document.createElement('div');
    this.pop.className = 'kb-pop';
    this.pop.hidden = true;
    document.body.appendChild(this.pop);
    // 念のため：画面の指が全部離れたら、押したままのキーと十字の案内を必ず消す
    this.pressed = new Set();
    this.clear = () => { this.pop.hidden = true; [...this.pressed].forEach(r => r()); this.el.querySelectorAll('.kb-k.on').forEach(x => x.classList.remove('on')); };
    ['touchend', 'touchcancel'].forEach(t => document.addEventListener(t, e => { if (!e.touches.length) setTimeout(this.clear, 0); }));
    this.render();
    this.attachHardware();
  }

  // 外付けキーボード。打ったら画面のキーボードをしまい（ヒント・パスだけ残す）、画面にさわったら戻す
  attachHardware() {
    let buf = '';
    const peek = n => (this.h.peek ? this.h.peek(n) : '') || '';
    const send = ch => { for (const c of ch) this.h.onChar(c); };
    // 打ちかけのローマ字を、決まった分だけかなにする（final：語の最後などで n を「ん」にしてよいとき）
    const flush = () => {
      for (let guard = 0; buf && guard < 20; guard++) {
        const longer = ROMA_KEYS.some(k => k.length > buf.length && k.startsWith(buf));
        if (ROMA[buf] && !longer) { send(ROMA[buf]); buf = ''; break; }
        if (buf.length >= 2 && buf[0] === buf[1] && !'aiueon'.includes(buf[0])) { send('っ'); buf = buf.slice(1); continue; }
        if (buf[0] === 'n' && buf.length >= 2 && !"aiueoyn'".includes(buf[1])) { send('ん'); buf = buf.slice(1); continue; }
        if (longer) break;
        // どの打ち方の頭にもならない：最初の 1 字をそのまま渡す（ミスになる）
        send(buf[0]); buf = buf.slice(1);
      }
      // 残りが n だけで、答えの最後の「ん」なら、n 1 つで「ん」にする（途中の「ん」は次のキーで決める）
      if (buf === 'n' && peek(2) === 'ん') { send('ん'); buf = ''; }
    };
    const onKey = e => {
      if (!document.body.contains(this.el)) { document.removeEventListener('keydown', onKey, true); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const k = e.key;
      if (k === 'Backspace') { e.preventDefault(); if (buf) buf = buf.slice(0, -1); else this.h.onBack(); return; }
      if (k === 'Tab') { e.preventDefault(); if (this.h.onHint && !this.h.noHint) this.h.onHint(); return; }
      if (k.length !== 1) return;
      e.preventDefault();
      document.body.classList.add('hw-kb');
      const c = k.toLowerCase();
      // 答えを打ち終えて次の問題を待っている間のキー（nn の 2 つ目など）は捨てる
      if (this.h.peek && peek(1) === '') { buf = ''; return; }
      // 英字の答え・英字のところは、そのまま渡す
      if (this.mode === 'latin' || (!buf && isAsciiCh(peek(1)) && peek(1) !== 'ー')) { send(c === ' ' ? ' ' : c); return; }
      if (!/^[a-z'\-]$/.test(c)) { send(c); return; }
      buf += c;
      flush();
    };
    document.addEventListener('keydown', onKey, true);
    // 画面にさわったら、画面のキーボードに戻す
    const touch = () => { document.body.classList.remove('hw-kb'); buf = ''; };
    document.addEventListener('touchstart', touch, { passive: true });

    // iPad では、外付けキーボードの字は「入力欄」に届く。見えない入力欄を置いて、そこに来た字を受け取る
    // （inputmode="none" なので画面のキーボードは出ない。keydown で受けた字は preventDefault で止まるので二重にならない）
    const sink = document.createElement('textarea');
    sink.className = 'hw-sink';
    sink.setAttribute('inputmode', 'none');
    sink.setAttribute('autocapitalize', 'off');
    sink.setAttribute('autocorrect', 'off');
    sink.setAttribute('autocomplete', 'off');
    sink.setAttribute('spellcheck', 'false');
    sink.setAttribute('aria-hidden', 'true');
    sink.tabIndex = -1;
    this.el.parentNode.appendChild(sink);
    const feed = text => {
      for (const ch of text) {
        if (!document.body.contains(this.el)) return;
        document.body.classList.add('hw-kb');
        if (/^[\u3040-\u30ffー]$/.test(ch)) { buf = ''; send(ch); continue; }   // 日本語入力で確定したかな
        onKey({ key: ch, preventDefault() {}, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, fromSink: true });
      }
    };
    sink.addEventListener('beforeinput', e => {
      if (e.inputType === 'insertText' && e.data) { e.preventDefault(); feed(e.data); }
      else if (e.inputType === 'deleteContentBackward') { e.preventDefault(); if (buf) buf = buf.slice(0, -1); else this.h.onBack(); }
    });
    // 日本語入力（かな変換）を通ったときは、確定した字を受け取る
    sink.addEventListener('compositionend', e => { if (e.data) feed(e.data); sink.value = ''; });
    sink.addEventListener('input', () => { if (!sink.matches(':focus') || sink.value === '') return; const v = sink.value; sink.value = ''; feed(v); });
    // iPad のときだけ、ゲーム中は見えない入力欄にフォーカスを置いておく（iPhone は画面のキーボードだけ）
    const wide = () => Math.min(screen.width, screen.height) >= 700;
    const keep = () => { if (wide() && document.body.contains(sink) && document.activeElement !== sink) sink.focus({ preventScroll: true }); };
    // iOS は「指でさわった瞬間」にしか入力欄へフォーカスできないので、待たずにその場で合わせる
    keep();
    document.addEventListener('touchend', keep, { passive: true });
    document.addEventListener('click', keep);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.render();
    if (this.h.onMode) this.h.onMode(mode);
  }

  render() {
    const k = (cls, label, data, extra) => `<button type="button" class="kb-k ${cls}" ${data || ''} ${extra || ''}>${label}</button>`;
    if (this.mode === 'kana') {
      const kana = r => r.map(c => k('kb-kana', `<span class="kb-main">${c}</span><span class="kb-sub">${FLICK[c].slice(1).filter(Boolean).join('')}</span>`, `data-kana="${c}"`)).join('');
      this.el.className = 'kb kb-flick' + (this.h.noHint ? ' no-hint' : '');
      this.el.innerHTML =
        k('kb-fn kb-mode', 'ABC', 'data-act="mode"') + kana(['あ', 'か', 'さ']) + k('kb-fn kb-back', '⌫', 'data-act="back"') +
        k('kb-fn kb-hint kb-tall', 'ヒント<small>次の1字</small>', 'data-act="hint"') + kana(['た', 'な', 'は']) +
        k('kb-fn kb-pass kb-tall', this.h.passLabel || 'パス<small>−3秒</small>', 'data-act="pass"') +
        kana(['ま', 'や', 'ら']) +
        k('kb-fn kb-cycle', '゛゜小', 'data-act="cycle"') + kana(['わ']) + k('kb-kana kb-cho', '<span class="kb-main">ー</span>', 'data-ch="ー"');
    } else {
      const row = (s, cls) => `<div class="kb-row ${cls || ''}">${[...s].map(c => k('kb-latin', c, `data-ch="${c}"`)).join('')}</div>`;
      this.el.className = 'kb kb-qwerty' + (this.h.noHint ? ' no-hint' : '');
      this.el.innerHTML = row(QWERTY[0], 'kb-num') + row(QWERTY[1]) + row(QWERTY[2], 'kb-in') +
        `<div class="kb-row">${k('kb-fn kb-mode', 'かな', 'data-act="mode"')}${[...QWERTY[3]].map(c => k('kb-latin', c, `data-ch="${c}"`)).join('')}${k('kb-fn kb-back', '⌫', 'data-act="back"')}</div>` +
        `<div class="kb-row">${k('kb-fn kb-hint', 'ヒント', 'data-act="hint"')}${k('kb-fn kb-space', 'space', 'data-ch=" "')}${k('kb-fn kb-pass', this.h.passLabel || 'パス −3秒', 'data-act="pass"')}</div>`;
    }
    this.el.querySelectorAll('.kb-k').forEach(b => this.bind(b));
  }

  // キーの押す・滑らせる・離す。iPhone ではタッチの知らせ（touchstart / touchmove / touchend）で受ける
  // （WebView では指を滑らせたあと pointerup が届かないことがあるため）。マウス（パソコンで試すとき）は pointer で受ける
  bind(b) {
    const kana = b.dataset.kana;
    let start = null, dir = 0, tid = null;
    const dirOf = (dx, dy) => {
      if (Math.hypot(dx, dy) < kbPrefs.flickMin) return 0;
      return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 2 : 4);
    };
    const down = (x, y) => {
      start = { x, y }; dir = 0;
      b.classList.add('on');
      this.pressed.add(reset);
      if (this.h.onPress) this.h.onPress();
      if (kana) this.showPop(b, kana, 0);
    };
    const move = (x, y) => {
      if (!start || !kana) return;
      const d = dirOf(x - start.x, y - start.y);
      if (d !== dir && FLICK[kana][d]) { dir = d; this.showPop(b, kana, d); if (this.h.onFlick) this.h.onFlick(); }
    };
    const reset = () => { start = null; tid = null; b.classList.remove('on'); this.pressed.delete(reset); };
    const up = (x, y, cancel) => {
      if (!start) return;
      if (x != null) move(x, y);
      const d = dir;
      reset();
      this.pop.hidden = true;
      if (cancel) return;
      if (kana) { this.h.onChar(FLICK[kana][d] || FLICK[kana][0]); return; }
      if (b.dataset.ch) { this.h.onChar(b.dataset.ch); return; }
      const act = b.dataset.act;
      if (act === 'mode') this.setMode(this.mode === 'kana' ? 'latin' : 'kana');
      else if (act === 'back') this.h.onBack();
      else if (act === 'cycle') this.h.onCycle();
      else if (act === 'hint') this.h.onHint();
      else if (act === 'pass') this.h.onPass();
    };
    const mine = e => [...e.changedTouches].find(t => t.identifier === tid);
    b.addEventListener('touchstart', e => {
      e.preventDefault();   // スクロール・拡大・マウスのまねの知らせを出さない
      if (start) return;
      const t = e.changedTouches[0];
      tid = t.identifier;
      down(t.clientX, t.clientY);
    }, { passive: false });
    b.addEventListener('touchmove', e => { e.preventDefault(); const t = mine(e); if (t) move(t.clientX, t.clientY); }, { passive: false });
    b.addEventListener('touchend', e => { e.preventDefault(); const t = mine(e); if (t) up(t.clientX, t.clientY); }, { passive: false });
    b.addEventListener('touchcancel', e => { const t = mine(e); if (t) up(null, null, true); });
    // マウス（タッチの無いとき）
    b.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} down(e.clientX, e.clientY); });
    b.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') move(e.clientX, e.clientY); });
    b.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') up(e.clientX, e.clientY); });
    b.addEventListener('pointercancel', e => { if (e.pointerType === 'mouse') up(null, null, true); });
  }

  // 押しているキーの上に、5 方向の字を出す（滑らせている向きを明るく）
  showPop(b, kana, dir) {
    const r = b.getBoundingClientRect();
    const f = FLICK[kana];
    const cell = (i, pos) => f[i] ? `<span class="p-${pos}${dir === i ? ' sel' : ''}">${f[i]}</span>` : `<span class="p-${pos} none"></span>`;
    this.pop.innerHTML = cell(2, 'u') + cell(1, 'l') + cell(0, 'c') + cell(3, 'r') + cell(4, 'd');
    const w = r.width;
    Object.assign(this.pop.style, { width: w * 3 + 'px', height: r.height * 3 + 'px',
      left: (r.left + r.width / 2 - w * 1.5) + 'px', top: (r.top + r.height / 2 - r.height * 1.5) + 'px' });
    this.pop.hidden = false;
  }
}
