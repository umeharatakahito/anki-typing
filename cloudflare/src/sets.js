// ===============================================================
// sets.js
// タイピング画面（HAMACHI-TYPE）で遊べる問題集の一覧。
// MENU（トップの大分類 → 中分類 → 問題集）と、?p=<大分類> のタイピング画面に並べる問題集（kbn）を決める。
// import-caves.mjs も CAVES を見て、勉強ダンジョンズのどの洞窟を入れるか決める。
// ===============================================================

// 勉強ダンジョンズの洞窟。levelScale は、レベルが 1〜5 しかない洞窟を 2,4,…,10 に広げるため。
// ja: true は、同じ洞窟（src）の問題を「日本語の意味 → 英語」で出す入り口
export const CAVES = [
  { id: 'itpass',         label: 'ITパスポート' },
  { id: 'genai',          label: '生成AI', levelScale: 2 },
  { id: 'fe',             label: '基本情報' },
  { id: 'jh-social',      label: '中学社会' },
  { id: 'jh-science',     label: '中学理科' },
  { id: 'jhistory',       label: '日本史' },
  { id: 'whistory',       label: '世界史' },
  { id: 'english-buzzer-ja', src: 'english-buzzer', label: '英単語（日本語→英語）', ja: true },
  { id: 'english-buzzer',    label: '英単語（英英）' },
  { id: 'idioms-ja',         src: 'idioms', label: '英熟語（日本語→英語）', ja: true },
  { id: 'idioms',            label: '英熟語（英英）' },
  { id: 'phrases',        label: '会話フレーズ' },
];

// このリポジトリで作った問題集（data/sets/<id>.json。作り方は data/sets/README.md）
export const OWN_SETS = [
  { id: 'koko-kokugo',          label: '国語（漢字・語句）' },
  { id: 'koko-eigo',            label: '英語（中学英単語）' },
  { id: 'daigaku-nengo-nihon',  label: '年号（日本史）' },
  { id: 'daigaku-nengo-sekai',  label: '年号（世界史）' },
  { id: 'daigaku-seibutsu',     label: '生物' },
  { id: 'daigaku-kagaku',       label: '化学' },
  { id: 'daigaku-chiri',        label: '地理' },
  { id: 'daigaku-kokyo',        label: '公共（政治・経済）' },
  { id: 'daigaku-kanbun',       label: '漢文' },
  { id: 'daigaku-gendai',       label: '現代文（語彙）' },
  // 雑学（scripts/make-zatsugaku.mjs が data/zatsugaku/ の一覧から作る）
  { id: 'flag-country',         label: '国旗 → 国名' },
  { id: 'map-world-country',    label: '世界地図 → 国名' },
  { id: 'capital',              label: '国名 → 首都' },
  { id: 'map-japan-pref',       label: '日本地図 → 都道府県' },
  { id: 'element',              label: '元素記号 → 名前' },
  { id: 'zk-fish',              label: '魚の写真 → 名前' },
  { id: 'zk-flower',            label: '花の写真 → 名前' },
  { id: 'zk-insect',            label: '昆虫の写真 → 名前' },
  { id: 'zk-bird',              label: '鳥の写真 → 名前' },
  { id: 'zk-deepsea',           label: '深海魚の写真 → 名前' },
  { id: 'heritage',             label: '世界遺産' },
];

// まだ問題が入っていない、これから作る問題集（分類ページに「準備中」で並べる）
export const UPCOMING = [
  { id: 'map-world-nature',  label: '世界の山・川・湖・海' },
  { id: 'constellation',     label: '星座' },
  { id: 'castle',            label: '日本の城' },
];

