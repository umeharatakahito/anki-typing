// ===============================================================
// typing-versus.js
// タイピング（HAMACHI-TYPE）の対戦。WebSocket でつないで、同じ問題を 2 人で同時に打つ。
//
//   GET /vs/ws?code=1234&kbn=itpass&mode=通常モード&create=1   … 部屋を作る
//   GET /vs/ws?code=1234                                       … 部屋に入る
//   GET /vs/ws?match=1&kbn=itpass&mode=通常モード               … 自動マッチを待つ
//
// Durable Object は部屋ごとに 1 つ（名前 "room:<番号>"）と、自動マッチの待合室 1 つ（"lobby"）。
//
// やりとり（JSON）
//   サーバー → 画面
//     {t:'room', code, kbn, mode, seat}        部屋に入れた
//     {t:'players', players:[{name, seat}]}    参加者が変わった
//     {t:'start', questions, in}               in ミリ秒後に始まる（端末の時計のずれに左右されないよう相対で）
//     {t:'state', players:[{seat, name, q, frac, cleared, miss, done, ms}]}
//     {t:'end', results:[…], winner}           決着
//     {t:'matched', code, kbn, mode}           自動マッチで相手が見つかった（待合室から）
//     {t:'error', message}
//   画面 → サーバー
//     {t:'prog', q, frac}      q 問目をどこまで打ったか（0〜1。かな単位なので chu / tyu の違いは出ない）
//     {t:'card', q, ok, miss}  q 問目が終わった（ok = 打ち切った、false = 時間切れ）
//     {t:'again'}              もう一度
//
// 勝ち負け：先に全問を終えた人の勝ち（時間切れで飛ばした問題も「終えた」に数えるが、打てた数には入らない）。
// 相手が抜けたら残った人の勝ち。
// ===============================================================

import { DurableObject } from 'cloudflare:workers';
import { FREE_MAX_LEVEL } from './gate.js';
import { CAT_BY_KBN } from './sets.js';
import { toCardImg } from './stats.js';

export const VS_QUESTIONS = 10;
const COUNTDOWN_MS = 3500;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const MODES = ['写経モード', '通常モード', '極みモード'];

const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch (e) { /* 切れている */ } };

