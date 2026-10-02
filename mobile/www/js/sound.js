// ===============================================================
// sound.js
// 効果音。音のファイルは使わず、その場で作る（Web Audio。データは増えない）。Web 版の gas/Sound.html と同じ音。
//   key()   … 打ったとき：小さく「コトッ」（高い打鍵の音＋低い胴の音。毎回すこしだけ高さを変えて、単調にしない）
//   miss()  … まちがえたとき：やわらかく下がる「ポコッ」。分かるけれど耳ざわりにしない
//   jajan() … 対戦の出題：「ジャ・ジャーン」（金管っぽい和音を 2 回）
// 音を鳴らせるのは、画面にさわった・キーを押したあとから（ブラウザの決まり）。
// ===============================================================

let ctx = null, out = null, noise = null;
let on = true;
export const setSound = v => { on = !!v; };

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.1);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// 最初にさわったときに音を出せるようにしておく
['pointerdown', 'touchstart', 'keydown'].forEach(t => window.addEventListener(t, () => { if (on) ac(); }, { capture: true, once: true }));

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export function key() {
  if (!on || !ac()) return;
  const t = ctx.currentTime, v = 0.94 + Math.random() * 0.12;
  // 打鍵の「カチ」：ノイズを細い帯域だけ通す
  const n = ctx.createBufferSource(); n.buffer = noise;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200 * v; bp.Q.value = 1.4;
  const ng = ctx.createGain(); env(ng, t, 0.22, 0.002, 0.03);
  n.connect(bp).connect(ng).connect(out); n.start(t); n.stop(t + 0.05);
  // 胴の「トッ」：低い音がすぐ下がって消える
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(320 * v, t); o.frequency.exponentialRampToValueAtTime(140 * v, t + 0.05);
  const og = ctx.createGain(); env(og, t, 0.28, 0.003, 0.06);
  o.connect(og).connect(out); o.start(t); o.stop(t + 0.08);
}

export function miss() {
  if (!on || !ac()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.16);
  const g = ctx.createGain(); env(g, t, 0.5, 0.006, 0.2);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.24);
  // すこしだけ濁りを足して「ちがう」と分かるように（高いところは削ってやわらかく）
  const b = ctx.createOscillator(); b.type = 'square'; b.frequency.setValueAtTime(130, t); b.frequency.exponentialRampToValueAtTime(95, t + 0.16);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
  const bg = ctx.createGain(); env(bg, t, 0.09, 0.006, 0.16);
  b.connect(lp).connect(bg).connect(out); b.start(t); b.stop(t + 0.22);
}

// 金管っぽい和音を 1 回（ずらしたのこぎり波を、開いて閉じるフィルターに通す）
function stab(t, notes, len, peak) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(3600, t + 0.03); lp.frequency.exponentialRampToValueAtTime(1100, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.setValueAtTime(peak, t + len * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  lp.connect(g).connect(out);
  for (const f of notes) for (const dt of [-6, 6]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
    o.connect(lp); o.start(t); o.stop(t + len + 0.02);
  }
  // 太鼓の「ドン」
  const k = ctx.createOscillator(); k.type = 'sine';
  k.frequency.setValueAtTime(110, t); k.frequency.exponentialRampToValueAtTime(55, t + 0.2);
  const kg = ctx.createGain(); env(kg, t, peak * 2.2, 0.004, Math.min(0.3, len));
  k.connect(kg).connect(out); k.start(t); k.stop(t + 0.35);
}

export function jajan() {
  if (!on || !ac()) return;
  const t = ctx.currentTime + 0.02;
  const chord = [261.63, 329.63, 392.0, 523.25];   // ド・ミ・ソ・ド
  stab(t, chord, 0.12, 0.07);
  stab(t + 0.17, chord.concat([chord[0] / 2]), 0.6, 0.08);   // 2 回目は低いドも足して長く「ジャーン」
}
