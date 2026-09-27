# 雑学の問題集

| ファイル | 中身 |
| --- | --- |
| `countries.txt` | 国（197）：国名・読み・別の答え・首都・地域・レベル |
| `prefectures.txt` | 都道府県（47）：読み・県庁所在地・地方・レベル |
| `elements.txt` | 元素（118）：記号・名前・読み |
| `japan.geojson` | 都道府県の形（Natural Earth 10m admin-1 から日本だけ抜き出したもの。パブリックドメイン） |

## 作り直す・入れる

```sh
cd cloudflare
node scripts/make-zatsugaku.mjs      # data/sets/*.json と public/fig/zk/*.svg を作る
node scripts/import-caves.mjs - --only=flag-country,map-world-country,capital,map-japan-pref,element > zatsugaku.local.sql
npx wrangler d1 execute anki-typing --local  --file zatsugaku.local.sql   # 手元
npx wrangler d1 execute anki-typing --remote --file zatsugaku.local.sql   # 本番
```

## 素材
- 世界地図：Natural Earth（パブリックドメイン）を world-atlas（ISC）経由で
- 国旗：flag-icons（MIT License）。白い国旗が背景に溶けないよう薄い枠を足している
- 元素の札：ここで描いたもの