// 問題集ごとのアイコン（icons.js の名前）とひとこと
const LOOK = {
  '1':                   { icon: 'cpu',              desc: 'IT の基本用語' },
  'itpass':              { icon: 'shield-check',     desc: '国家試験の頻出用語' },
  'genai':               { icon: 'sparkles',         desc: '生成AIのキーワード' },
  'fe':                  { icon: 'binary',           desc: '基本情報技術者' },
  'jh-social':           { icon: 'landmark',         desc: '地理・歴史・公民' },
  'jh-science':          { icon: 'flask-conical',    desc: '物理・化学・生物・地学' },
  'koko-kokugo':         { icon: 'brush',            desc: '漢字の読み書きと語句' },
  'koko-eigo':           { icon: 'languages',        desc: '中学で習う英単語' },
  'jhistory':            { icon: 'scroll-text',      desc: '人物・事件・文化' },
  'whistory':            { icon: 'castle',           desc: '世界の王朝と出来事' },
  'daigaku-nengo-nihon': { icon: 'hourglass',        desc: 'できごとと年号' },
  'daigaku-nengo-sekai': { icon: 'calendar-days',    desc: 'できごとと年号' },
  'daigaku-seibutsu':    { icon: 'dna',              desc: '用語と仕組み' },
  'daigaku-kagaku':      { icon: 'atom',             desc: '用語と物質' },
  'daigaku-chiri':       { icon: 'earth',            desc: '地形・気候・産業' },
  'daigaku-kokyo':       { icon: 'scale',            desc: '政治・経済のことば' },
  'daigaku-kanbun':      { icon: 'book-open-text',   desc: '句法と重要語' },
  'daigaku-gendai':      { icon: 'library',          desc: '評論・小説の語彙' },
  'english-buzzer-ja':   { icon: 'languages',        desc: '意味を見て英語で打つ' },
  'english-buzzer':      { icon: 'spell-check-2',    desc: '英語の説明から単語を当てる' },
  'idioms-ja':           { icon: 'puzzle',           desc: '意味を見て熟語を打つ' },
  'idioms':              { icon: 'whole-word',       desc: '英語の説明から熟語を当てる' },
  'phrases':             { icon: 'message-circle-more', desc: 'そのまま使える会話表現' },
  'map-world-country':   { icon: 'map',              desc: '色のついた国の名前は？' },
  'map-japan-pref':      { icon: 'map-pinned',       desc: '47 都道府県' },
  'map-world-nature':    { icon: 'mountain-snow',    desc: '地図の印から地名を' },
  'flag-country':        { icon: 'flag',             desc: '197 か国の国旗' },
  'capital':             { icon: 'landmark',         desc: '世界の首都' },
  'heritage':            { icon: 'castle',           desc: '地図と写真から' },
  'element':             { icon: 'test-tube',        desc: 'Fe → てつ' },
  'constellation':       { icon: 'telescope',        desc: '星のならびから' },
  'zk-fish':             { icon: 'fish',             desc: '写真を見て名前を打つ' },
  'zk-flower':           { icon: 'flower-2',         desc: '写真を見て名前を打つ' },
  'zk-insect':           { icon: 'bug',              desc: '写真を見て名前を打つ' },
  'zk-bird':             { icon: 'bird',             desc: '写真を見て名前を打つ' },
  'zk-deepsea':          { icon: 'fish',             desc: '暗い海の底のふしぎな魚' },
  'castle':              { icon: 'castle',           desc: '写真から城の名前' },
};

// kbn → 問題集の情報 { kbn, label, levels, icon, desc, soon }
const SET_INFO = {};
SET_INFO['1'] = { kbn: '1', label: '基本・応用', levels: false };
CAVES.concat(OWN_SETS).forEach(c => { SET_INFO[c.id] = { kbn: c.id, label: c.label, levels: true }; });
UPCOMING.forEach(c => { SET_INFO[c.id] = { kbn: c.id, label: c.label, levels: true, soon: true }; });
Object.values(SET_INFO).forEach(c => Object.assign(c, LOOK[c.kbn] || { icon: 'book-open', desc: '' }));
export const setInfo = kbn => SET_INFO[kbn];

