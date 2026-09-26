// ===============================================================
// build.mjs
// GAS 版（../gas）をそのまま材料にして、Worker が読み込むモジュールを作る。
//
//   src/generated/pages.js  … HTML テンプレート。include() はここで展開し、
//                             <?= ?> だけをリクエストごとに埋める関数にする。
//   src/generated/gas.js    … 単語データと出題関数、対戦モードのサーバー処理。
//                             .gs をつなげて、GAS 固有の API だけ差し替える。
//
// GAS 側を直したら npm run build し直せば Cloudflare 版にも入る。
// ===============================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GAS = join(here, '..', 'gas');
const OUT = join(here, 'src', 'generated');
mkdirSync(OUT, { recursive: true });

const read = name => readFileSync(join(GAS, name), 'utf8');

// ---------------------------------------------------------------
// ページ
// google.script.run を /api/<関数名> への fetch に置き換える小さなシム。
// 各画面の JS は GAS 版のまま動く。
const SHIM = `<script>
(function () {
  function runner(ok, ng) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (f) { return runner(f, ng); };
        if (name === 'withFailureHandler') return function (f) { return runner(ok, f); };
        if (name === 'withUserObject') return function () { return runner(ok, ng); };
        return function () {
          var body = JSON.stringify(Array.prototype.slice.call(arguments));
          fetch('/api/' + encodeURIComponent(name), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: body,
            // ページを閉じるときの退出通知なども届くように
            keepalive: body.length < 60000
          }).then(function (r) {
            return r.json().catch(function () { return { error: 'HTTP ' + r.status }; });
          }).then(function (res) {
            if (res && res.error !== undefined) throw new Error(res.error);
            return res.value;
          }).then(function (value) {
            if (ok) ok(value);
          }, function (err) {
            if (ng) ng(err instanceof Error ? err : new Error(String(err)));
            else console.error(err);
          });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = { run: runner(null, null) };
})();
</script>`;

// <?!= include('X'); ?> をビルド時に展開する（入れ子にも対応）
function expandIncludes(src) {
  return src.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, name) =>
    expandIncludes(read(name + '.html')));
}

// 残ったスクリプトレットを、変数を受け取って文字列を返す関数の本体にする
function compileTemplate(src) {
  const parts = [];
  const re = /<\?(!?=)\s*([\s\S]*?)\s*;?\s*\?>/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    parts.push(JSON.stringify(src.slice(last, m.index)));
    parts.push(m[1] === '!=' ? `String(${m[2]})` : `esc(${m[2]})`);
    last = re.lastIndex;
  }
  parts.push(JSON.stringify(src.slice(last)));
  return parts.join(' +\n    ');
}

const PAGE_FILES = ['home', 'ranking', 'index', 'juken_home', 'juken_index', 'juken_kobun', 'juken_rekishi', 'juken_versus'];
const VARS = ['execUrl', 'subject', 'subjectLabel', 'backRoute', 'autoMode', 'studySet', 'jukenFull'];

let pages = `// 自動生成（build.mjs）。編集しないこと。
const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const SHIM = ${JSON.stringify(SHIM)};
export const PAGES = {};
`;
for (const name of PAGE_FILES) {
  let src = expandIncludes(read(name + '.html'));
  // GAS のサンドボックス iframe 向けの指定は不要。シムは他のスクリプトより前に置く
  src = src.replace(/<base target="_top">\s*/, '');
  if (!src.includes('<head>')) throw new Error(name + '.html に <head> がありません');
  src = src.replace('<head>', '<head>\n' + SHIM);
  pages += `PAGES[${JSON.stringify(name)}] = function (d) {
  const { ${VARS.join(', ')} } = d;
  return ${compileTemplate(src)};
};
`;
}
writeFileSync(join(OUT, 'pages.js'), pages);

// ---------------------------------------------------------------
// サーバー側の関数
// JukenStats.gs のうち、スプレッドシートに触れない関数だけ抜き出して使う
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' が見つかりません');
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(name + ' の終わりが見つかりません');
}

const stats = read('JukenStats.gs');

const gas = `// 自動生成（build.mjs）。編集しないこと。
// ../gas の .gs をつなげたもの。GAS 固有のサービスだけをここで差し替える。

// ---- 苦手な語: 呼ぶ直前に D1 から読んだ結果を入れておく（出題関数は同期のまま）
let WEAK_ = {};
function weakKeys_(subject) { return WEAK_[subject] || {}; }
export function withWeak(weak, fn) {
  WEAK_ = weak || {};
  try { return fn(); } finally { WEAK_ = {}; }
}

// ---- 対戦モード用: CacheService / LockService / Utilities の代わり
// Durable Object は1つずつ順番に処理するので、ロックは常に取れる扱いでよい。
let CACHE_ = null;
export function useCache(cache) { CACHE_ = cache; }
const CacheService = { getScriptCache: () => CACHE_ };
const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
const Utilities = { getUuid: () => crypto.randomUUID() };

${read('JukenWords.gs')}

${read('KobunWords.gs')}

${read('RekishiWords.gs')}

${read('RekishiZu.gs')}

// ---- JukenStats.gs から
${extractFunction(stats, 'jukenSubject_')}

${extractFunction(stats, 'wordsByKeys_')}

${read('JukenVersus.gs')}

export {
  getJukenMeta, getJukenWords, getKobunMeta, getKobunWords,
  getRekishiMeta, getRekishiWords, getRekishiZuList, getRekishiZu,
  jukenSubject_, wordsByKeys_,
  vsCreateRoom, vsJoinRoom, vsFetchQuestions, vsSync,
  vsReportCorrect, vsReportTimeout, vsLeaveRoom
};
`;
writeFileSync(join(OUT, 'gas.js'), gas);

console.log('built', PAGE_FILES.length, 'pages and gas.js');
