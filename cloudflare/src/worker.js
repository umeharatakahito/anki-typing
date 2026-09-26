// ===============================================================
// worker.js
// GAS 版の doGet（画面の出し分け）と google.script.run の受け口。
//
//   GET  /?p=<画面>        … GAS 版と同じ ?p= で画面を選ぶ（/juken のようなパスも可）
//   POST /api/<関数名>     … 本文は引数の配列。{ value } か { error } を返す
//   /auth/*               … Google ログイン（auth.js）
//   /admin                … 会員の管理（admin.js）
// ===============================================================

import { PAGES } from './generated/pages.js';
import * as gas from './generated/gas.js';
import * as stats from './stats.js';
import { VersusHub, VS_FUNCTIONS } from './versus.js';
import { viewerOf, handleAuth } from './auth.js';
import { handleAdmin } from './admin.js';
import { decorate, THEMES } from './chrome.js';
import { STUDY_SETS, CAT_BY_KBN } from './sets.js';
import * as gate from './gate.js';

export { VersusHub };

// ---------------------------------------------------------------
// 画面（コード.gs の doGet と同じ対応表）
const AUTO_MODE_BY_ROUTE = {
  'practice': '写経モード',
  'normal':   '通常モード',
  'hard':     '極みモード',
  'kiwami':   '極みモード',
};

const JUKEN_PAGES = {
  'juken':   { file: 'juken_home',    title: '大学受験モード' },
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

// 大学受験モードの画面のうち、許された人だけが開けるもの（大学受験のメニュー自体は誰でも開ける）
const JUKEN_ONLY = ['eigo', 'kobun', 'rekishi', 'versus'];

// HTML の文字列か、よそへ回すときは Response を返す
function renderPage(url, viewer) {
  const route = String(url.searchParams.get('p') || url.pathname.replace(/^\/+|\/+$/g, '')).toLowerCase();
  const vars = { execUrl: '/', subject: '', subjectLabel: '', backRoute: '', autoMode: '', studySet: null,
                 jukenFull: viewer.juken };

  if (JUKEN_ONLY.includes(route) && !viewer.juken) {
    return Response.redirect(new URL('/?p=juken', url).toString(), 302);
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

  // タイピング（HAMACHI-TYPE）。?p=it / koko / ichimon / english で並べる問題集が変わる。
  // 練習モードなどの直行ルートは IT の「基本・応用」
  const setKey = STUDY_SETS[route] ? route : (AUTO_MODE_BY_ROUTE[route] ? 'it' : '');
  if (setKey) {
    vars.autoMode = AUTO_MODE_BY_ROUTE[route] || '';
    vars.studySet = Object.assign({ key: setKey }, STUDY_SETS[setKey], {
      // ランキングに他の問題集の記録が混ざっても名前で出せるように
      labels: Object.fromEntries(Object.entries(CAT_BY_KBN).map(([k, c]) => [k, c.label]))
    });
    return withHead(PAGES.index(vars), 'Study Type（' + STUDY_SETS[setKey].title + '）',
      'width=device-width, initial-scale=1');
  }

  if (route === 'ranking') {
    vars.studySet = { groups: Object.values(STUDY_SETS).map(s => ({ title: s.title, cats: s.cats })) };
    return withHead(PAGES.ranking(vars), 'ランキング', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }

  // それ以外はトップメニュー
  return withHead(PAGES.home(vars), 'Study Type',
    'width=device-width, initial-scale=1, viewport-fit=cover');
}

// ---------------------------------------------------------------
// google.script.run で呼べる関数
// 大学受験モードの出題。会員でない人は範囲を絞る
function jukenWords(subject) {
  return (env, opts) => env.viewer.member
    ? stats.wordsFor(env, subject, opts)
    : stats.wordsFor(env, subject, gate.clampOpts(subject, opts)).then(r => gate.filterWords(subject, r));
}

async function jukenRound(env, opts) {
  if (env.viewer.member) return stats.getJukenRound(env, opts);
  const subject = gas.jukenSubject_(opts && opts.subject);
  const res = await stats.getJukenRound(env, gate.clampOpts(subject, opts));
  const cut = gate.filterWords(subject, res);
  // 範囲の外が混ざっていたゴーストは使わない
  if (res.ghost && cut.words.length !== res.words.length) cut.ghost = null;
  return cut;
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
  getLevelQuestions: stats.getLevelQuestions,
  getUserRanking: stats.getUserRanking,
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

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export default {
  async fetch(request, rawEnv) {
    const url = new URL(request.url);

    const auth = await handleAuth(request, rawEnv, url);
    if (auth) return auth;

    const viewer = await viewerOf(request, rawEnv);
    const env = Object.assign(Object.create(rawEnv), { viewer });

    const admin = await handleAdmin(request, env, url, viewer);
    if (admin) return admin;

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
    const page = renderPage(url, viewer);
    if (page instanceof Response) return page;
    return new Response(decorate(page, viewer, env, theme), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
