// ===============================================================
// worker.js
// GAS 版の doGet（画面の出し分け）と google.script.run の受け口。
//
//   GET  /?p=<画面>        … GAS 版と同じ ?p= で画面を選ぶ（/juken のようなパスも可）
//   POST /api/<関数名>     … 本文は引数の配列。{ value } か { error } を返す
//   /auth/*               … Google ログイン（auth.js）
//   /admin                … 会員の管理（admin.js）
//   /vs/ws                … タイピングの対戦（WebSocket。typing-versus.js）
//   /plan /legal /pay/*   … 会員プランと支払い（pay.js）
// ===============================================================

import { PAGES } from './generated/pages.js';
import * as gas from './generated/gas.js';
import * as stats from './stats.js';
import { VersusHub, VS_FUNCTIONS } from './versus.js';
import { TypingVersus } from './typing-versus.js';
import { viewerOf, handleAuth } from './auth.js';
import { handleAdmin } from './admin.js';
import { decorate, THEMES } from './chrome.js';
import { STUDY_SETS, CAT_BY_KBN, MENU, OLD_KEYS } from './sets.js';
import { renderHome, renderCategory } from './portal.js';
import { handlePay, renderPlan, renderLegal } from './pay.js';
import * as gate from './gate.js';
import { JUKEN_FIGS } from './generated/juken-figs.js';

export { VersusHub, TypingVersus };

// ---------------------------------------------------------------
// 画面（コード.gs の doGet と同じ対応表）
const AUTO_MODE_BY_ROUTE = {
  'practice': '写経モード',
  'normal':   '通常モード',
  'hard':     '極みモード',
  'kiwami':   '極みモード',
};

const JUKEN_PAGES = {
  'juken':   { file: 'juken_home',    title: '市高' },
  'eigo':    { file: 'juken_index',   title: '英単語' },
  'kobun':   { file: 'juken_kobun',   title: '古文単語' },
  'rekishi': { file: 'juken_rekishi', title: '歴史' },
  'versus':  { file: 'juken_versus',  title: '対戦モード' },
};

const SUBJECTS = {
  'eigo':    { label: '英単語' },
  'kobun':   { label: '古文単語' },
  'rekishi': { label: '歴史' },
};
const SUBJECT_PAGES = { 'versus': '対戦モード' };

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// GAS の setTitle / addMetaTag にあたる処理
function withHead(html, title, viewport) {
  if (/<title>[\s\S]*?<\/title>/.test(html)) {
    html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + escHtml(title) + '</title>');
  } else {
    html = html.replace('</head>', '<title>' + escHtml(title) + '</title>\n</head>');
  }
  if (!/<meta name="viewport"/.test(html)) {
    html = html.replace('</head>', '<meta name="viewport" content="' + viewport + '">\n</head>');
  }
  return html;
}

// 大学受験モード（トップの ⑤市高：英単語・古文・歴史・対戦）は許された人だけが開ける
const JUKEN_ONLY = ['juken', 'eigo', 'kobun', 'rekishi', 'versus'];