// ---------------------------------------------------------------
// メニュー（トップの大分類 → 中分類 → 問題集）。
// 大分類・中分類・問題集は、ここに 1 行足せば画面（トップのタイル・分類ページ・ランキング）に出る。
// 同じ問題集を何か所に書いてもよい（問題は 1 つ、置き場所だけ増える）。
// color はテーマ色（portal.js の CSS に同じ名前の色がある）
export const MENU = [
  { key: 'koko', title: '高校受験', en: 'HIGH SCHOOL', icon: 'school', color: 'green',
    lead: '中学の 5 教科をタイピングで総復習',
    groups: [
      { label: '英語', sets: ['koko-eigo'] },
      { label: '国語', sets: ['koko-kokugo'] },
      { label: '社会', sets: ['jh-social', 'map-japan-pref', 'map-world-country'] },
      { label: '理科', sets: ['jh-science', 'element'] },
    ] },
  { key: 'daigaku', title: '大学受験', en: 'UNIVERSITY', icon: 'graduation-cap', color: 'navy',
    lead: '共通テスト〜二次の暗記科目',
    groups: [
      { label: '英語', sets: ['english-buzzer-ja', 'english-buzzer', 'idioms-ja', 'idioms'] },
      { label: '国語', sets: ['daigaku-kanbun', 'daigaku-gendai'] },
      { label: '歴史', sets: ['jhistory', 'whistory', 'daigaku-nengo-nihon', 'daigaku-nengo-sekai'] },
      { label: '地理・公民', sets: ['daigaku-chiri', 'daigaku-kokyo', 'map-world-country', 'heritage'] },
      { label: '理科', sets: ['daigaku-seibutsu', 'daigaku-kagaku', 'element'] },
    ] },
  { key: 'eikaiwa', title: '英会話', en: 'ENGLISH', icon: 'messages-square', color: 'orange',
    lead: '話せる英語を指で覚える',
    groups: [
      { label: 'フレーズ', sets: ['phrases'] },
      { label: '単語・熟語', sets: ['english-buzzer-ja', 'idioms-ja', 'idioms'] },
    ] },
  { key: 'shikaku', title: '資格', en: 'LICENSE', icon: 'award', color: 'purple',
    lead: 'IT パスポート・基本情報ほか',
    groups: [
      { label: 'IT', sets: ['1', 'itpass', 'fe', 'genai'] },
    ] },
  { key: 'zatsugaku', title: '雑学', en: 'TRIVIA', icon: 'lightbulb', color: 'sky',
    lead: '写真と地図で、知ってるを増やす',
    groups: [
      { label: '地図', sets: ['map-world-country', 'map-japan-pref', 'map-world-nature'] },
      { label: '国旗・世界', sets: ['flag-country', 'capital', 'heritage'] },
      { label: '生きもの', sets: ['zk-fish', 'zk-deepsea', 'zk-flower', 'zk-insect', 'zk-bird'] },
      { label: '科学・日本', sets: ['element', 'constellation', 'castle'] },
    ] },
];

// トップの下段に横長で出す入口。juken: true は大学受験モードを許された人だけが開ける
export const FEATURED = [
  { key: 'juken',  title: '市高', sub: '英単語・古文・歴史', icon: 'crown', color: 'gold', href: '?p=juken', juken: true },
  { key: 'shinra', title: '森羅万象', sub: '全部の問題集からまぜて出題', icon: 'orbit', color: 'cosmic', href: '?p=shinra' },
];

// 以前の ?p= の名前 → 今の大分類（ブックマークや招待リンクがそのまま使えるように）
export const OLD_KEYS = { it: 'shikaku', ichimon: 'daigaku', english: 'eikaiwa' };

// タイピング画面（index.html）に渡す、大分類ごとの問題集の並び（重複は 1 つに・準備中は除く）
export const STUDY_SETS = Object.fromEntries(MENU.map(m => {
  const kbns = [...new Set(m.groups.flatMap(g => g.sets))];
  return [m.key, {
    title: m.title,
    back: { href: '?p=' + m.key, label: m.title },
    cats: kbns.map(k => SET_INFO[k]).filter(c => c && !c.soon).map(c => ({ kbn: c.kbn, label: c.label, levels: c.levels })),
  }];
}));

// 森羅万象：レベルのある問題集すべてから、まぜて出す（kbn は 'shinra'。問題の行は持たない）
export const SHINRA = 'shinra';
export const SHINRA_KBNS = [...new Set(Object.values(STUDY_SETS).flatMap(s => s.cats).filter(c => c.levels).map(c => c.kbn))];
STUDY_SETS.shinra = {
  title: '森羅万象',
  back: { href: '', label: 'トップ' },
  cats: [{ kbn: SHINRA, label: '森羅万象（全部の問題集から）', levels: true }],
};

// 問題を引くときの kbn の条件。森羅万象は全部の問題集
export function kbnWhere(kbn) {
  if (kbn === SHINRA) return { sql: 'kbn IN (' + SHINRA_KBNS.map(() => '?').join(',') + ')', args: SHINRA_KBNS };
  return { sql: 'kbn = ?', args: [String(kbn)] };
}

