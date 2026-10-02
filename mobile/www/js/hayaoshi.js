// ===============================================================
// hayaoshi.js
// 対戦（先取・サバイバル）の早押しの見せ方。Web 版（gas/StudyVersus.html の hyStart）と同じ決まり。
//   ・問題文は 1 文字ずつ出す（1 秒に HY_CPS 文字。長い文も持ち時間の 6 割までに出しきる）
//   ・絵で答える問題（国旗・地図・写真など。IT の図のような補いの絵は入れない）は、絵の一部を大きく見せたところから
//     少しずつ引いて、持ち時間の残り 4 割で全体が見えるようにする。地図は答え（オレンジ色）を真ん中にして寄る
//   ・難読漢字は漢字を絵のように大きく出す（寄らない。問題文からは漢字を外す）
// 動画は作らず、CSS の transform を毎コマ書き換えるだけ（データは増えない）
// ===============================================================

const HY_PIC = /^(flag-country|map-|zk-|heritage$|castle$|constellation$)/;
const HY_KANJI = /^nandoku/;
const HY_FULL = 0.6;
const HY_CPS = 8;
// 最初に何倍に寄るか。思いきり寄って、何の絵か分からないところから始める（難読漢字は寄らず、大きな字をそのまま）
const hyZoom = (kbn, kanji) => kbn === 'map-world-country' ? 6 : /^map-/.test(kbn) ? 10 : kanji ? 1 : kbn === 'flag-country' ? 8 : 10;

// 難読漢字：問題文の「漢字」を外した文と、絵にする漢字
export function hyKanji(kbn, que, kan) {
  if (!HY_KANJI.test(kbn || '')) return null;
  const m = String(que || '').match(/「([^」]+)」/);
  return { kanji: m ? m[1] : String(kan || ''), que: m ? String(que).replace(/「[^」]+」/, 'この漢字') : String(que || '') };
}

// 問題文の文字を、見えている分と、まだの分（透明）に分ける
function textParts(el) {
  const parts = [], nodes = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const n of nodes) {
    const chars = Array.from(n.data);
    if (!chars.length) continue;
    const rest = document.createElement('span');
    rest.className = 'hy-rest';
    n.parentNode.insertBefore(rest, n.nextSibling);
    parts.push({ n, rest, chars });
  }
  const total = parts.reduce((a, p) => a + p.chars.length, 0);
  let shown = -1;
  const set = k => {
    k = Math.max(0, Math.min(total, k));
    if (k === shown) return;
    shown = k;
    let left = k;
    for (const p of parts) {
      const v = Math.min(p.chars.length, left);
      left -= v;
      p.n.data = p.chars.slice(0, v).join('');
      p.rest.textContent = p.chars.slice(v).join('');
    }
  };
  return { total, set };
}

// 地図の答え（オレンジ #ff6b35）の場所。小さく描いて色を探す
function orangeAt(img) {
  try {
    const W = 160, H = Math.max(1, Math.round(W * img.naturalHeight / img.naturalWidth)) || 120;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 225 && d[i + 1] > 80 && d[i + 1] < 140 && d[i + 2] > 20 && d[i + 2] < 90) {
        const p = i / 4;
        sx += p % W; sy += Math.floor(p / W); n++;
      }
    }
    return n ? [sx / n / W, sy / n / H] : null;
  } catch (e) { return null; }   // サーバーの絵は読めない（色を探さず真ん中に寄る）
}

// サーバーの図（…/fig/zk/x.svg）は、アプリに入っている写し（img/zk/x.svg）を先に使う。色を探せるように
const localOf = url => { const m = String(url || '').match(/\/fig\/(.+)$/); return m ? 'img/' + m[1] : ''; };