// HTML の文字列か、よそへ回すときは Response を返す
function renderPage(url, viewer, available, env, favs) {
  const route = String(url.searchParams.get('p') || url.pathname.replace(/^\/+|\/+$/g, '')).toLowerCase();
  const vars = { execUrl: '/', subject: '', subjectLabel: '', backRoute: '', autoMode: '', studySet: null,
                 jukenFull: viewer.juken };

  if (JUKEN_ONLY.includes(route) && !viewer.juken) {
    return Response.redirect(new URL('/', url).toString(), 302);
  }

  const page = JUKEN_PAGES[route];
  if (page) {
    let title = page.title;
    if (SUBJECT_PAGES[route]) {
      const asked = String(url.searchParams.get('s') || '').toLowerCase();
      const key = SUBJECTS[asked] ? asked : 'eigo';
      vars.subject = key;
      vars.subjectLabel = SUBJECTS[key].label;
      vars.backRoute = key;
      title = SUBJECT_PAGES[route] + '（' + SUBJECTS[key].label + '）';
    }
    return withHead(PAGES[page.file](vars), title,
      'width=device-width, initial-scale=1, viewport-fit=cover');
  }

  // 大分類（?p=koko など。以前の ?p=it なども読み替える）。
  // そのままなら分類ページ、?k=<問題集> や ?join=<部屋番号> 付きならタイピング画面
  const catKey = OLD_KEYS[route] || route;
  const cat = MENU.find(m => m.key === catKey);
  const askedK = url.searchParams.get('k');
  const playable = askedK && STUDY_SETS[catKey] && STUDY_SETS[catKey].cats.some(c => c.kbn === askedK && (!available || available.has(c.kbn)));
  if (cat && !playable && !url.searchParams.get('join')) return renderCategory(cat, available, viewer, favs);

  // タイピング（HAMACHI-TYPE）。大分類ごとに並べる問題集が変わる。
  // 練習モードなどの直行ルートは資格の「基本・応用」
  const setKey = STUDY_SETS[catKey] ? catKey : (AUTO_MODE_BY_ROUTE[route] ? 'shikaku' : '');
  if (setKey) {
    vars.autoMode = AUTO_MODE_BY_ROUTE[route] || '';
    vars.studySet = Object.assign({ key: setKey }, STUDY_SETS[setKey], {
      // 問題がまだ入っていない問題集はメニューに出さない
      cats: STUDY_SETS[setKey].cats.filter(c => !available || available.has(c.kbn) || c.kbn === 'shinra'),
      // ランキングに他の問題集の記録が混ざっても名前で出せるように
      labels: Object.fromEntries(Object.entries(CAT_BY_KBN).map(([k, c]) => [k, c.label]))
    });
    return withHead(PAGES.index(vars), 'Study Type（' + STUDY_SETS[setKey].title + '）',
      'width=device-width, initial-scale=1');
  }

  if (route === 'plan') return renderPlan(viewer, env, url);
  if (route === 'legal') return renderLegal(env);

  if (route === 'me') {
    return withHead(PAGES.mypage(vars), 'わたしの戦績', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }

  if (route === 'ranking') {
    vars.studySet = { groups: Object.values(STUDY_SETS).filter(s => s.cats.length).map(s => ({ title: s.title, cats: s.cats })) };
    return withHead(PAGES.ranking(vars), 'ランキング', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }

  // それ以外はトップ
  return renderHome(viewer, available, favs);
}

// ---------------------------------------------------------------
// google.script.run で呼べる関数
// 出題する語に図（あれば）を付ける。英単語は語で、古文・歴史は番号で引く
const figKey = (subject, w) => subject === 'eigo' ? 'eigo:' + String(w.en || '').toLowerCase() : subject + ':' + w.no;
// マーク中の語を、出題の中に混ぜる（最大 4 分の 1。ゴーストで同じ問題を出すときは混ぜない）
async function withMarked(env, subject, res) {
  if (!res || !Array.isArray(res.words) || !res.words.length || res.ghost || !env.viewer.email) return res;
  const keyOf = w => subject === 'kobun' ? w.ko : subject === 'rekishi' ? w.a : w.en;
  const have = new Set(res.words.map(keyOf));
  const room = Math.max(1, Math.floor(res.words.length / 4));
  const keys = (await stats.markedJukenKeys(env, subject, room * 2)).filter(k => !have.has(k)).slice(0, room);
  if (!keys.length) return res;
  let add = gas.wordsByKeys_(subject, keys).words;
  if (!env.viewer.member) add = gate.filterWords(subject, { words: add }).words;
  const words = res.words.slice();
  // 決まった数を出す設定なので、入れた分だけ後ろを落とす（ランダムな位置に差し込む）
  add.forEach(w => { words.pop(); words.splice(Math.floor(Math.random() * (words.length + 1)), 0, w); });
  return Object.assign({}, res, { words });
}

function withFigs(subject, res) {
  if (!res || !Array.isArray(res.words)) return res;
  return Object.assign({}, res, { words: res.words.map(w => {
    const f = JUKEN_FIGS[figKey(subject, w)];
    return f ? Object.assign({}, w, { img: '/fig/' + f.file }) : w;
  }) });
}

// 大学受験モードの出題。会員でない人は範囲を絞る
function jukenWords(subject) {
  return async (env, opts) => withFigs(subject, await withMarked(env, subject, env.viewer.member
    ? await stats.wordsFor(env, subject, opts)
    : gate.filterWords(subject, await stats.wordsFor(env, subject, gate.clampOpts(subject, opts)))));
}

async function jukenRound(env, opts) {
  const subject = gas.jukenSubject_(opts && opts.subject);
  if (env.viewer.member) return withFigs(subject, await withMarked(env, subject, await stats.getJukenRound(env, opts)));
  const res = await stats.getJukenRound(env, gate.clampOpts(subject, opts));
  const cut = gate.filterWords(subject, res);
  // 範囲の外が混ざっていたゴーストは使わない
  if (res.ghost && cut.words.length !== res.words.length) cut.ghost = null;
  return withFigs(subject, await withMarked(env, subject, cut));
}

const jukenMeta = (subject, fn) => env => env.viewer.member ? fn() : gate.clampMeta(subject, fn());

async function setTheme(env, theme) {
  if (!env.viewer.email || !THEMES.includes(theme)) return { ok: false };
  await env.DB.prepare(
    'INSERT INTO user_prefs (email, theme, at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET theme = excluded.theme, at = excluded.at'
  ).bind(env.viewer.email, theme, Date.now()).run();
  return { ok: true };
}

const D1_FUNCTIONS = {
  getQuestions: stats.getQuestions,
  getLevelInfo: stats.getLevelInfo,
  getScopes: stats.getScopes,
  getMySets: stats.getMySets,
  setFavorite: stats.setFavorite,
  setMyScopes: stats.setMyScopes,
  getLevelQuestions: stats.getLevelQuestions,
  getUserRanking: stats.getUserRanking,
  getMyStats: stats.getMyStats,
  reportProblem: stats.reportProblem,
  reviewSync: stats.reviewSync,
  setMark: stats.setMark,
  setTheme,
  saveScore: stats.saveScore,
  getRanking: stats.getRanking,
  saveJukenResult: stats.saveJukenResult,
  getJukenStats: stats.getJukenStats,
  getJukenPrefs: stats.getJukenPrefs,
  saveJukenPrefs: stats.saveJukenPrefs,
  saveJukenGhost: stats.saveJukenGhost,
  getJukenRound: jukenRound,
  getJukenWords: jukenWords('eigo'),
  getKobunWords: jukenWords('kobun'),
  getRekishiWords: jukenWords('rekishi'),
  getJukenMeta: jukenMeta('eigo', gas.getJukenMeta),
  getKobunMeta: jukenMeta('kobun', gas.getKobunMeta),
  getRekishiMeta: jukenMeta('rekishi', gas.getRekishiMeta),
  getRekishiZuList: env => env.viewer.member ? gas.getRekishiZuList()
    : gas.getRekishiZuList().filter(z => gate.freeZuIds().includes(z.id)),
  getRekishiZu: (env, opts) => (env.viewer.member || gate.freeZuIds().includes(String(opts && opts.id)))
    ? gas.getRekishiZu(opts) : { error: 'この図表は会員向けです' },
};

// env には、今見ている人（env.viewer）が足してある。関数はそれで会員かどうかを見る
// 大学受験モードの関数（英単語・古文・歴史の出題と記録、対戦）。許された人だけが呼べる
const JUKEN_FUNCTIONS = new Set([
  'saveJukenResult', 'getJukenStats', 'getJukenPrefs', 'saveJukenPrefs', 'saveJukenGhost', 'getJukenRound',
  'getJukenWords', 'getKobunWords', 'getRekishiWords', 'getJukenMeta', 'getKobunMeta', 'getRekishiMeta',
  'getRekishiZuList', 'getRekishiZu', ...VS_FUNCTIONS
]);

async function callFunction(env, fn, args) {
  if (JUKEN_FUNCTIONS.has(fn) && !env.viewer.juken) {
    const err = new Error('大学受験モードは使えません');
    err.status = 403;
    throw err;
  }
  if (Object.hasOwn(D1_FUNCTIONS, fn)) return D1_FUNCTIONS[fn](env, ...args);
  if (VS_FUNCTIONS.includes(fn)) {
    // 部屋を作るときの出題範囲も、会員でなければ絞る
    if (fn === 'vsCreateRoom' && !env.viewer.member) {
      const opts = args[0] || {};
      args = [gate.clampOpts(gas.jukenSubject_(opts.subject), opts)].concat(args.slice(1));
    }
    const hub = env.VERSUS.get(env.VERSUS.idFromName('hub'));
    return hub.run(fn, args);
  }
  const err = new Error('Script function not found: ' + fn);
  err.status = 404;
  throw err;
}

// 問題が入っている問題集（kbn → 問題数の Map）。problem_stats（数十行）から読み、1 時間覚えておく。
// 問題の入れ直しはまれで、入れ直したあと 1 時間は古い数が出ることがあるだけ
let AVAILABLE_ = null, AVAILABLE_AT_ = 0;
async function availableKbns(env) {
  if (AVAILABLE_ && Date.now() - AVAILABLE_AT_ < 60 * 60 * 1000) return AVAILABLE_;
  try {
    const { results } = await env.DB.prepare('SELECT kbn, SUM(n) AS n FROM problem_stats GROUP BY kbn').all()
      .catch(() => env.DB.prepare('SELECT kbn, COUNT(*) AS n FROM problems GROUP BY kbn').all());   // problem_stats がまだ無いとき
    AVAILABLE_ = new Map(results.map(r => [r.kbn, r.n]));
    AVAILABLE_AT_ = Date.now();
  } catch (e) { /* 読めなければ全部出す */ }
  return AVAILABLE_;
}

// 同じネットワーク（同じ Wi-Fi）の印。IP アドレスをそのまま使わず、短い印にする。
// IPv6 は端末ごとに後ろ半分が違うので、前半（/64。同じ家・同じ Wi-Fi なら同じ）で見る
async function nearKey(request) {
  let ip = String(request.headers.get('cf-connecting-ip') || 'local');
  if (ip.includes(':')) ip = ip.split(':').slice(0, 4).join(':');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('st-near|' + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

// タイピングの対戦。部屋番号ごとの Durable Object（自動マッチは待合室）へ回す
async function typingVersus(request, env, url, viewer) {
  if (request.headers.get('upgrade') !== 'websocket') return new Response('WebSocket で接続してください', { status: 426 });
  // 近くの部屋の一覧（同じネットワークの部屋。typing-versus.js の near）
  if (url.pathname === '/vs/near') {
    const stub = env.TYPING_VS.get(env.TYPING_VS.idFromName('near:' + await nearKey(request)));
    return stub.fetch(new Request('https://near/near', { headers: request.headers }));
  }
  // みんなの部屋（ランダム対戦・ランダムで招待した部屋）
  if (url.pathname === '/vs/public') {
    const stub = env.TYPING_VS.get(env.TYPING_VS.idFromName('near:public'));
    return stub.fetch(new Request('https://near/near?public=1', { headers: request.headers }));
  }
  let name;
  if (url.searchParams.get('match')) name = 'lobby';
  else {
    let code = String(url.searchParams.get('code') || '');
    if (url.searchParams.get('create') === '1' && !code) {
      code = String(Math.floor(1000 + Math.random() * 9000));
      url.searchParams.set('code', code);
    }
    // 部屋を作るときは、近くの人に出すための印を付ける（?near=0 なら出さない）
    if (url.searchParams.get('create') === '1') {
      if (url.searchParams.get('near') === '0') url.searchParams.delete('near');
      else url.searchParams.set('near', await nearKey(request));
    } else url.searchParams.delete('near');
    if (!/^\d{4,5}$/.test(code)) return new Response('部屋番号が違います', { status: 400 });
    name = 'room:' + code;
  }
  const headers = new Headers(request.headers);
  // 対戦の結果を戦績に残すため、ログインしている人はメールアドレスも渡す（画面には送らない）
  headers.set('x-viewer', JSON.stringify({ name: viewer.email ? viewer.name : '', member: viewer.member, email: viewer.email || '' }));
  const stub = env.TYPING_VS.get(env.TYPING_VS.idFromName(name));
  return stub.fetch(new Request(url.toString(), { headers }));
}

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export default {
  async fetch(request, rawEnv) {
    const url = new URL(request.url);

    // 本番は https だけ。http で開くと Google ログインが「origin_mismatch」で止まる（許可しているのは https のアドレスだけ）。
    // 手元（localhost・家の中の 192.168… など）は http のまま
    if (url.protocol === 'http:' && /(^|\.)(umekobo\.com|workers\.dev)$/.test(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    const auth = await handleAuth(request, rawEnv, url);
    if (auth) return auth;

    const viewer = await viewerOf(request, rawEnv);
    const env = Object.assign(Object.create(rawEnv), { viewer });

    const admin = await handleAdmin(request, env, url, viewer);
    if (admin) return admin;

    if (url.pathname === '/vs/ws' || url.pathname === '/vs/near' || url.pathname === '/vs/public') return typingVersus(request, env, url, viewer);

    const pay = await handlePay(request, env, url, viewer);
    if (pay) return pay;

    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
      const fn = decodeURIComponent(url.pathname.slice(5));
      let args;
      try {
        args = await request.json();
        if (!Array.isArray(args)) throw new Error('arguments must be an array');
      } catch (e) {
        return json({ error: 'bad request: ' + e.message }, 400);
      }
      try {
        const value = await callFunction(env, fn, args);
        return json(value === undefined ? {} : { value });
      } catch (e) {
        return json({ error: String(e && e.message || e) }, e.status || 500);
      }
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    // public/img/ にコピーが無い画像（あとから足した問題など）はドライブのものを出す
    const img = url.pathname.match(/^\/img\/([\w-]+)\.png$/);
    if (img) return Response.redirect('https://drive.google.com/thumbnail?id=' + img[1], 302);

    if (url.pathname === '/favicon.ico') return new Response(null, { status: 404 });

    let theme = '';
    if (viewer.email) {
      const pref = await env.DB.prepare('SELECT theme FROM user_prefs WHERE email = ?').bind(viewer.email).first();
      theme = pref ? pref.theme : '';
    }
    const page = renderPage(url, viewer, await availableKbns(env), env, await stats.myFavorites(env));
    if (page instanceof Response) return page;
    return new Response(decorate(page, viewer, env, theme), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
