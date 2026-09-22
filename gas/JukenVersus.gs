// ===============================================================
// JukenVersus.gs
// 2人対戦モード（早解き）のサーバー側
//
// GAS の Web アプリには WebSocket がないので、共有状態を
// CacheService に置いてクライアントからポーリングさせる。
//
// キャッシュのキー構成（すべて 6 時間 TTL）
//   vs:m:<code>      … 部屋の正本。得点・勝敗など全員に効く値。
//                       書き込みは必ず LockService の中だけで行う。
//   vs:q:<code>      … 出題データ。部屋作成時に一度だけ書く。
//   vs:p:<code>:A/B  … 各プレイヤーの進捗（何問目・ミス数・生存確認）。
//                       持ち主だけが書くので競合しない＝ロック不要。
//
// 正本（vs:m）とポーリングで毎秒書き換わる進捗（vs:p）を別キーに
// 分けているのは、進捗の read-modify-write が得点確定を巻き戻すのを
// 防ぐため。
// ===============================================================

const VS_TTL_SEC    = 21600;  // CacheService の上限（6時間）
const VS_STALE_MS   = 15000;  // これ以上 sync が来ない相手はオフライン扱い
const VS_LOCK_MS    = 8000;
const VS_START_LAG  = 2500;   // 参加成立〜開始の間。両者の画面を揃える
const VS_REVEAL_MS  = 2200;   // 決着表示から次の問題までの間
const VS_MAX_TOTAL  = 60;

// ---------------------------------------------------------------
// 低レベル
function vsCache_()        { return CacheService.getScriptCache(); }
function vsMetaKey_(code)  { return 'vs:m:' + code; }
function vsQKey_(code)     { return 'vs:q:' + code; }
function vsPlayerKey_(code, seat) { return 'vs:p:' + code + ':' + seat; }

function vsReadMeta_(code) {
  const raw = vsCache_().get(vsMetaKey_(code));
  return raw ? JSON.parse(raw) : null;
}

function vsWriteMeta_(m) {
  m.updatedAt = Date.now();
  vsCache_().put(vsMetaKey_(m.code), JSON.stringify(m), VS_TTL_SEC);
  return m;
}

function vsReadPlayer_(code, seat) {
  const raw = vsCache_().get(vsPlayerKey_(code, seat));
  return raw ? JSON.parse(raw) : null;
}

function vsWritePlayer_(code, seat, p) {
  vsCache_().put(vsPlayerKey_(code, seat), JSON.stringify(p), VS_TTL_SEC);
}

function vsToken_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function vsErr_(msg) { return { ok: false, error: msg }; }

// 座席の特定。トークンが合わない呼び出しは相手になりすませない。
function vsSeatOf_(m, token) {
  if (!token) return null;
  if (m.seats.A && m.seats.A.token === token) return 'A';
  if (m.seats.B && m.seats.B.token === token) return 'B';
  return null;
}

function vsOther_(seat) { return seat === 'A' ? 'B' : 'A'; }

// ---------------------------------------------------------------
// クライアントに返す公開状態（トークンは落とす）
function vsPublic_(m) {
  const now = Date.now();
  const out = {
    code: m.code,
    status: m.status,
    rule: m.rule,
    total: m.total,
    scores: m.scores,
    claims: m.claims,
    resolvedAt: m.resolvedAt,
    winner: m.winner,
    startAt: m.startAt,
    abandonedBy: m.abandonedBy || null,
    revealMs: VS_REVEAL_MS,
    serverNow: now,
    players: {}
  };
  ['A', 'B'].forEach(seat => {
    const s = m.seats[seat];
    if (!s) { out.players[seat] = null; return; }
    const p = vsReadPlayer_(m.code, seat) || { index: 0, phase: 1, miss: 0, seenAt: s.joinedAt };
    out.players[seat] = {
      name: s.name,
      index: p.index || 0,
      phase: p.phase || 1,
      miss: p.miss || 0,
      online: (now - (p.seenAt || 0)) < VS_STALE_MS
    };
  });
  return out;
}

// ---------------------------------------------------------------
// 勝敗判定。claims が埋まりきる or 先取条件到達で終了
function vsEvaluate_(m) {
  if (m.status !== 'playing') return;
  if (m.rule.mode === 'first') {
    if (m.scores.A >= m.rule.target) { m.status = 'finished'; m.winner = 'A'; return; }
    if (m.scores.B >= m.rule.target) { m.status = 'finished'; m.winner = 'B'; return; }
  }
  let resolved = 0;
  for (let i = 0; i < m.claims.length; i++) if (m.claims[i]) resolved++;
  if (resolved >= m.total) {
    m.status = 'finished';
    m.winner = (m.scores.A === m.scores.B) ? 'draw' : (m.scores.A > m.scores.B ? 'A' : 'B');
  }
}

