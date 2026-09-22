// 古文単語（見出し語）データ。巻末索引から起こした見出し語に、
// 現代語訳・古文の例文・その訳を付けたもの。
// ex は出題語を〔〕で、exja は答えにあたる部分を【】で囲んである。
const KOBUN_WORDS = [
];

// ---------------------------------------------------------------
// 収録範囲（メニューの案内用）
function getKobunMeta() {
  const nos = KOBUN_WORDS.map(w => w.no);
  if (!nos.length) return { total: 0, minNo: 0, maxNo: 0 };
  return {
    total: KOBUN_WORDS.length,
    minNo: Math.min.apply(null, nos),
    maxNo: Math.max.apply(null, nos),
  };
}

// ---------------------------------------------------------------
// 出題データの取り出し
// opts: { from, to, limit, shuffle, pos }
function getKobunWords(opts) {
  opts = opts || {};
  const from  = Number(opts.from) || 0;
  const to    = Number(opts.to)   || 0;
  const limit = Number(opts.limit) || 20;
  const pos   = opts.pos || 'all';

  let words = KOBUN_WORDS.filter(w =>
    (!from || w.no >= from) &&
    (!to   || w.no <= to) &&
    (pos === 'all' || matchesPos_(w.pos, pos))
  );

  const matched = words.length;

  if (opts.shuffle) {
    words = words.slice();
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
  } else {
    words = words.slice().sort((a, b) => a.no - b.no);
  }

  return { words: words.slice(0, limit), matched: matched };
}

// 品詞の絞り込み。「連語」を選んだときは、動詞・形容詞・形容動詞・名詞・副詞の
// どれでもないもの（連語・感動詞・枕詞など）をまとめて返す。
function matchesPos_(actual, want) {
  actual = String(actual || '');
  const main = ['動', '形', '形動', '名', '副'];
  if (want === '連語') return main.indexOf(actual) < 0;
  return actual === want;
}
