-- 問題の書き換え（UPDATE ... WHERE src = ? AND qid = ?）で表全体を読まないようにする。
-- これが無いと 1 行直すたびに 1 万行ほど読み、無料枠の「1 日 500 万行の読み取り」をすぐ使い切る
CREATE INDEX problems_src_qid ON problems (src, qid);