// 始める。holder は絵の入れ物（.q-img）、textEl は問題文。戻り値の stop(true) で全部見せて止める
export function hayaoshi({ holder, textEl, kbn, img, kanji, ms }) {
  kbn = String(kbn || '');
  const s = { raf: 0, t0: performance.now(), full: Math.max(1500, (ms || 30000) * HY_FULL), text: null, zoom: null, ro: null, stopped: false,
    z0: hyZoom(kbn, kanji) };   // 最初の大きさ（何倍に寄るか）
  if (textEl) s.text = textParts(textEl);
  const pic = !!kanji || (!!img && HY_PIC.test(kbn));
  let box = null, im = null;
  if (holder && pic) {
    holder.innerHTML = '';
    box = document.createElement('div');
    box.className = 'hy-box';
    holder.appendChild(box);
    if (kanji) {
      s.zoom = document.createElement('div');
      s.zoom.className = 'hy-kanji';
      s.zoom.textContent = kanji;
    } else {
      s.zoom = im = document.createElement('img');
      im.alt = '';
      const local = localOf(img);
      im.src = local || img;
      if (local) im.onerror = () => { im.onerror = null; im.src = img; };
    }
    s.zoom.style.transform = 'scale(' + s.z0 + ')';
    box.appendChild(s.zoom);
  }

  const fit = () => {
    if (!box) return;
    const cw = holder.clientWidth, ch = holder.clientHeight;
    if (!cw || !ch) return;
    if (kanji) {
      const n = Array.from(kanji).length;
      const size = Math.min(ch * 0.78, cw * 0.92 / n);
      box.style.width = Math.round(Math.min(cw, Math.max(ch * 1.2, size * n * 1.25))) + 'px';
      box.style.height = ch + 'px';
      s.zoom.style.fontSize = Math.round(size) + 'px';
      return;
    }
    const nw = im.naturalWidth || 4, nh = im.naturalHeight || 3;
    const k = Math.min(cw / nw, ch / nh);
    box.style.width = Math.round(nw * k) + 'px';
    box.style.height = Math.round(nh * k) + 'px';
  };
  const begin = () => {
    if (s.stopped || !box) return;
    fit();
    if (window.ResizeObserver) { s.ro = new ResizeObserver(fit); s.ro.observe(holder); }
    let focus = null;
    if (kbn === 'map-world-country') focus = [0.5, 0.5];   // 世界地図はいつも国が真ん中に描いてある
    else if (/^map-/.test(kbn) && im) focus = orangeAt(im);
    if (!focus) focus = /^map-/.test(kbn) ? [0.5, 0.5] : [0.15 + Math.random() * 0.7, 0.2 + Math.random() * 0.6];
    s.zoom.style.transformOrigin = (focus[0] * 100).toFixed(1) + '% ' + (focus[1] * 100).toFixed(1) + '%';
  };
  if (kanji) begin();
  else if (im) { if (im.complete && im.naturalWidth) begin(); else im.addEventListener('load', begin); }

  const textMs = () => s.text ? Math.min(s.full, s.text.total / HY_CPS * 1000) : 0;
  const stop = full => {
    s.stopped = true;
    cancelAnimationFrame(s.raf);
    if (s.ro) { s.ro.disconnect(); s.ro = null; }
    if (full && s.text) s.text.set(s.text.total);
    if (full && s.zoom) s.zoom.style.transform = '';
  };
  const tick = now => {
    if (s.stopped) return;
    const t = now - s.t0;
    if (s.text) s.text.set(Math.ceil(s.text.total * Math.min(1, t / textMs())));
    if (s.zoom && s.z0 > 1) {
      const p = Math.min(1, t / s.full), e = p * p * (3 - 2 * p);
      s.zoom.style.transform = p >= 1 ? '' : 'scale(' + Math.pow(s.z0, 1 - e).toFixed(4) + ')';
    }
    if (t >= textMs() && (!s.zoom || s.z0 <= 1 || t >= s.full)) {
      // 動きは終わり。絵の大きさ合わせ（ResizeObserver）だけ残す
      s.stopped = true;
      return;
    }
    s.raf = requestAnimationFrame(tick);
  };
  s.raf = requestAnimationFrame(tick);
  return { stop };
}
