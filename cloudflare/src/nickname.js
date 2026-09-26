// ===============================================================
// nickname.js
// ランキングに出るニックネームの確認。卑猥な言葉・悪口・連絡先らしきものは受け付けない。
// 読みの揺れ（カタカナ／ひらがな、全角／半角、大文字／小文字、記号や空白を挟む）は
// そろえてから探すので、「ち ん こ」「ﾁﾝｺ」「C.H.I.N.K.O」なども引っかかる。
// ===============================================================

export const NICK_MAX = 12;

// そろえた後の形（ひらがな・英小文字）で書く。
// NG_ANYWHERE はどこに含まれていても断る。NG_ALONE は普通の名前の一部にもなる短い語なので
// （かすみ・hero・skill など）、その語だけ、または空白や記号で区切られた 1 語のときだけ断る
const NG_ANYWHERE = [
  'ちんこ', 'ちんぽ', 'ちんちん', 'まんこ', 'ぺにす', 'ぼっき', 'おっぱい', 'ちくび',
  'せっくす', 'ふぇら', 'くんに', 'なかだし', 'しゃせい', 'おなに', 'れいぷ', 'ごうかん',
  'いんもう', 'きんたま', 'やりまん', 'やりちん', 'びっち', 'きちがい', 'がいじ',
  'fuck', 'porn', 'penis', 'pussy', 'boob', 'chinko', 'chinpo', 'manko', 'hentai',
  'bitch', 'slut', 'whore', 'nigger', 'nigga', 'retard',
];
const NG_ALONE = [
  'えろ', 'えっち', 'ぱいぱい', 'せいき', 'ぱんつ', 'うんこ', 'うんち', 'ばいた',
  'しね', 'ころす', 'ころせ', 'きえろ', 'かす', 'くず', 'ごみ', 'ぶす', 'でぶ', 'はげ', 'きもい', 'うざい',
  'ばか', 'あほ', 'まぬけ', 'めくら', 'つんぼ', 'かたわ',
  'sex', 'dick', 'cock', 'tits', 'anal', 'cum', 'nude', 'ero', 'rape',
  'shit', 'kill', 'die', 'stupid', 'idiot', 'fag',
  'baka', 'aho', 'kasu', 'kuzu', 'busu', 'debu', 'hage', 'kimoi', 'uzai', 'unko', 'unchi', 'ecchi', 'etti', 'shineyo', 'korosu',
];

// 漢字で書かれることの多いもの（そろえる前の文字で探す）
const NG_KANJI = ['死ね', '殺す', '殺せ', '強姦', '射精', '勃起', '陰毛', '性器', '障害者', '池沼', '基地外', '糞', '屑', '売女', '淫'];

function normalize(s) {
  return String(s)
    .normalize('NFKC')                     // 全角英数・半角カナをそろえる
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))  // カタカナ → ひらがな
    .replace(/[^\p{L}\p{N}]/gu, '');       // 記号・空白を取る
}

// 問題が無ければ整えたニックネームを、あれば { error } を返す
export function checkNickname(raw) {
  const nick = String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!nick) return { error: 'ニックネームを入れてください' };
  if ([...nick].length > NICK_MAX) return { error: `ニックネームは${NICK_MAX}文字までです` };
  if (/[<>&"'`\\]/.test(nick)) return { error: '使えない記号が入っています' };
  if (/https?:|www\.|@|\.(com|net|jp|org)\b|\d{3,}[-‐]?\d{3,}/i.test(nick)) {
    return { error: 'URL・メールアドレス・電話番号のようなものは使えません' };
  }
  const flat = normalize(nick);
  if (!flat) return { error: '文字か数字を入れてください' };
  const words = nick.split(/[^\p{L}\p{N}]+/u).map(normalize).filter(Boolean);
  if (NG_ANYWHERE.some(w => flat.includes(w)) ||
      NG_ALONE.some(w => flat === w || words.includes(w)) ||
      NG_KANJI.some(w => nick.includes(w))) {
    return { error: 'そのニックネームは使えません。別の名前にしてください' };
  }
  return { nickname: nick };
}