// 問題をランダムに引く。where は「kbn = ? AND level = ? …」のような条件、args はその値。
// ORDER BY random() は条件に合う行を全部読むので、問題ごとの乱数 rnd（索引 (kbn, level, rnd)）の
// でたらめな位置から続けて limit 件だけ読み、足りなければ頭から足す（読む行は limit 件ほどで済む）。
// 森羅万象は問題集の大きさに引っぱられないよう、問題集ごとに同じくらいずつ引いてから混ぜる
export async function pickRandom(db, kbn, cols, where, args, limit) {
  if (kbn === SHINRA) {
    const per = Math.max(1, Math.ceil(limit / SHINRA_KBNS.length));
    const { results } = await db.prepare(
      `SELECT ${cols} FROM (SELECT ${cols}, ROW_NUMBER() OVER (PARTITION BY kbn ORDER BY random()) AS rn
         FROM problems WHERE ${where}) WHERE rn <= ${per} ORDER BY random() LIMIT ?`
    ).bind(...args, limit).all();
    return results;
  }
  const r = Math.random();
  const q = op => `SELECT ${cols} FROM problems WHERE ${where} AND rnd ${op} ? ORDER BY rnd LIMIT ?`;
  let { results } = await db.prepare(q('>=')).bind(...args, r, limit).all();
  if (results.length < limit) {
    const more = await db.prepare(q('<')).bind(...args, r, limit - results.length).all();
    results = results.concat(more.results);
  }
  for (let i = results.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [results[i], results[j]] = [results[j], results[i]]; }
  return results;
}

// 問題集にあるレベル（problem_stats から。まだ無ければ problems から）。freeOnly なら無料の問題があるレベルだけ
export async function levelsOf(db, kbn, freeOnly) {
  const w = kbnWhere(kbn);
  try {
    const { results } = await db.prepare(`SELECT DISTINCT level FROM problem_stats WHERE ${w.sql} AND level > 0${freeOnly ? ' AND free_n > 0' : ''} ORDER BY level`).bind(...w.args).all();
    if (results.length) return results.map(r => r.level);
  } catch (e) { /* problem_stats がまだ無い */ }
  const { results } = await db.prepare(`SELECT DISTINCT level FROM problems WHERE ${w.sql} AND level > 0${freeOnly ? ' AND free = 1' : ''} ORDER BY level`).bind(...w.args).all();
  return results.map(r => r.level);
}

// ---------------------------------------------------------------
// 有料と無料、範囲（出題範囲のチェックボックス）
//
// 有料の大分類（大学受験・英会話・資格）にある問題集は、範囲の先頭から 3 割だけ無料。
// ただし無料の大分類（高校受験・雑学）にも並んでいる問題集（元素・世界地図など）は全部無料。
// 範囲は問題の category（勉強ダンジョンズ・data/sets の問題に書いてある）で、
// 基本・応用（スプレッドシートの問題）は data/scopes/1.json。英単語はレベルで 5 つに分ける。
// どの問題が無料かは import-caves.mjs が problems.free に書き、範囲の一覧は problem_scopes に置く
// （ここを変えたら import-caves.mjs --scopes で書き直す）。
export const PAID_CATS = ['daigaku', 'eikaiwa', 'shikaku'];
export const FREE_RATIO = 0.3;
const FREE_KBNS = new Set(MENU.filter(m => !PAID_CATS.includes(m.key)).flatMap(m => m.groups.flatMap(g => g.sets)));
const PAID_KBNS = new Set(MENU.filter(m => PAID_CATS.includes(m.key)).flatMap(m => m.groups.flatMap(g => g.sets)).filter(k => !FREE_KBNS.has(k)));
export const isPaidSet = kbn => PAID_KBNS.has(String(kbn));
// 範囲が n 個あるとき、無料で選べる数（先頭から）
export const freeScopeCount = n => Math.max(1, Math.round(n * FREE_RATIO));

