// ===============================================================
// keyboard.js
// アプリの中に出す自作キーボード（スマホ本体のキーボードは使わない）。
//
//   かな … 12 キーのフリック。押して、上下左右に滑らせた向きで あ段〜お段（押しただけなら あ段）。
//          押している間は、キーの上に 5 方向の字を出す。゛゜小 は最後の文字を回す。
//   英字 … QWERTY と数字。
//   どちらにも ヒント（次の 1 文字）と パス、⌫ がある。
//
// new Keyboard(el, { onChar(ch), onCycle(), onBack(), onHint(), onPass(), onMode(mode) })
// ===============================================================

// [押しただけ, 左, 上, 右, 下]
const FLICK = {
  'あ': ['あ', 'い', 'う', 'え', 'お'], 'か': ['か', 'き', 'く', 'け', 'こ'], 'さ': ['さ', 'し', 'す', 'せ', 'そ'],
  'た': ['た', 'ち', 'つ', 'て', 'と'], 'な': ['な', 'に', 'ぬ', 'ね', 'の'], 'は': ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  'ま': ['ま', 'み', 'む', 'め', 'も'], 'や': ['や', '', 'ゆ', '', 'よ'], 'ら': ['ら', 'り', 'る', 'れ', 'ろ'],
  'わ': ['わ', 'を', 'ん', 'ー', ''],
};
const QWERTY = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const FLICK_MIN = 18;   // これより動かしたらフリック（px）

export class Keyboard {
  constructor(el, handlers) {
    this.el = el;
    this.h = handlers;
    this.mode = 'kana';
    this.pop = document.createElement('div');
    this.pop.className = 'kb-pop';
    this.pop.hidden = true;
    document.body.appendChild(this.pop);
    // 指を離した知らせがキーに届かないことがある（iPhone の WebView）。画面のどこで離しても案内は消す
    this.active = 0;
    this.clear = () => { this.pop.hidden = true; this.el.querySelectorAll('.kb-k.on').forEach(b => b.classList.remove('on')); };
    ['touchend', 'touchcancel'].forEach(t => document.addEventListener(t, e => { if (!e.touches.length) setTimeout(this.clear, 0); }, true));
    this.render();
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
      this.el.className = 'kb kb-flick';
      this.el.innerHTML =
        k('kb-fn kb-mode', 'ABC', 'data-act="mode"') + kana(['あ', 'か', 'さ']) + k('kb-fn kb-back', '⌫', 'data-act="back"') +
        k('kb-fn kb-hint kb-tall', 'ヒント<small>次の1字</small>', 'data-act="hint"') + kana(['た', 'な', 'は']) +
        k('kb-fn kb-pass kb-tall', 'パス<small>−3秒</small>', 'data-act="pass"') +
        kana(['ま', 'や', 'ら']) +
        k('kb-fn kb-cycle', '゛゜小', 'data-act="cycle"') + kana(['わ']) + k('kb-kana kb-cho', '<span class="kb-main">ー</span>', 'data-ch="ー"');
    } else {
      const row = (s, cls) => `<div class="kb-row ${cls || ''}">${[...s].map(c => k('kb-latin', c, `data-ch="${c}"`)).join('')}</div>`;
      this.el.className = 'kb kb-qwerty';
      this.el.innerHTML = row(QWERTY[0], 'kb-num') + row(QWERTY[1]) + row(QWERTY[2], 'kb-in') +
        `<div class="kb-row">${k('kb-fn kb-mode', 'かな', 'data-act="mode"')}${[...QWERTY[3]].map(c => k('kb-latin', c, `data-ch="${c}"`)).join('')}${k('kb-fn kb-back', '⌫', 'data-act="back"')}</div>` +
        `<div class="kb-row">${k('kb-fn kb-hint', 'ヒント', 'data-act="hint"')}${k('kb-fn kb-space', 'space', 'data-ch=" "')}${k('kb-fn kb-pass', 'パス −3秒', 'data-act="pass"')}</div>`;
    }
    this.el.querySelectorAll('.kb-k').forEach(b => this.bind(b));
  }

  bind(b) {
    let start = null, dir = 0, id = null;
    const kana = b.dataset.kana;
    const dirOf = (dx, dy) => {
      if (Math.hypot(dx, dy) < FLICK_MIN) return 0;
      return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 2 : 4);
    };
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (start && e.pointerId === id) return;   // 同じ指の二重の知らせ
      id = e.pointerId;
      try { b.setPointerCapture(id); } catch (x) {}
      start = { x: e.clientX, y: e.clientY };
      dir = 0;
      b.classList.add('on');
      if (this.h.onPress) this.h.onPress();
      if (kana) this.showPop(b, kana, 0);
    });
    b.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== id || !kana) return;
      const d = dirOf(e.clientX - start.x, e.clientY - start.y);
      if (d !== dir && FLICK[kana][d]) { dir = d; this.showPop(b, kana, d); if (this.h.onFlick) this.h.onFlick(); }
    });
    const end = e => {
      if (!start || e.pointerId !== id) return;
      start = null;
      b.classList.remove('on');
      this.pop.hidden = true;
      if (e.type === 'pointercancel') return;
      if (kana) { const ch = FLICK[kana][dir] || FLICK[kana][0]; this.h.onChar(ch); return; }
      if (b.dataset.ch) { this.h.onChar(b.dataset.ch); return; }
      const act = b.dataset.act;
      if (act === 'mode') this.setMode(this.mode === 'kana' ? 'latin' : 'kana');
      else if (act === 'back') this.h.onBack();
      else if (act === 'cycle') this.h.onCycle();
      else if (act === 'hint') this.h.onHint();
      else if (act === 'pass') this.h.onPass();
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
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