// ---------------------------------------------------------------
// 出題数。先取ルールは最悪 2N-1 問で決着するのでその分だけ用意する
function vsNeededTotal_(rule) {
  const n = (rule.mode === 'first') ? (rule.target * 2 - 1) : rule.target;
  return Math.max(1, Math.min(VS_MAX_TOTAL, n));
}

function vsNormalizeRule_(opts) {
  const mode = (opts && opts.mode === 'count') ? 'count' : 'first';
  let target = Number(opts && opts.target) || 5;
  if (mode === 'first') {
    target = (target === 10) ? 10 : 5;
  } else {
    target = Math.max(3, Math.min(VS_MAX_TOTAL, Math.round(target)));
  }
  return {
    mode: mode,
    target: target,
    from: Number(opts && opts.from) || 0,
    to: Number(opts && opts.to) || 0,
    // 部屋を作った側の選択が、そのまま相手にも渡る
    subject: (opts && opts.subject === 'kobun') ? 'kobun' : 'eigo',
    example: !!(opts && opts.example)
  };
}

// ===============================================================
// 部屋を作る → 4桁コードを発行
// ===============================================================
function vsCreateRoom(opts) {
  opts = opts || {};
  const rule = vsNormalizeRule_(opts);
  const need = vsNeededTotal_(rule);

  const q = { from: rule.from, to: rule.to, limit: need, shuffle: true };
  const res = (rule.subject === 'kobun') ? getKobunWords(q) : getJukenWords(q);
  const words = (res && res.words) || [];
  if (!words.length) return vsErr_('その範囲には出題できる語がありません');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(VS_LOCK_MS)) return vsErr_('混み合っています。もう一度お試しください');
  try {
    let code = null;
    for (let i = 0; i < 20; i++) {
      const c = String(Math.floor(1000 + Math.random() * 9000));
      if (!vsCache_().get(vsMetaKey_(c))) { code = c; break; }
    }
    if (!code) return vsErr_('部屋を作れませんでした。もう一度お試しください');

    const token = vsToken_();
    const now = Date.now();
    const m = {
      code: code,
      createdAt: now,
      updatedAt: now,
      status: 'waiting',
      rule: rule,
      total: words.length,
      seats: {
        A: { name: vsName_(opts.name, 'あなた'), token: token, joinedAt: now },
        B: null
      },
      scores: { A: 0, B: 0 },
      claims: new Array(words.length).fill(null),
      resolvedAt: new Array(words.length).fill(0),
      giveUp: { A: -1, B: -1 },
      startAt: 0,
      winner: null
    };

    vsCache_().put(vsQKey_(code), JSON.stringify(words), VS_TTL_SEC);
    vsWritePlayer_(code, 'A', { index: 0, phase: 1, miss: 0, seenAt: now });
    vsWriteMeta_(m);

    return { ok: true, code: code, token: token, seat: 'A', state: vsPublic_(m) };
  } finally {
    lock.releaseLock();
  }
}

function vsName_(raw, fallback) {
  const s = String(raw == null ? '' : raw).trim().slice(0, 12);
  return s || fallback;
}

// ===============================================================
// 部屋に入る
// ===============================================================
function vsJoinRoom(opts) {
  opts = opts || {};
  const code = String(opts.code || '').trim();
  if (!/^\d{4}$/.test(code)) return vsErr_('4桁の数字を入力してください');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(VS_LOCK_MS)) return vsErr_('混み合っています。もう一度お試しください');
  try {
    const m = vsReadMeta_(code);
    if (!m) return vsErr_('その番号の対戦は見つかりません');
    if (m.seats.B) return vsErr_('その対戦はすでに2人そろっています');
    if (m.status !== 'waiting') return vsErr_('その対戦はもう始まっています');

    const token = vsToken_();
    const now = Date.now();
    m.seats.B = { name: vsName_(opts.name, 'あいて'), token: token, joinedAt: now };
    m.status = 'playing';
    m.startAt = now + VS_START_LAG;   // 両者が同じ瞬間に始められるよう server 時刻で予約
    vsWritePlayer_(code, 'B', { index: 0, phase: 1, miss: 0, seenAt: now });
    vsWriteMeta_(m);

    return { ok: true, code: code, token: token, seat: 'B', state: vsPublic_(m) };
  } finally {
    lock.releaseLock();
  }
}