// 範囲の並び。書いていない問題集は、問題の並び（出てきた順）のまま
export const SCOPE_ORDER = {
  itpass:    ['企業活動・法務', '経営戦略', 'システム戦略', '開発・プロジェクト管理', 'サービス管理・監査', 'コンピュータ・ソフトウェア', 'ネットワーク・データベース', 'セキュリティ'],
  fe:        ['基礎理論・アルゴリズム', 'コンピュータシステム', 'データベース', 'ネットワーク', 'セキュリティ', '開発技術', 'マネジメント', 'ストラテジ'],
  genai:     ['AIの基礎', '生成AIの仕組み', '使いこなし', 'リスクと対策', '法律と倫理'],
  phrases:   ['あいさつ・雑談', 'お願い・申し出', 'お礼・おわび・返事', '気持ち・意見', '旅行・買い物・食事'],
  idioms:    ['句動詞', '前置詞の組み合わせ', '決まった言い回し', '会話の慣用句'],
  jhistory:  ['原始・古代', '中世', '近世', '近現代'],
  whistory:  ['古代・中世ヨーロッパ', 'アジア・イスラーム世界', '近世・近代の欧米', '20世紀以降'],
  'jh-social':  ['地理', '歴史（古代〜中世）', '歴史（近世〜現代）', '公民'],
  'jh-science': ['物理', '化学', '生物', '地学'],
  '1':       ['ストラテジ', 'マネジメント', 'テクノロジ'],
};
// 英単語は品詞だと偏るので、レベルで分ける [名前, いちばん下のレベル, いちばん上のレベル]
export const LEVEL_BANDS = {
  'english-buzzer': [['入門', 1, 2], ['基礎', 3, 4], ['標準', 5, 6], ['発展', 7, 8], ['難関', 9, 10]],
};
// 範囲に分けない問題集（分けると細かすぎる）
export const NO_SCOPE = new Set(['heritage']);

// 問題集の範囲の一覧 [{ scope, free, n, levels: [レベル] }]（並び順）。無ければ []。1 時間覚えておく
const SCOPES_ = new Map();
export async function scopesOf(db, kbn) {
  kbn = String(kbn);
  if (kbn === SHINRA) return [];
  const c = SCOPES_.get(kbn);
  if (c && c.until > Date.now()) return c.list;
  let rows = [];
  try {
    rows = (await db.prepare('SELECT scope, ord, free, level, n FROM problem_scopes WHERE kbn = ? ORDER BY ord, level').bind(kbn).all()).results;
  } catch (e) { /* problem_scopes がまだ無い */ }
  const list = [];
  for (const r of rows) {
    let s = list[list.length - 1];
    if (!s || s.scope !== r.scope) list.push(s = { scope: r.scope, free: !!r.free, n: 0, levels: [] });
    s.n += r.n;
    if (r.level > 0) s.levels.push(r.level);
  }
  SCOPES_.set(kbn, { list, until: Date.now() + 3600 * 1000 });
  return list;
}

// 画面から来た範囲の指定を、この人が選べるものだけにする。
// 返すのは { scopes: [範囲], where, args, all, free }。scopes が空なら範囲で絞らない（範囲の無い問題集・全部えらんだ）
//   all  … 全部の範囲（ランキングに載る）   free … 無料の範囲ちょうど（有料の問題集で、無料版のランキングに載る）
export async function scopePick(db, kbn, wanted, member) {
  const list = await scopesOf(db, kbn);
  // 森羅万象は全部の問題集からまぜるので、会員でなければ無料の問題だけ
  const freeOnly = !member && (isPaidSet(kbn) || String(kbn) === SHINRA);
  const base = { where: freeOnly ? ' AND free = 1' : '', args: [], freeOnly };
  if (!list.length) return Object.assign(base, { scopes: [], all: !freeOnly, free: freeOnly, levels: null });
  const usable = list.filter(s => !freeOnly || s.free);
  const want = new Set(Array.isArray(wanted) ? wanted.map(String) : []);
  let pick = usable.filter(s => want.has(s.scope));
  if (!pick.length) pick = usable;
  const all = pick.length === list.length;
  const free = freeOnly && pick.length === usable.length;
  const levels = [...new Set(pick.flatMap(s => s.levels))].sort((a, b) => a - b);
  if (all || free) return Object.assign(base, { scopes: pick.map(s => s.scope), all, free, levels });
  return {
    scopes: pick.map(s => s.scope), all, free, levels, freeOnly,
    where: base.where + ` AND scope IN (${pick.map(() => '?').join(',')})`,
    args: pick.map(s => s.scope)
  };
}

// kbn → 問題集。サーバー側でレベルの扱いを決めるのに使う
export const CAT_BY_KBN = Object.fromEntries(
  Object.values(STUDY_SETS).flatMap(s => s.cats).map(c => [c.kbn, c]));
// 同じ問題集が複数の大分類にあっても、ランキングなどでは 1 つとして扱う

// 森羅万象では、どの問題集の問題かを問題文の頭に付ける
export function withSetLabel(kbn, rowKbn, que) {
  if (kbn !== SHINRA) return que;
  const c = CAT_BY_KBN[rowKbn];
  return (c ? '【' + c.label + '】' : '') + que;
}
