// ===============================================================
// typing-versus.js
// タイピング（HAMACHI-TYPE）の対戦。WebSocket でつないで、同じ問題を 2 人で同時に打つ。
//
//   GET /vs/ws?code=1234&kbn=itpass&mode=通常モード&target=5&create=1   … 部屋を作る
//   GET /vs/ws?code=1234                                                … 部屋に入る
//   GET /vs/ws?match=1&kbn=itpass&mode=通常モード&target=5               … 自動マッチを待つ
//
// Durable Object は部屋ごとに 1 つ（名前 "room:<番号>"）と、自動マッチの待合室 1 つ（"lobby"）。
//
// 決まり
//   ・1 問ずつ勝負。先に打ち終えた人が 1 本取る
//   ・1 問で 10 回（極みモードは 5 回）ミスすると、その問題はもう打てない（相手を待つ。数えるのは画面側）
//   ・2 人とも打てなくなるか時間切れになったら、その問題はだれも取らない
//   ・1 本決まるたびに結果を RESULT_MS 見せてから次の問題へ
//   ・target 本を先に取った人の勝ち。相手が抜けたら残った人の勝ち
//
// やりとり（JSON）
//   サーバー → 画面
//     {t:'room', code, kbn, mode, target, seat}   部屋に入れた
//     {t:'players', players:[{name, seat}]}       参加者が変わった
//     {t:'start', questions, target, in}          in ミリ秒後に 0 問目が始まる（時計のずれに左右されないよう相対）
//     {t:'more', questions}                        問題の追加（決着がつかず問題が足りなくなりそうなとき）
//     {t:'opp', seat, r, done, total, typed, miss, out}   相手の入力の様子（本人には送らない）
//     {t:'point', r, seat, scores, in, final}      r 問目の結果（seat が null ならだれも取らず）。in ミリ秒後に次へ
//     {t:'round', r}                               r 問目を始める
//     {t:'end', winner, scores, left}              決着
//     {t:'matched', code, kbn, mode, target}      自動マッチで相手が見つかった（待合室から）
//     {t:'error', message}
//   画面 → サーバー
//     {t:'prog', r, done, total, typed, miss}      r 問目をどこまで打ったか（かな単位なので chu / tyu の違いは出ない）
//     {t:'win', r}                                 r 問目を打ち終えた
//     {t:'out', r, miss}                           r 問目はもう打てない（10 ミスか時間切れ）
//     {t:'again'}                                  もう一度
// ===============================================================

import { DurableObject } from 'cloudflare:workers';
import { FREE_MAX_LEVEL } from './gate.js';
import { CAT_BY_KBN } from './sets.js';
import { toCardImg } from './stats.js';

export const TARGETS = [3, 5, 7, 10];
const DEFAULT_TARGET = 5;
const COUNTDOWN_MS = 3500;
const RESULT_MS = 3000;          // 1 本ごとの結果を見せる時間
const ROUND_MAX_MS = 90 * 1000;  // 画面から何も来なくても、この時間で次の問題へ
const ROOM_IDLE_MS = 30 * 60 * 1000;
const MODES = ['写経モード', '通常モード', '極みモード'];

const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch (e) { /* 切れている */ } };
const targetOf = v => TARGETS.includes(Number(v)) ? Number(v) : DEFAULT_TARGET;

