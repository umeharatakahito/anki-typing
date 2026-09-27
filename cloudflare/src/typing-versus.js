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
//   ・2〜4 人。部屋番号の部屋は、作った人（host）が「開始」を押すか 4 人そろったら始まる。
//     自動マッチの部屋は、2 人そろってから最大 AUTO_WAIT_MS 待ち、4 人になるか時間が来たら始まる
//     （待っている間はだれでも「この人数で始める」を押せる）
//   ・1 問ずつ勝負。いちばん先に打ち終えた人が 1 本取る
//   ・1 問で 10 回（極みモードは 5 回）ミスすると、その問題はもう打てない（相手を待つ。数えるのは画面側）
//   ・全員が打てなくなるか時間切れになったら、その問題はだれも取らない
//   ・1 本決まるたびに結果を RESULT_MS 見せてから次の問題へ
//   ・target 本を先に取った人の勝ち。抜けて 1 人だけ残ったら、その人の勝ち
//
// ルール（rule）。target の意味がルールで変わる
//   first    … 先取（上のとおり）。target は本数
//   survival … サバイバル。target はライフ。1 問ごとに、取った人以外はライフ −1（だれも取らなければ全員 −1。
//               ただし全員いっぺんに 0 になるときは減らさない）。0 になった人は脱落して見るだけ。最後の 1 人が勝ち
//   time     … タイムアタック。target は持ち時間（秒）。同じ問題を同じ順で、各自が 1 人用のタイム制で打つ。
//               点数は途中経過を送り合い、全員が終わるか時間が来たら、点数の多い人の勝ち
//
// やりとり（JSON）
//   サーバー → 画面
//     {t:'room', code, kbn, mode, target, rule, seat}   部屋に入れた
//     {t:'players', players:[{name, seat, again}], host, auto, max, startAt}   参加者が変わった
//     {t:'start', questions, target, in}          in ミリ秒後に 0 問目が始まる（時計のずれに左右されないよう相対）
//     {t:'more', questions}                        問題の追加（決着がつかず問題が足りなくなりそうなとき）
//     {t:'opp', seat, r, done, total, typed, miss, out}   相手の入力の様子（本人には送らない）
//     {t:'point', r, seat, scores, lives, in, final}  r 問目の結果（seat が null ならだれも取らず）。in ミリ秒後に次へ
//     {t:'round', r}                               r 問目を始める
//     {t:'end', winner, scores, lives, left}       決着
//     {t:'tas', seat, score, correct, fin}         タイムアタック：ほかの人の点数
//     {t:'matched', code, kbn, mode, target}      自動マッチで相手が見つかった（待合室から）
//     {t:'error', message}
//   画面 → サーバー
//     {t:'prog', r, done, total, typed, miss}      r 問目をどこまで打ったか（かな単位なので chu / tyu の違いは出ない）
//     {t:'win', r}                                 r 問目を打ち終えた
//     {t:'out', r, miss}                           r 問目はもう打てない（10 ミスか時間切れ）
//     {t:'begin'}                                  この人数で始める（部屋番号の部屋は host だけ）
//     {t:'again'}                                  もう一度
//     {t:'ta', score, correct, fin}                タイムアタック：今の点数（fin は打ち終えた）
// ===============================================================

import { DurableObject } from 'cloudflare:workers';
import { FREE_MAX_LEVEL } from './gate.js';
import { CAT_BY_KBN, kbnWhere, withSetLabel, pickRandom, levelsOf } from './sets.js';
const COLS = 'id, kbn, que, kan, ans, img, note, level, qid';
import { toCardImg } from './stats.js';

// ルールごとの target（本数・ライフ・秒）
export const RULES = {
  first:    { targets: [3, 5, 7, 10], def: 5 },
  survival: { targets: [1, 3, 5], def: 3 },
  time:     { targets: [60, 90, 120], def: 90 },
};
const ruleOf = v => RULES[v] ? v : 'first';
const RULE_NAMES = { first: '先取', survival: 'サバイバル', time: 'タイムアタック' };
const COUNTDOWN_MS = 3500;
const RESULT_MS = 3000;          // 1 本ごとの結果を見せる時間
const MAX_PLAYERS = 4;
const AUTO_WAIT_MS = 60 * 1000;  // 自動マッチで 2 人そろってから、ほかの人を待つ時間
const ROUND_MAX_MS = 90 * 1000;  // 画面から何も来なくても、この時間で次の問題へ
const TA_GRACE_MS = 45 * 1000;   // タイムアタック：持ち時間のあと、終わりの知らせを待つ時間（解説を読む間などで時計が止まる分）
const ROOM_IDLE_MS = 30 * 60 * 1000;
const MODES = ['写経モード', '通常モード', '極みモード'];