// ===============================================================
// 出題データ（開始時に一度だけ取得）
// ===============================================================
function vsFetchQuestions(code, token) {
  const m = vsReadMeta_(String(code || ''));
  if (!m) return vsErr_('対戦が見つかりません');
  if (!vsSeatOf_(m, token)) return vsErr_('この対戦の参加者ではありません');
  const raw = vsCache_().get(vsQKey_(m.code));
  if (!raw) return vsErr_('出題データの有効期限が切れました');
  return { ok: true, words: JSON.parse(raw) };
}

// ===============================================================
// ポーリング本体。自分の進捗を置いて、最新の共有状態をもらう
// ===============================================================
function vsSync(code, token, me) {
  const m = vsReadMeta_(String(code || ''));
  if (!m) return vsErr_('対戦が見つかりません');
  const seat = vsSeatOf_(m, token);
  if (!seat) return vsErr_('この対戦の参加者ではありません');

  me = me || {};
  vsWritePlayer_(m.code, seat, {
    index: Number(me.index) || 0,
    phase: Number(me.phase) || 1,
    miss:  Number(me.miss)  || 0,
    seenAt: Date.now()
  });

  return { ok: true, seat: seat, state: vsPublic_(m) };
}

// ===============================================================
// 「正解しました」の申告。先着だけが得点する（判定はサーバー側）
// ===============================================================
function vsReportCorrect(code, token, qIndex) {
  const key = String(code || '');
  const i = Number(qIndex);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(VS_LOCK_MS)) return vsErr_('混み合っています');
  try {
    const m = vsReadMeta_(key);
    if (!m) return vsErr_('対戦が見つかりません');
    const seat = vsSeatOf_(m, token);
    if (!seat) return vsErr_('この対戦の参加者ではありません');
    if (!(i >= 0 && i < m.total)) return vsErr_('問題番号が不正です');

    if (m.status !== 'playing') {
      return { ok: true, won: m.claims[i] === seat, state: vsPublic_(m) };
    }

    // すでに誰かが取っている＝後着なので負け
    if (m.claims[i]) {
      return { ok: true, won: m.claims[i] === seat, state: vsPublic_(m) };
    }

    m.claims[i] = seat;
    m.resolvedAt[i] = Date.now();
    m.scores[seat] = (m.scores[seat] || 0) + 1;
    vsEvaluate_(m);
    vsWriteMeta_(m);

    return { ok: true, won: true, state: vsPublic_(m) };
  } finally {
    lock.releaseLock();
  }
}

// ===============================================================
// 時間切れ／あきらめの申告。両者が降りたらその問題は「得点なし」で決着
// ===============================================================
function vsReportTimeout(code, token, qIndex) {
  const key = String(code || '');
  const i = Number(qIndex);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(VS_LOCK_MS)) return vsErr_('混み合っています');
  try {
    const m = vsReadMeta_(key);
    if (!m) return vsErr_('対戦が見つかりません');
    const seat = vsSeatOf_(m, token);
    if (!seat) return vsErr_('この対戦の参加者ではありません');
    if (!(i >= 0 && i < m.total)) return vsErr_('問題番号が不正です');
    if (m.status !== 'playing' || m.claims[i]) {
      return { ok: true, state: vsPublic_(m) };
    }

    if (m.giveUp[seat] < i) m.giveUp[seat] = i;

    // 相手が落ちている場合はひとりでも進める（待ち続けて固まらないように）
    const other = vsOther_(seat);
    const op = vsReadPlayer_(m.code, other);
    const opAlive = !!(op && (Date.now() - (op.seenAt || 0)) < VS_STALE_MS);

    if (m.giveUp[other] >= i || !opAlive) {
      m.claims[i] = 'none';
      m.resolvedAt[i] = Date.now();
      vsEvaluate_(m);
    }
    vsWriteMeta_(m);
    return { ok: true, state: vsPublic_(m) };
  } finally {
    lock.releaseLock();
  }
}

// ===============================================================
// 退出。残ったほうの不戦勝で終了させる
// ===============================================================
function vsLeaveRoom(code, token) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(VS_LOCK_MS)) return vsErr_('混み合っています');
  try {
    const m = vsReadMeta_(String(code || ''));
    if (!m) return { ok: true };
    const seat = vsSeatOf_(m, token);
    if (!seat) return { ok: true };

    if (m.status === 'waiting') {
      vsCache_().remove(vsMetaKey_(m.code));
      vsCache_().remove(vsQKey_(m.code));
      vsCache_().remove(vsPlayerKey_(m.code, 'A'));
      vsCache_().remove(vsPlayerKey_(m.code, 'B'));
      return { ok: true };
    }
    if (m.status === 'playing') {
      m.status = 'finished';
      m.abandonedBy = seat;
      m.winner = vsOther_(seat);
      vsWriteMeta_(m);
    }
    return { ok: true, state: vsPublic_(m) };
  } finally {
    lock.releaseLock();
  }
}