export class TypingVersus extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.reset();
    this.waiting = new Map();   // 待合室: 'kbn|mode|target' → { ws }
  }

  reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.room = null;           // { code, kbn, mode, target, createdAt }
    this.players = [];          // { ws, seat, name, member, again, out }
    this.game = null;           // { questions, r, scores, roundOver, ended, allMembers }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const viewer = JSON.parse(request.headers.get('x-viewer') || '{}');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (url.searchParams.get('match')) this.lobby(server, url);
    else this.join(server, url, viewer);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- 自動マッチの待合室 ----------------------------------------
  lobby(ws, url) {
    const kbn = url.searchParams.get('kbn'), mode = url.searchParams.get('mode');
    const target = targetOf(url.searchParams.get('target'));
    if (!CAT_BY_KBN[kbn] || !MODES.includes(mode)) { send(ws, { t: 'error', message: '問題集かモードが違います' }); ws.close(); return; }
    const key = [kbn, mode, target].join('|');
    const other = this.waiting.get(key);
    if (other && other.ws !== ws && other.ws.readyState === 1) {
      this.waiting.delete(key);
      const code = String(Math.floor(10000 + Math.random() * 90000));   // 自動マッチの部屋は 5 桁
      [other.ws, ws].forEach(w => { send(w, { t: 'matched', code, kbn, mode, target }); w.close(1000, 'matched'); });
      return;
    }
    this.waiting.set(key, { ws });
    ws.addEventListener('close', () => { if (this.waiting.get(key)?.ws === ws) this.waiting.delete(key); });
  }

  // ---- 部屋 ------------------------------------------------------
  join(ws, url, viewer) {
    const code = url.searchParams.get('code');
    const create = url.searchParams.get('create') === '1';
    const kbn = url.searchParams.get('kbn'), mode = url.searchParams.get('mode');

    // 長く放っておかれた部屋や、誰もいない部屋は作り直せる
    if (this.room && (!this.players.length || Date.now() - this.room.createdAt > ROOM_IDLE_MS)) this.reset();

    if (!this.room) {
      if (!kbn) { send(ws, { t: 'error', message: 'その番号の部屋はありません' }); ws.close(); return; }
      if (!CAT_BY_KBN[kbn] || !MODES.includes(mode)) { send(ws, { t: 'error', message: '問題集かモードが違います' }); ws.close(); return; }
      this.room = { code, kbn, mode, target: targetOf(url.searchParams.get('target')), createdAt: Date.now() };
    } else if (create) {
      send(ws, { t: 'error', message: 'busy' }); ws.close(); return;
    }
    if (this.players.length >= 2 || (this.game && !this.game.ended)) {
      send(ws, { t: 'error', message: 'その部屋はもういっぱいです' }); ws.close(); return;
    }

    const seat = this.players.some(p => p.seat === 1) ? 2 : 1;
    const me = { ws, seat, name: viewer.name || ('ゲスト' + seat), member: !!viewer.member, again: false, out: false };
    this.players.push(me);
    const r = this.room;
    send(ws, { t: 'room', code: r.code, kbn: r.kbn, mode: r.mode, target: r.target, seat });
    this.sendPlayers();

    ws.addEventListener('message', ev => this.onMessage(me, ev.data));
    ws.addEventListener('close', () => this.onLeave(me));

    if (this.players.length === 2) this.start();
  }

  broadcast(msg) { this.players.forEach(p => send(p.ws, msg)); }
  sendPlayers(extra) {
    this.broadcast(Object.assign({ t: 'players',
      players: this.players.map(p => ({ name: p.name, seat: p.seat, again: p.again })) }, extra || {}));
  }
  scores() { return Object.fromEntries(this.players.map(p => [p.seat, this.game.scores[p.seat] || 0])); }

  async start() {
    const allMembers = this.players.every(p => p.member);
    // 最悪でも 2×target−1 問で決着するが、だれも取らない問題もあるので多めに用意する
    const questions = await this.pickQuestions(allMembers, this.room.target * 3);
    if (!questions.length) { this.broadcast({ t: 'error', message: '問題が見つかりませんでした' }); return; }
    this.players.forEach(p => { p.again = false; p.out = false; });
    this.game = { questions, r: 0, scores: { 1: 0, 2: 0 }, roundOver: false, ended: false, allMembers };
    this.broadcast({ t: 'start', questions, target: this.room.target, in: COUNTDOWN_MS });
    this.armRoundTimer(COUNTDOWN_MS);
  }

  // 全員が会員なら全レベルから、そうでなければ無料の問題から。レベルの低い順に並べる
  async pickQuestions(allMembers, count) {
    const kbn = this.room.kbn;
    const cat = CAT_BY_KBN[kbn];
    const freeOnly = allMembers ? '' : ' AND free = 1';
    let rows;
    if (cat.levels) {
      const { results: lv } = await this.env.DB.prepare(
        `SELECT DISTINCT level FROM problems WHERE kbn = ? AND level > 0${allMembers ? '' : ' AND level <= ' + FREE_MAX_LEVEL} ORDER BY level`
      ).bind(kbn).all();
      const levels = lv.map(r => r.level);
      const want = {};
      for (let i = 0; i < count; i++) {
        const L = levels[Math.floor(i * levels.length / count)];
        want[L] = (want[L] || 0) + 1;
      }
      rows = [];
      for (const L of Object.keys(want).map(Number).sort((a, b) => a - b)) {
        const { results } = await this.env.DB.prepare(
          `SELECT que, kan, ans, img, note, level FROM problems WHERE kbn = ? AND level = ?${freeOnly} ORDER BY random() LIMIT ?`
        ).bind(kbn, L, want[L]).all();
        rows.push(...results);
      }
    } else {
      ({ results: rows } = await this.env.DB.prepare(
        `SELECT que, kan, ans, img, note, level FROM problems WHERE kbn = ?${freeOnly} ORDER BY random() LIMIT ?`
      ).bind(kbn, count).all());
    }
    return rows.map(r => ({
      que: r.que || '', kan: r.kan || '', ans: r.ans || '', note: r.note || '', level: r.level || 0,
      img: toCardImg(r.img)
    }));
  }

  // 画面から何も届かないまま止まらないように
  armRoundTimer(extra) {
    if (this.timer) clearTimeout(this.timer);
    const g = this.game, r = g.r;
    this.timer = setTimeout(() => {
      if (this.game === g && g.r === r && !g.roundOver && !g.ended) this.closeRound(null);
    }, (extra || 0) + ROUND_MAX_MS);
  }

  onMessage(me, data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }

    if (m.t === 'again') {
      me.again = true;
      if (this.game && this.game.ended && this.players.length === 2 && this.players.every(p => p.again)) this.start();
      else this.sendPlayers();
      return;
    }

    const g = this.game;
    if (!g || g.ended || g.roundOver || Number(m.r) !== g.r) return;

    if (m.t === 'prog') {
      // 相手の画面にだけ出す
      const msg = { t: 'opp', seat: me.seat, r: g.r, done: Number(m.done) | 0, total: Number(m.total) | 0,
        typed: String(m.typed || '').slice(0, 200), miss: Number(m.miss) | 0, out: me.out };
      this.players.forEach(p => { if (p !== me) send(p.ws, msg); });
    } else if (m.t === 'win') {
      if (me.out) return;
      this.closeRound(me.seat);
    } else if (m.t === 'out') {
      me.out = true;
      this.players.forEach(p => { if (p !== me) send(p.ws, { t: 'opp', seat: me.seat, r: g.r, out: true, miss: Number(m.miss) | 0 }); });
      if (this.players.every(p => p.out)) this.closeRound(null);
    }
  }

  // r 問目の決着。seat が 1 本取る（null ならだれも取らない）
  closeRound(seat) {
    const g = this.game;
    g.roundOver = true;
    if (seat) g.scores[seat] = (g.scores[seat] || 0) + 1;
    const done = !!seat && g.scores[seat] >= this.room.target;
    this.broadcast({ t: 'point', r: g.r, seat, scores: this.scores(), in: RESULT_MS, final: done });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      if (this.game !== g || g.ended) return;
      if (done) { g.ended = true; this.broadcast({ t: 'end', winner: seat, scores: this.scores(), left: null }); return; }
      g.r++;
      g.roundOver = false;
      this.players.forEach(p => { p.out = false; });
      // 問題が残り少なくなったら足す
      if (g.r >= g.questions.length - 2) {
        const more = await this.pickQuestions(g.allMembers, this.room.target * 2);
        g.questions.push(...more);
        this.broadcast({ t: 'more', questions: more });
      }
      this.broadcast({ t: 'round', r: g.r });
      this.armRoundTimer(0);
    }, RESULT_MS);
  }

  onLeave(me) {
    this.players = this.players.filter(p => p !== me);
    const g = this.game;
    if (g && !g.ended) {
      g.ended = true;
      if (this.timer) clearTimeout(this.timer);
      const rest = this.players[0];
      this.broadcast({ t: 'end', winner: rest ? rest.seat : null, scores: this.scores(), left: me.seat });
    }
    if (!this.players.length) { this.reset(); return; }
    this.sendPlayers({ left: me.name });
  }
}