const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch (e) { /* 切れている */ } };
const targetOf = (v, rule) => RULES[rule].targets.includes(Number(v)) ? Number(v) : RULES[rule].def;

export class TypingVersus extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.reset();
    this.waiting = new Map();   // 待合室: 'kbn|mode|rule|target' → { ws }（1 人目）
    this.pending = new Map();   // 待合室: 'kbn|mode|rule|target' → { code, count, until }（人を足せる部屋）
  }

  reset() {
    if (this.timer) clearTimeout(this.timer);
    if (this.startTimer) clearTimeout(this.startTimer);
    this.timer = null;
    this.startTimer = null;
    this.startAt = 0;
    this.room = null;           // { code, kbn, mode, rule, target, auto, hostSeat, createdAt }
    this.players = [];          // { ws, seat, name, member, again, out, dead, ta }
    this.game = null;           // { questions, r, scores, lives, roundOver, ended, allMembers }
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
    const rule = ruleOf(url.searchParams.get('rule'));
    const target = targetOf(url.searchParams.get('target'), rule);
    if (!CAT_BY_KBN[kbn] || !MODES.includes(mode)) { send(ws, { t: 'error', message: '問題集かモードが違います' }); ws.close(); return; }
    const key = [kbn, mode, rule, target].join('|');
    const matched = (w, code) => { send(w, { t: 'matched', code, kbn, mode, rule, target }); w.close(1000, 'matched'); };

    // 人を待っている部屋があれば、そこに入る
    const open = this.pending.get(key);
    if (open && open.count < MAX_PLAYERS && Date.now() < open.until) {
      open.count++;
      if (open.count >= MAX_PLAYERS) this.pending.delete(key);
      matched(ws, open.code);
      return;
    }
    const other = this.waiting.get(key);
    if (other && other.ws !== ws && other.ws.readyState === 1) {
      this.waiting.delete(key);
      const code = String(Math.floor(10000 + Math.random() * 90000));   // 自動マッチの部屋は 5 桁
      this.pending.set(key, { code, count: 2, until: Date.now() + AUTO_WAIT_MS });
      [other.ws, ws].forEach(w => matched(w, code));
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
      const rule = ruleOf(url.searchParams.get('rule'));
      this.room = { code, kbn, mode, rule, target: targetOf(url.searchParams.get('target'), rule),
                    auto: url.searchParams.get('auto') === '1', hostSeat: 0, createdAt: Date.now() };
    } else if (create) {
      send(ws, { t: 'error', message: 'busy' }); ws.close(); return;
    }
    if (this.game) { send(ws, { t: 'error', message: 'その部屋はもう始まっています' }); ws.close(); return; }
    if (this.players.length >= MAX_PLAYERS) {
      send(ws, { t: 'error', message: 'その部屋はもういっぱいです（4人まで）' }); ws.close(); return;
    }

    let seat = 1;
    while (this.players.some(p => p.seat === seat)) seat++;
    if (!this.room.hostSeat) this.room.hostSeat = seat;
    const me = { ws, seat, name: viewer.name || ('ゲスト' + seat), member: !!viewer.member, email: viewer.email || '',
                 again: false, out: false, dead: false, ta: null };
    this.players.push(me);
    const r = this.room;
    send(ws, { t: 'room', code: r.code, kbn: r.kbn, mode: r.mode, rule: r.rule, target: r.target, seat });
    this.sendPlayers();

    ws.addEventListener('message', ev => this.onMessage(me, ev.data));
    ws.addEventListener('close', () => this.onLeave(me));

    if (this.players.length >= MAX_PLAYERS) this.start();
    else if (this.room.auto && this.players.length >= 2 && !this.startTimer) {
      this.startAt = Date.now() + AUTO_WAIT_MS;
      this.startTimer = setTimeout(() => { this.startTimer = null; if (!this.game && this.players.length >= 2) this.start(); }, AUTO_WAIT_MS);
      this.sendPlayers();
    }
  }

  broadcast(msg) { this.players.forEach(p => send(p.ws, msg)); }
  sendPlayers(extra) {
    const r = this.room || {};
    this.broadcast(Object.assign({ t: 'players',
      players: this.players.map(p => ({ name: p.name, seat: p.seat, again: p.again })),
      host: r.hostSeat, auto: !!r.auto, max: MAX_PLAYERS, startIn: this.startAt ? Math.max(0, this.startAt - Date.now()) : 0
    }, extra || {}));
  }
  scores() { return Object.fromEntries(this.players.map(p => [p.seat, this.game.scores[p.seat] || 0])); }
  lives() { return this.room.rule === 'survival' ? Object.fromEntries(this.players.map(p => [p.seat, this.game.lives[p.seat] || 0])) : null; }

  async start() {
    if (this.game && !this.game.ended) return;
    if (this.startTimer) { clearTimeout(this.startTimer); this.startTimer = null; }
    this.startAt = 0;
    const allMembers = this.players.every(p => p.member);
    const { rule, target } = this.room;
    // 先取は最悪でも 2×target−1 問で決着するが、だれも取らない問題もあるので多めに。
    // サバイバルは人数×ライフくらい、タイムアタックは 1 秒に 1 問打てても足りる数
    const count = rule === 'time' ? Math.min(150, target) : rule === 'survival' ? Math.max(10, target * this.players.length * 2) : target * 3;
    const questions = await this.pickQuestions(allMembers, count);
    if (!questions.length) { this.broadcast({ t: 'error', message: '問題が見つかりませんでした' }); return; }
    this.players.forEach(p => { p.again = false; p.out = false; p.dead = false; p.ta = null; });
    this.game = { questions, r: 0, scores: {}, lives: Object.fromEntries(this.players.map(p => [p.seat, target])),
                  roundOver: false, ended: false, allMembers, startPlayers: this.players.length };
    this.broadcast({ t: 'start', questions, rule, target, lives: this.lives(), in: COUNTDOWN_MS });
    if (rule === 'time') {
      // タイムアタックは 1 問ずつの区切りがない。持ち時間＋少しで締め切る
      const g = this.game;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => { if (this.game === g && !g.ended) this.endTimeAttack(); }, COUNTDOWN_MS + target * 1000 + TA_GRACE_MS);
      return;
    }
    this.armRoundTimer(COUNTDOWN_MS);
  }

  // 全員が会員なら全レベルから、そうでなければ無料の問題から。レベルの低い順に並べる
  async pickQuestions(allMembers, count) {
    const kbn = this.room.kbn;
    const cat = CAT_BY_KBN[kbn];
    const freeOnly = allMembers ? '' : ' AND free = 1';
    const w = kbnWhere(kbn);
    let rows;
    if (cat.levels) {
      const levels = await levelsOf(this.env.DB, kbn, allMembers ? 0 : FREE_MAX_LEVEL);
      const want = {};
      for (let i = 0; i < count; i++) {
        const L = levels[Math.floor(i * levels.length / count)];
        want[L] = (want[L] || 0) + 1;
      }
      rows = [];
      for (const L of Object.keys(want).map(Number).sort((a, b) => a - b)) {
        rows.push(...await pickRandom(this.env.DB, kbn, COLS, `level = ? AND ${w.sql}${freeOnly}`, [L, ...w.args], want[L]));
      }
    } else {
      rows = await pickRandom(this.env.DB, kbn, COLS, `level = 0 AND ${w.sql}${freeOnly}`, w.args, count);
    }
    return rows.map(r => ({
      que: withSetLabel(kbn, r.kbn, r.que || ''), kan: r.kan || '', pid: r.id || 0, kbn: r.kbn || '', ans: r.ans || '', note: r.note || '', level: r.level || 0, qid: r.qid || '',
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

    if (m.t === 'begin') {
      if (!this.game && this.players.length >= 2 && (this.room.auto || me.seat === this.room.hostSeat)) this.start();
      return;
    }
    if (m.t === 'again') {
      me.again = true;
      if (this.game && this.game.ended && this.players.length >= 2 && this.players.every(p => p.again)) this.start();
      else this.sendPlayers();
      return;
    }

    const g = this.game;
    if (m.t === 'ta') {
      if (!g || g.ended || this.room.rule !== 'time') return;
      me.ta = { score: Number(m.score) || 0, correct: Number(m.correct) | 0, fin: !!m.fin };
      g.scores[me.seat] = me.ta.score;
      this.players.forEach(p => { if (p !== me) send(p.ws, { t: 'tas', seat: me.seat, score: me.ta.score, correct: me.ta.correct, fin: me.ta.fin }); });
      if (this.players.every(p => p.ta && p.ta.fin)) this.endTimeAttack();
      return;
    }
    if (!g || g.ended || g.roundOver || Number(m.r) !== g.r) return;

    if (m.t === 'prog') {
      // 相手の画面にだけ出す
      const msg = { t: 'opp', seat: me.seat, r: g.r, done: Number(m.done) | 0, total: Number(m.total) | 0,
        typed: String(m.typed || '').slice(0, 200), miss: Number(m.miss) | 0, out: me.out };
      this.players.forEach(p => { if (p !== me) send(p.ws, msg); });
    } else if (m.t === 'win') {
      if (me.out || me.dead) return;
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
    let done, winner = seat;
    if (this.room.rule === 'survival') {
      // 取った人以外の、まだ残っている人がライフ −1。全員いっぺんに 0 になるときは減らさない
      const alive = this.players.filter(p => !p.dead);
      const hit = alive.filter(p => p.seat !== seat);
      if (!(hit.length === alive.length && hit.every(p => g.lives[p.seat] <= 1))) {
        hit.forEach(p => { g.lives[p.seat] = Math.max(0, g.lives[p.seat] - 1); if (!g.lives[p.seat]) p.dead = true; });
      }
      const left = this.players.filter(p => !p.dead);
      done = left.length <= 1;
      winner = left.length === 1 ? left[0].seat : null;
    } else {
      done = !!seat && g.scores[seat] >= this.room.target;
    }
    this.broadcast({ t: 'point', r: g.r, seat, scores: this.scores(), lives: this.lives(), in: RESULT_MS, final: done });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      if (this.game !== g || g.ended) return;
      if (done) { g.ended = true; this.broadcast({ t: 'end', winner, scores: this.scores(), lives: this.lives(), left: null }); this.record(winner); return; }
      g.r++;
      g.roundOver = false;
      // 脱落した人は、はじめから「もう打てない」
      this.players.forEach(p => { p.out = p.dead; });
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

  // タイムアタックの決着：点数の多い人の勝ち（同点で並んだら引き分け）
  endTimeAttack() {
    const g = this.game;
    if (!g || g.ended) return;
    g.ended = true;
    if (this.timer) clearTimeout(this.timer);
    const sc = this.scores();
    const best = Math.max(...Object.values(sc));
    const top = Object.keys(sc).filter(s => sc[s] === best).map(Number);
    const winner = top.length === 1 ? top[0] : null;
    this.broadcast({ t: 'end', winner, scores: sc, lives: null, left: null });
    this.record(winner);
  }

  // ログインしている人の結果を戦績（vs_results）に残す。人数は試合を始めたときの人数
  async record(winner) {
    const g = this.game, sc = g.scores, r = this.room;
    const n = g.startPlayers || this.players.length;
    const stmts = this.players.filter(p => p.email).map(p => {
      // サバイバルは残ったライフ、ほかは本数・点数で順位を決める
      const key = o => r.rule === 'survival' ? (g.lives[o.seat] || 0) * 1000 + (sc[o.seat] || 0) : (sc[o.seat] || 0);
      const mine = sc[p.seat] || 0;
      const place = 1 + this.players.filter(o => key(o) > key(p)).length;
      const opps = this.players.filter(o => o !== p).map(o => o.name).join('、');
      return this.env.DB.prepare(
        `INSERT INTO vs_results (email, played_at, kbn, mode, target, players, place, won, points, opponents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(p.email, Date.now(), r.kbn, r.rule === 'first' ? r.mode : r.mode + '・' + RULE_NAMES[r.rule], r.target, n, place, p.seat === winner ? 1 : 0, mine, opps);
    });
    if (stmts.length) { try { await this.env.DB.batch(stmts); } catch (e) { /* 記録に失敗しても試合は続ける */ } }
  }

  onLeave(me) {
    this.players = this.players.filter(p => p !== me);
    if (!this.players.length) { this.reset(); return; }
    if (this.room && this.room.hostSeat === me.seat) this.room.hostSeat = this.players[0].seat;
    const g = this.game;
    if (g && !g.ended) {
      if (this.players.length < 2) {
        // 1 人だけ残ったら、その人の勝ち
        g.ended = true;
        if (this.timer) clearTimeout(this.timer);
        this.broadcast({ t: 'end', winner: this.players[0].seat, scores: this.scores(), lives: this.lives(), left: me.seat });
        this.record(this.players[0].seat);
      } else if (this.room.rule === 'time') {
        if (this.players.every(p => p.ta && p.ta.fin)) this.endTimeAttack();
      } else if (this.room.rule === 'survival' && this.players.filter(p => !p.dead).length <= 1) {
        // 残っていた人が抜けて、生き残りが 1 人になった
        g.ended = true;
        if (this.timer) clearTimeout(this.timer);
        const left = this.players.filter(p => !p.dead);
        const w = left.length ? left[0].seat : null;
        this.broadcast({ t: 'end', winner: w, scores: this.scores(), lives: this.lives(), left: me.seat });
        this.record(w);
      } else if (!g.roundOver && this.players.every(p => p.out)) {
        this.closeRound(null);
      }
    }
    this.sendPlayers({ left: me.name });
  }
}
