// ===============================================================
// JukenWords.gs
// 大学受験モード（英単語）のデータ
//
//   en   : 英単語（第1問の答え。英字でタイプさせる）
//   ja   : 日本語の意味（第1問の問題文として表示）
//   kana : 第2問の答え（ひらがな。ローマ字入力でタイプさせる）
//   ex   : 例文（第2問で対象語を空欄にして表示＋音声読み上げ）
//   exja : 例文の和訳（正解後に表示）
//
// 訳文・例文はすべて本アプリ用の書き下ろし。音声は端末側の
// 音声合成（Web Speech API）で生成するため音声ファイルは持たない。
// ===============================================================

const JUKEN_WORDS = [
  { en: 'abandon',      ja: '〜を捨てる／放棄する',       kana: 'ほうきする',       ex: 'They had to abandon the old plan.',        exja: '彼らはその古い計画を放棄せざるを得なかった。' },
  { en: 'abolish',      ja: '〜を廃止する',               kana: 'はいしする',       ex: 'The country abolished the law in 1990.',   exja: 'その国は1990年にその法律を廃止した。' },
  { en: 'absorb',       ja: '〜を吸収する',               kana: 'きゅうしゅうする', ex: 'Plants absorb water through their roots.', exja: '植物は根から水を吸収する。' },
  { en: 'abstract',     ja: '抽象的な',                   kana: 'ちゅうしょうてきな', ex: 'His explanation was too abstract for me.', exja: '彼の説明は私には抽象的すぎた。' },
  { en: 'accompany',    ja: '〜に同行する',               kana: 'どうこうする',     ex: 'She accompanied her father to the airport.', exja: '彼女は父に同行して空港へ行った。' },
  { en: 'accomplish',   ja: '〜を成し遂げる',             kana: 'なしとげる',       ex: 'We accomplished the task in three days.',  exja: '私たちはその仕事を3日で成し遂げた。' },
  { en: 'accurate',     ja: '正確な',                     kana: 'せいかくな',       ex: 'We need accurate data for the report.',    exja: 'その報告書には正確なデータが必要だ。' },
  { en: 'acquire',      ja: '〜を身につける／獲得する',   kana: 'かくとくする',     ex: 'He acquired a new skill last year.',       exja: '彼は昨年新しい技術を身につけた。' },
  { en: 'adapt',        ja: '適応する',                   kana: 'てきおうする',     ex: 'Children adapt to new schools quickly.',   exja: '子どもは新しい学校にすぐ適応する。' },
  { en: 'adequate',     ja: '十分な',                     kana: 'じゅうぶんな',     ex: 'The room was adequate for ten people.',    exja: 'その部屋は10人には十分な広さだった。' },

  { en: 'adopt',        ja: '〜を採用する',               kana: 'さいようする',     ex: 'The company adopted a new system.',        exja: 'その会社は新しい制度を採用した。' },
  { en: 'advocate',     ja: '〜を提唱する',               kana: 'ていしょうする',   ex: 'She advocates equal pay for all workers.', exja: '彼女は全労働者の平等な賃金を提唱している。' },
  { en: 'alter',        ja: '〜を変更する',               kana: 'へんこうする',     ex: 'We altered the design at the last minute.', exja: '私たちは土壇場で設計を変更した。' },
  { en: 'ambiguous',    ja: 'あいまいな',                 kana: 'あいまいな',       ex: 'His answer was deliberately ambiguous.',   exja: '彼の答えは意図的にあいまいだった。' },
  { en: 'anticipate',   ja: '〜を予期する',               kana: 'よきする',         ex: 'Nobody anticipated such a large crowd.',   exja: '誰もこれほどの人出を予期していなかった。' },
  { en: 'apparent',     ja: '明らかな',                   kana: 'あきらかな',       ex: 'It soon became apparent that he was lying.', exja: '彼が嘘をついているのはすぐに明らかになった。' },
  { en: 'appreciate',   ja: '〜に感謝する／高く評価する', kana: 'かんしゃする',     ex: 'I really appreciate your help.',           exja: 'あなたの助けに本当に感謝しています。' },
  { en: 'appropriate',  ja: '適切な',                     kana: 'てきせつな',       ex: 'That was not appropriate behavior.',       exja: 'それは適切な振る舞いではなかった。' },
  { en: 'arbitrary',    ja: '恣意的な',                   kana: 'しいてきな',       ex: 'The rule seemed completely arbitrary.',    exja: 'その規則は全く恣意的に思えた。' },
  { en: 'assert',       ja: '〜を断言する',               kana: 'だんげんする',     ex: 'He asserted that the report was false.',   exja: '彼はその報告は誤りだと断言した。' },

  { en: 'assess',       ja: '〜を評価する',               kana: 'ひょうかする',     ex: 'Teachers assess students twice a year.',   exja: '教師は年に2回生徒を評価する。' },
  { en: 'assume',       ja: '〜を想定する／当然だと思う', kana: 'そうていする',     ex: 'I assumed you were coming with us.',       exja: '私はあなたも来るものと思っていた。' },
  { en: 'authentic',    ja: '本物の',                     kana: 'ほんものの',       ex: 'This is an authentic Japanese recipe.',    exja: 'これは本物の日本料理のレシピだ。' },
  { en: 'barrier',      ja: '障壁',                       kana: 'しょうへき',       ex: 'Language can be a serious barrier.',       exja: '言葉は深刻な障壁になりうる。' },
  { en: 'bias',         ja: '偏見',                       kana: 'へんけん',         ex: 'The study showed a clear bias.',           exja: 'その研究には明らかな偏見が見られた。' },
  { en: 'cease',        ja: '〜をやめる',                 kana: 'やめる',           ex: 'The factory ceased production in May.',    exja: 'その工場は5月に生産をやめた。' },
  { en: 'circumstance', ja: '状況／事情',                 kana: 'じょうきょう',     ex: 'Under the circumstances, we had no choice.', exja: 'その状況では選択の余地がなかった。' },
  { en: 'cite',         ja: '〜を引用する',               kana: 'いんようする',     ex: 'He cited three studies in his essay.',     exja: '彼は小論文で3つの研究を引用した。' },
  { en: 'coherent',     ja: '首尾一貫した',               kana: 'いっかんした',     ex: 'She gave a clear and coherent answer.',    exja: '彼女は明確で首尾一貫した答えをした。' },
  { en: 'compensate',   ja: '〜を補償する',               kana: 'ほしょうする',     ex: 'The company compensated the victims.',     exja: 'その会社は被害者に補償した。' },

  { en: 'competent',    ja: '有能な',                     kana: 'ゆうのうな',       ex: 'He is a competent and reliable doctor.',   exja: '彼は有能で信頼できる医師だ。' },
  { en: 'comprehend',   ja: '〜を理解する',               kana: 'りかいする',       ex: 'I could not comprehend his reasoning.',    exja: '私は彼の論理を理解できなかった。' },
  { en: 'conceal',      ja: '〜を隠す',                   kana: 'かくす',           ex: 'She could not conceal her disappointment.', exja: '彼女は失望を隠せなかった。' },
  { en: 'condemn',      ja: '〜を非難する',               kana: 'ひなんする',       ex: 'Many leaders condemned the attack.',       exja: '多くの指導者がその攻撃を非難した。' },
  { en: 'consent',      ja: '同意する',                   kana: 'どういする',       ex: 'Her parents finally consented to the trip.', exja: '両親はついにその旅行に同意した。' },
  { en: 'consequence',  ja: '結果',                       kana: 'けっか',           ex: 'He had to face the consequences.',         exja: '彼はその結果に向き合わねばならなかった。' },
  { en: 'considerable', ja: 'かなりの',                   kana: 'かなりの',         ex: 'The project took a considerable amount of time.', exja: 'その計画にはかなりの時間がかかった。' },
  { en: 'constitute',   ja: '〜を構成する',               kana: 'こうせいする',     ex: 'Women constitute half of the workforce.',  exja: '女性が労働力の半分を構成している。' },
  { en: 'contemporary', ja: '現代の／同時代の',           kana: 'げんだいの',       ex: 'The museum displays contemporary art.',    exja: 'その美術館は現代美術を展示している。' },
  { en: 'contradict',   ja: '〜と矛盾する',               kana: 'むじゅんする',     ex: 'His story contradicts the evidence.',      exja: '彼の話は証拠と矛盾している。' },

  { en: 'convey',       ja: '〜を伝える',                 kana: 'つたえる',         ex: 'Words cannot convey how I feel.',          exja: '言葉では私の気持ちを伝えられない。' },
  { en: 'crucial',      ja: '極めて重要な',               kana: 'じゅうような',     ex: 'This is a crucial moment for the team.',   exja: 'これはチームにとって極めて重要な局面だ。' },
  { en: 'cultivate',    ja: '〜を育てる／耕す',           kana: 'そだてる',         ex: 'They cultivate rice in this region.',      exja: 'この地域では米を育てている。' },
  { en: 'deceive',      ja: '〜をだます',                 kana: 'だます',           ex: 'He deceived his friends for years.',       exja: '彼は何年も友人をだましていた。' },
  { en: 'dedicate',     ja: '〜を捧げる',                 kana: 'ささげる',         ex: 'She dedicated her life to medicine.',      exja: '彼女は生涯を医学に捧げた。' },
  { en: 'deliberate',   ja: '意図的な',                   kana: 'いとてきな',       ex: 'The delay was clearly deliberate.',        exja: 'その遅れは明らかに意図的だった。' },
  { en: 'demonstrate',  ja: '〜を示す／証明する',         kana: 'しめす',           ex: 'The results demonstrate a clear trend.',   exja: 'その結果は明確な傾向を示している。' },
  { en: 'deny',         ja: '〜を否定する',               kana: 'ひていする',       ex: 'He denied any involvement in the case.',   exja: '彼は事件への関与を否定した。' },
  { en: 'deprive',      ja: '〜から奪う',                 kana: 'うばう',           ex: 'The noise deprived me of sleep.',          exja: 'その騒音が私から睡眠を奪った。' },
  { en: 'derive',       ja: '〜に由来する',               kana: 'ゆらいする',       ex: 'This word derives from Latin.',            exja: 'この語はラテン語に由来する。' },

  { en: 'diminish',     ja: '減少する',                   kana: 'げんしょうする',   ex: 'Interest in the sport has diminished.',    exja: 'そのスポーツへの関心は減少した。' },
  { en: 'distinguish',  ja: '〜を区別する',               kana: 'くべつする',       ex: 'I cannot distinguish the two colors.',     exja: '私はその2色を区別できない。' },
  { en: 'diverse',      ja: '多様な',                     kana: 'たような',         ex: 'The city has a diverse population.',       exja: 'その都市は多様な住民を抱えている。' },
  { en: 'dominate',     ja: '〜を支配する',               kana: 'しはいする',       ex: 'One company dominates the market.',        exja: '1社がその市場を支配している。' },
  { en: 'eliminate',    ja: '〜を取り除く',               kana: 'とりのぞく',       ex: 'We must eliminate all errors.',            exja: '私たちはすべての誤りを取り除かねばならない。' },
  { en: 'emphasize',    ja: '〜を強調する',               kana: 'きょうちょうする', ex: 'She emphasized the need for change.',      exja: '彼女は変革の必要性を強調した。' },
  { en: 'enhance',      ja: '〜を高める',                 kana: 'たかめる',         ex: 'Exercise enhances your concentration.',    exja: '運動は集中力を高める。' },
  { en: 'ensure',       ja: '〜を確実にする',             kana: 'かくじつにする',   ex: 'Please ensure that the door is locked.',   exja: 'ドアが施錠されていることを確認してください。' },
  { en: 'evident',      ja: '明白な',                     kana: 'めいはくな',       ex: 'It was evident that she was tired.',       exja: '彼女が疲れているのは明白だった。' },
  { en: 'exaggerate',   ja: '〜を誇張する',               kana: 'こちょうする',     ex: 'He tends to exaggerate his success.',      exja: '彼は自分の成功を誇張しがちだ。' },
];

// ---------------------------------------------------------------
// 出題データ取得（シャッフルして limit 件返す）
function getJukenWords(limit) {
  const words = JUKEN_WORDS.slice();
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words.slice(0, limit || 20);
}
