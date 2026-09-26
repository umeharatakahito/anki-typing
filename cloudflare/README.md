# anki-typing（Cloudflare 版）

`../gas` の Google Apps Script 版を Cloudflare Workers で動かすもの。
画面の HTML / JS と単語データは GAS 版のファイルをビルド時にそのまま取り込むので、
GAS 側を直したら `npm run build` し直すだけで Cloudflare 版にも入る。

| GAS 版 | Cloudflare 版 |
| --- | --- |
| `doGet`（`?p=` で画面を出し分け） | `src/worker.js`（同じ `?p=`、`/juken` のようなパスも可） |
| `google.script.run.xxx()` | ページに差し込むシムが `POST /api/xxx` に置き換える |
| スプレッドシート（problems / Scores / JukenLog / JukenWeak / JukenPrefs / JukenGhost） | D1（`migrations/0001_init.sql`） |
| 対戦モードの CacheService + LockService | Durable Object `VersusHub`（`src/versus.js`）。`JukenVersus.gs` をそのまま動かす |

## はじめて公開するとき

```sh
cd cloudflare
npm install
npx wrangler login
npx wrangler d1 create anki-typing   # 表示された database_id を wrangler.jsonc に書く
npm run deploy                        # ビルド → D1 のテーブル作成 → 公開
```

公開先は `https://anki-typing.<アカウント>.workers.dev/`。
大学受験モードは `/?p=juken`（英単語 `?p=eigo`・古文 `?p=kobun`・歴史 `?p=rekishi`）。

## 暗記タイピングの問題（problems シート）を入れる

スプレッドシートの problems シートを「ファイル → ダウンロード → CSV」で書き出して:

```sh
node scripts/import-problems.mjs problems.csv > problems.local.sql
npx wrangler d1 execute anki-typing --remote --file problems.local.sql
```

入れ直すたびに problems テーブルは丸ごと置き換わる。
画像列（`img`）は GAS 版と同じく Google ドライブのファイル ID のまま使う。

## 手元で動かす

```sh
npm run dev    # http://localhost:8787/
```

ローカルの D1 は `.wrangler/` に作られる（本番とは別）。

## 注意

- GAS 版と同じく、URL を知っていれば誰でも開けて記録も書き込める。
  自分だけに絞りたいときは Cloudflare Access（Zero Trust）でこの Worker を保護する。
- 記録（ランキング・苦手な語・設定・ゴースト）はスプレッドシートから引き継がず、空から始まる。
