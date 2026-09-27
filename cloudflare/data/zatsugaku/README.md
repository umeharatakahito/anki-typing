# 雑学の問題集

| ファイル | 中身 |
| --- | --- |
| `countries.txt` | 国（197）：国名・読み・別の答え・首都・地域・レベル |
| `prefectures.txt` | 都道府県（47）：読み・県庁所在地・地方・レベル |
| `elements.txt` | 元素（118）：記号・名前・読み |
| `photos/*.txt` | 写真の雑学（魚 55・深海魚 21・花 49・昆虫 38・鳥 43・世界遺産 50）。列の説明は `photos/README.md` |
| `japan.geojson` | 都道府県の形（Natural Earth 10m admin-1 から日本だけ抜き出したもの。パブリックドメイン） |

## 作り直す・入れる

```sh
cd cloudflare
node scripts/fetch-photos.mjs         # 写真の雑学の写真を Commons から取る（まだ無いものだけ）
node scripts/make-zatsugaku.mjs      # data/sets/*.json と public/fig/zk/*.svg を作る
node scripts/import-caves.mjs - --only=flag-country,map-world-country,capital,map-japan-pref,element,zk-fish,zk-flower,zk-insect,zk-bird,heritage > zatsugaku.local.sql
npx wrangler d1 execute anki-typing --local  --file zatsugaku.local.sql   # 手元
npx wrangler d1 execute anki-typing --remote --file zatsugaku.local.sql   # 本番
```

## 素材
- 世界地図：Natural Earth（パブリックドメイン）を world-atlas（ISC）経由で
- 国旗：flag-icons（MIT License）。白い国旗が背景に溶けないよう薄い枠を足している
- 元素の札：ここで描いたもの
- 写真：Wikimedia Commons（記事の Wikidata の画像。作者とライセンスは `photos/*.credits.json` にあり、解説に出す）。
  写真が答えと合わないものは目で確かめて選び直した（一覧の最後の列）
- 世界遺産の写真の右下の地図：Natural Earth