export class TypingVersus extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.reset();
    this.waiting = new Map();   // 待合室: 'kbn|mode' → { ws, name }
  }

  reset() {
    this.room = null;           // { code, kbn, mode, createdAt }
    this.players = [];          // { ws, seat, name, member, q, frac, cleared, miss, done, ms, again }
    this.game = null;           // { questions, at, ended }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const viewer = JSON.parse(request.headers.get('x-viewer') || '{}');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    if (url.searchParams.get('match')) this.lobby(server, url, viewer);
    else this.join(server, url, viewer);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- 自動マッチの待合室 ----------------------------------------
  lobby(ws, url, viewer) {
    const kbn = url.searchParams.get('kbn'), mode = url.searchParams.get('mode');
    if (!CAT_BY_KBN[kbn] || !MODES.includes(mode)) { send(ws, { t: 'error', message: '問題集かモードが違います' }); ws.close(); return; }
    const key = kbn + '|' + mode;
    const other = this.waiting.get(key);
    if (other && other.ws !== ws && other.ws.readyState === 1) {
      this.waiting.delete(key);
      const code = String(Math.floor(10000 + Math.random() * 90000));   // 自動マッチの部屋は 5 桁
      [other.ws, ws].forEach(w => { send(w, { t: 'matched', code, kbn, mode }); w.close(1000, 'matched'); });
      return;
    }
    this.waiting.set(key, { ws, name: viewer.name });
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
      this.room = { code, kbn, mode, createdAt: Date.now() };
    } else if (create) {
      send(ws, { t: 'error', message: 'busy' }); ws.close(); return;
    }
    if (this.players.length >= 2 || this.game) {
      send(ws, { t: 'error', message: 'その部屋はもういっぱいです' }); ws.close(); return;
    }

    const seat = this.players.some(p => p.seat === 1) ? 2 : 1;
    const me = { ws, seat, name: viewer.name || ('ゲスト' + seat), member: !!viewer.member,
                 q: 0, frac: 0, cleared: 0, miss: 0, done: false, ms: 0, again: false };
    this.players.push(me);
    send(ws, { t: 'room', code: this.room.code, kbn: this.room.kbn, mode: this.room.mode, seat });
    this.broadcast({ t: 'players', players: this.players.map(p => ({ name: p.name, seat: p.seat })) });

    ws.addEventListener('message', ev => this.onMessage(me, ev.data));
    ws.addEventListener('close', () => this.onLeave(me));

    if (this.players.length === 2) this.start();
  }

  broadcast(msg) { this.players.forEach(p => send(p.ws, msg)); }

  stateMsg() {
    return { t: 'state', players: this.players.map(p => ({
      seat: p.seat, name: p.name, q: p.q, frac: p.frac, cleared: p.cleared, miss: p.miss, done: p.done, ms: p.ms })) };
  }

  async start() {
    const questions = await this.pickQuestions(this.players.every(p => p.member));
    if (!questions.length) { this.broadcast({ t: 'error', message: '問題が見つかりませんでした' }); return; }
    this.players.forEach(p => Object.assign(p, { q: 0, frac: 0, cleared: 0, miss: 0, done: false, ms: 0, again: false }));
    this.game = { questions, at: Date.now() + COUNTDOWN_MS, ended: false };
    this.broadcast({ t: 'start', questions, in: COUNTDOWN_MS });
    this.broadcast(this.stateMsg());
  }

  // 全員が会員なら全レベルから、そうでなければ無料の問題から。レベルの低い順に並べる
  async pickQuestions(allMembers) {
    const kbn = this.room.kbn;
    const cat = CAT_BY_KBN[kbn];
    const freeOnly = allMembers ? '' : ' AND free = 1';
    let rows;
    if (cat.levels) {
      const { results: lv } = await this.env.DB.prepare(
        `SELECT DISTINCT level FROM problems WHERE kbn = ? AND level > 0${allMembers ? '' : ' AND level <= ' + FREE_MAX_LEVEL} ORDER BY level`
      ).bind(kbn).all();
      const levels = lv.map(r => r.level);
      // 10 問をレベルに割り振る（低いレベルから順に）
      const want = {};
      for (let i = 0; i < VS_QUESTIONS; i++) {
        const L = levels[Math.floor(i * levels.length / VS_QUESTIONS)];
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
      ).bind(kbn, VS_QUESTIONS).all());
    }
    return rows.map(r => ({
      que: r.que || '', kan: r.kan || '', ans: r.ans || '', note: r.note || '', level: r.level || 0,
      img: toCardImg(r.img)
    }));
  }

  onMessage(me, data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (m.t === 'again') {
      me.again = true;
      if (this.game && this.game.ended && this.players.length === 2 && this.players.every(p => p.again)) this.start();
      else this.broadcast({ t: 'players', players: this.players.map(p => ({ name: p.name, seat: p.seat, again: p.again })) });
      return;
    }
    const g = this.game;
    if (!g || g.ended || me.done) return;
    const q = Number(m.q) | 0;
    if (q !== me.q) return;

    if (m.t === 'prog') {
      me.frac = Math.max(0, Math.min(1, Number(m.frac) || 0));
    } else if (m.t === 'card') {
      if (m.ok) me.cleared++;
      me.miss += Math.max(0, Number(m.miss) | 0);
      me.q++; me.frac = 0;
      if (me.q >= g.questions.length) { me.done = true; me.ms = Date.now() - g.at; }
    } else {
      return;
    }
    this.broadcast(this.stateMsg());
    if (me.done) this.finish();
  }

  // 先に全問を終えた人の勝ち（その時点で決着）。相手が抜けたら残った人の勝ち
  finish(leftSeat) {
    const g = this.game;
    if (!g || g.ended) return;
    g.ended = true;
    const results = this.players.map(p => ({ seat: p.seat, name: p.name, cleared: p.cleared, miss: p.miss,
      done: p.done, ms: p.done ? p.ms : null, q: p.q }));
    const first = results.filter(r => r.done).sort((a, b) => a.ms - b.ms)[0];
    const winner = leftSeat
      ? (results.find(r => r.seat !== leftSeat) || {}).seat ?? null
      : (first ? first.seat : null);
    this.broadcast({ t: 'end', results, winner, left: leftSeat || null });
  }

  onLeave(me) {
    this.players = this.players.filter(p => p !== me);
    if (this.game && !this.game.ended) this.finish(me.seat);
    if (!this.players.length) { this.reset(); return; }
    this.broadcast({ t: 'players', players: this.players.map(p => ({ name: p.name, seat: p.seat })), left: me.name });
    // 始まる前に抜けたら、次の人を待てるように戻す
    if (this.game && this.game.ended) this.game = null;
  }
}
