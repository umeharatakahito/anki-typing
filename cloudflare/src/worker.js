// ===============================================================
// worker.js
// GAS 版の doGet（画面の出し分け）と google.script.run の受け口。
//
//   GET  /?p=<画面>        … GAS 版と同じ ?p= で画面を選ぶ（/juken のようなパスも可）
//   POST /api/<関数名>     … 本文は引数の配列。{ value } か { error } を返す
// ===============================================================

import { PAGES } from './generated/pages.js';
import * as gas from './generated/gas.js';
import * as stats from './stats.js';
import { VersusHub, VS_FUNCTIONS } from './versus.js';

export { VersusHub };

// ---------------------------------------------------------------
// 画面（コード.gs の doGet と同じ対応表）
const AUTO_MODE_BY_ROUTE = {
  'practice': '練習モード',
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

function renderPage(url) {
  const route = String(url.searchParams.get('p') || url.pathname.replace(/^\/+|\/+$/g, '')).toLowerCase();
  const vars = { execUrl: '/', subject: '', subjectLabel: '', backRoute: '', autoMode: '' };

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

  vars.autoMode = AUTO_MODE_BY_ROUTE[route] || '';
  return withHead(PAGES.index(vars), '暗記タイピング', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------
// google.script.run で呼べる関数
const D1_FUNCTIONS = {
  getQuestions: stats.getQuestions,
  saveScore: stats.saveScore,
  getRanking: stats.getRanking,
  saveJukenResult: stats.saveJukenResult,
  getJukenStats: stats.getJukenStats,
  getJukenPrefs: stats.getJukenPrefs,
  saveJukenPrefs: stats.saveJukenPrefs,
  saveJukenGhost: stats.saveJukenGhost,
  getJukenRound: stats.getJukenRound,
  getJukenWords: (env, opts) => stats.wordsFor(env, 'eigo', opts),
  getKobunWords: (env, opts) => stats.wordsFor(env, 'kobun', opts),
  getRekishiWords: (env, opts) => stats.wordsFor(env, 'rekishi', opts),
};

const PURE_FUNCTIONS = {
  getJukenMeta: gas.getJukenMeta,
  getKobunMeta: gas.getKobunMeta,
  getRekishiMeta: gas.getRekishiMeta,
  getRekishiZuList: gas.getRekishiZuList,
  getRekishiZu: gas.getRekishiZu,
};

async function callFunction(env, fn, args) {
  if (Object.hasOwn(D1_FUNCTIONS, fn)) return D1_FUNCTIONS[fn](env, ...args);
  if (Object.hasOwn(PURE_FUNCTIONS, fn)) return PURE_FUNCTIONS[fn](...args);
  if (VS_FUNCTIONS.includes(fn)) {
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
  async fetch(request, env) {
    const url = new URL(request.url);

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
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 404 });

    return new Response(renderPage(url), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
};
