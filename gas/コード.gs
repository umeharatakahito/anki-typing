// ===============================================================
// Code.gs
// ===============================================================

// スプレッドシート ID とシート名
const SPREADSHEET_ID = '1jbXd5x7FQZN-XxnUzpxGt3vie-XasfD_Bk8PvDqWdj0';
const SHEET_NAME_QUESTIONS = 'problems';

// ---------------------------------------------------------------
// Web エントリ
// URL末尾のパス（例: .../exec/practice）でモードを自動開始する
const AUTO_MODE_BY_PATH = {
  'practice': '練習モード',
  'normal':   '通常モード',
  'hard':     '極みモード',
  'kiwami':   '極みモード',
};
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');
  const pathInfo = (e && e.pathInfo) ? String(e.pathInfo).toLowerCase() : '';
  template.autoMode = AUTO_MODE_BY_PATH[pathInfo] || '';
  return template.evaluate()
    .setTitle('暗記タイピング')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------
// 問題取得
function getQuestions(category) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME_QUESTIONS);
    if (!sheet) throw new Error('問題シートが見つかりません。');
    const data = sheet.getDataRange().getValues();
    const headers = data.shift().map(h => String(h).trim());

    const idx = {
      que: headers.indexOf('que'),
      kan: headers.indexOf('kan'),
      ans: headers.indexOf('ans'),
      kbn: headers.indexOf('kbn'),
      img: headers.indexOf('img'),
    };
    if (idx.kbn < 0) throw new Error('ヘッダーに「kbn」が見つかりません。');

    // kbn 一致
    const filtered = data.filter(r => String(r[idx.kbn]) === String(category));

    // シャッフル
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }

    // 最大 100 問
    const limited = filtered.slice(0, 100);

    // 返却オブジェクト（画像IDは Drive サムネURLに）
    return limited.map(row => {
      const imageId = (idx.img >= 0 && row[idx.img]) ? String(row[idx.img]) : '';
      const imageUrl = imageId ? ('https://drive.google.com/thumbnail?id=' + imageId) : '';
      return {
        que: (idx.que >= 0 ? row[idx.que] : '') || '',
        kan: (idx.kan >= 0 ? row[idx.kan] : '') || '',
        ans: (idx.ans >= 0 ? row[idx.ans] : '') || '',
        img: imageUrl,
      };
    });

  } catch (e) {
    return { error: e.message };
  }
}
// ====== 設定 ======
const SCORE_SHEET_NAME = 'Scores';
const SCORE_HEADER = [
  'timestamp','username','score','mode','kubun',
  'chain','great','good','okay','miss','misstype','time'
];

// ====== シート取得（ヘッダーも保証）======
function getScoreSheet_() {
  let ss;
  if (SPREADSHEET_ID && SPREADSHEET_ID !== '') {
    ss = /^https?:\/\//.test(SPREADSHEET_ID)
      ? SpreadsheetApp.openByUrl(SPREADSHEET_ID)
      : SpreadsheetApp.openById(SPREADSHEET_ID);
  } else {
    ss = SpreadsheetApp.getActive();
  }
  const sh = ss.getSheetByName(SCORE_SHEET_NAME) || ss.insertSheet(SCORE_SHEET_NAME);

  // ヘッダー行を固定
  const range = sh.getRange(1, 1, 1, SCORE_HEADER.length);
  const cur = range.getValues()[0];
  const same = SCORE_HEADER.every((h, i) => cur[i] === h);
  if (!same) range.setValues([SCORE_HEADER]);

  return sh;
}

// ====== スコア保存 ======
function saveScore(payload) {
  const sh = getScoreSheet_();
  const row = [
    new Date(),
    payload.username,
    payload.score,
    payload.gameMode,     // ← フロントのキーに合わせる
    payload.kubun,
    payload.chain,
    payload.great,
    payload.good,
    payload.okay,
    payload.miss,
    payload.misstype,
    payload.time || 0
  ];
  sh.appendRow(row);
  return { ok: true };
}

// ====== ランキング取得（必ず配列を返す）======
function getRanking(mode, kubun, limit) {
  try {
    limit = limit || 50;

    const sh = getScoreSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return [];

    const lastCol = sh.getLastColumn();
    const header  = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    const idx = {};
    header.forEach((h, i) => idx[h] = i);

    const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const tz = Session.getScriptTimeZone();

    let rows = values.map(r => ({
      timestamp: r[idx['timestamp']],
      username:  r[idx['username']],
      score:     Number(r[idx['score']]) || 0,
      mode:      r[idx['mode']],
      kubun:     String(r[idx['kubun']] ?? ''),
      chain:     Number(r[idx['chain']] ?? 0),
      great:     Number(r[idx['great']] ?? 0),
      good:      Number(r[idx['good']] ?? 0),
      okay:      Number(r[idx['okay']] ?? 0),
      miss:      Number(r[idx['miss']] ?? 0),
      misstype:  Number(r[idx['misstype']] ?? 0),
      time:      Number(r[idx['time']] ?? 0),
      dateStr:   Utilities.formatDate(new Date(r[idx['timestamp']]), tz, 'yyyy/MM/dd HH:mm')
    }));

    if (mode  && mode  !== 'all') rows = rows.filter(x => String(x.mode)  === String(mode));
    if (kubun && kubun !== 'all') rows = rows.filter(x => String(x.kubun) === String(kubun));

    rows.sort((a, b) => b.score - a.score);
    rows = rows.slice(0, limit).map((x, i) => ({ rank: i + 1, ...x }));

    // “純配列”に固定して返す（null返却を防ぐ）
    return JSON.parse(JSON.stringify(rows));
  } catch (e) {
    // 失敗しても配列で返す（フロントのテーブルにエラー内容を表示させる）
    return JSON.parse(JSON.stringify([{
      rank: 0, username: 'ERROR', score: 0, mode: '', kubun: '',
      chain: 0, great: 0, good: 0, okay: 0, miss: 0, misstype: 0, time: 0,
      dateStr: String(e)
    }]));
  }
}

