// ===============================================================
// sets.js
// タイピング画面（HAMACHI-TYPE）で遊べる問題集の一覧。
// ?p=<ルート> ごとに、メインメニューへ並べる問題集（kbn）を決める。
// import-caves.mjs も CAVES を見て、勉強ダンジョンズのどの洞窟を入れるか決める。
// ===============================================================

// 勉強ダンジョンズの洞窟。levelScale は、レベルが 1〜5 しかない洞窟を 2,4,…,10 に広げるため
export const CAVES = [
  { id: 'itpass',         label: 'ITパスポート' },
  { id: 'genai',          label: '生成AI', levelScale: 2 },
  { id: 'fe',             label: '基本情報' },
  { id: 'jh-social',      label: '中学社会' },
  { id: 'jh-science',     label: '中学理科' },
  { id: 'jhistory',       label: '日本史' },
  { id: 'whistory',       label: '世界史' },
  { id: 'english-buzzer', label: '英単語' },
  { id: 'idioms',         label: '英熟語' },
  { id: 'phrases',        label: '会話フレーズ' },
];

const cave = id => {
  const c = CAVES.find(c => c.id === id);
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
    cats: [cave('jh-social'), cave('jh-science')],
  },
  ichimon: {
    title: '一問一答',
    back: { href: '?p=juken', label: '大学受験' },
    cats: [cave('jhistory'), cave('whistory')],
  },
  english: {
    title: '英語',
    back: { href: '', label: 'トップ' },
    cats: [cave('english-buzzer'), cave('idioms'), cave('phrases')],
  },
};

// kbn → 問題集。サーバー側でレベルの扱いを決めるのに使う
export const CAT_BY_KBN = Object.fromEntries(
  Object.values(STUDY_SETS).flatMap(s => s.cats).map(c => [c.kbn, c]));
