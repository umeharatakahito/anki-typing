// ===============================================================
// keyboard.js
// アプリの中に出す自作キーボード（スマホ本体のキーボードは使わない）。
//
//   かな … 12 キーのフリック。押して、上下左右に滑らせた向きで あ段〜お段（押しただけなら あ段）。
//          押している間は、キーの上に 5 方向の字を出す。゛゜小 は最後の文字を回す。
//   英字 … QWERTY と数字。
//   どちらにも ヒント（次の 1 文字）と パス、⌫ がある。
//
// new Keyboard(el, { onChar(ch), onCycle(), onBack(), onHint(), onPass(), onMode(mode), noHint, passLabel })
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
