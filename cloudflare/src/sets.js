// ===============================================================
// sets.js
// タイピング画面（HAMACHI-TYPE）で遊べる問題集の一覧。
// ?p=<ルート> ごとに、メインメニューへ並べる問題集（kbn）を決める。
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
];

const cave = id => {
  const c = CAVES.find(c => c.id === id) || OWN_SETS.find(c => c.id === id);
  return { kbn: c.id, label: c.label, levels: true };
};

// levels: true の問題集は、レベル 1 から始めて正解を重ねると上がる
export const STUDY_SETS = {
  it: {
    title: 'IT',
    back: { href: '', label: 'トップ' },
    cats: [
      { kbn: '1', label: '基本・応用', levels: false },
      cave('itpass'), cave('genai'), cave('fe'),
    ],
  },
  koko: {
    title: '高校受験',
    back: { href: '', label: 'トップ' },
    cats: [cave('jh-social'), cave('jh-science'), cave('koko-kokugo'), cave('koko-eigo')],
  },
  ichimon: {
    title: '大学受験',
    back: { href: '', label: 'トップ' },
    cats: [
      cave('jhistory'), cave('whistory'), cave('daigaku-nengo-nihon'), cave('daigaku-nengo-sekai'),
      cave('daigaku-seibutsu'), cave('daigaku-kagaku'), cave('daigaku-chiri'), cave('daigaku-kokyo'),
      cave('daigaku-kanbun'), cave('daigaku-gendai'),
    ],
  },
  english: {
    title: '英語',
    back: { href: '', label: 'トップ' },
    cats: [cave('english-buzzer-ja'), cave('english-buzzer'), cave('idioms-ja'), cave('idioms'), cave('phrases')],
  },
};

// 森羅万象：レベルのある問題集すべてから、まぜて出す（kbn は 'shinra'。問題の行は持たない）
export const SHINRA = 'shinra';
export const SHINRA_KBNS = Object.values(STUDY_SETS).flatMap(s => s.cats).filter(c => c.levels).map(c => c.kbn);
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

// 問題をランダムに引く SQL（最後の ? が件数）。森羅万象は問題集の大きさに引っぱられないよう、
// 問題集ごとに同じくらいずつ引いてから混ぜる
export function randomPickSql(kbn, cols, where, limit) {
  if (kbn !== SHINRA) return `SELECT ${cols} FROM problems WHERE ${where} ORDER BY random() LIMIT ?`;
  const per = Math.max(1, Math.ceil(limit / SHINRA_KBNS.length));
  return `SELECT ${cols} FROM (SELECT ${cols}, ROW_NUMBER() OVER (PARTITION BY kbn ORDER BY random()) AS rn
            FROM problems WHERE ${where}) WHERE rn <= ${per} ORDER BY random() LIMIT ?`;
}

// kbn → 問題集。サーバー側でレベルの扱いを決めるのに使う
export const CAT_BY_KBN = Object.fromEntries(
  Object.values(STUDY_SETS).flatMap(s => s.cats).map(c => [c.kbn, c]));

// 森羅万象では、どの問題集の問題かを問題文の頭に付ける
export function withSetLabel(kbn, rowKbn, que) {
  if (kbn !== SHINRA) return que;
  const c = CAT_BY_KBN[rowKbn];
  return (c ? '【' + c.label + '】' : '') + que;
}
