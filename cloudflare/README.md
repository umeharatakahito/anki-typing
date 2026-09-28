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
トップは Study Type のメニュー。IT（暗記タイピング）は `/?p=it`、大学受験モードは `/?p=juken`（英単語 `?p=eigo`・古文 `?p=kobun`・歴史 `?p=rekishi`）。

## 暗記タイピングの問題（problems シート）を入れる

スプレッドシートの problems シートを「ファイル → ダウンロード → CSV」で書き出して:

```sh
node scripts/import-problems.mjs problems.csv > problems.local.sql
npx wrangler d1 execute anki-typing --remote --file problems.local.sql
```

入れ直すたびに problems テーブルは丸ごと置き換わる。
画像列（`img`）は Google ドライブのファイル ID。画像そのものは `public/img/<ID>.png` にコピーを置いて
Cloudflare から出す（ドライブが消えても表示できる）。問題を入れ直したら新しい画像も取ってきて公開し直す:

```sh
node scripts/fetch-images.mjs problems.csv   # まだ無い画像だけ取ってくる
npm run deploy
```

コピーが無い画像は、ドライブの画像を代わりに表示する。

## 会員プラン（Stripe）と出題範囲

有料の大分類（大学受験・英会話・資格）の問題集は、**範囲の先頭 3 割だけ無料**（高校受験・雑学と、そこにも並ぶ問題集は全部無料）。
会員（有料プラン・/admin で登録した人）は全部の範囲が選べて、広告が出ない。決まりは `src/sets.js`（PAID_CATS・SCOPE_ORDER など）、
支払いは `src/pay.js`。

範囲（problems.scope）と無料か（problems.free）は、決まりを変えたら書き直す（変えるのは 2 列だけ。問題は入れ直さない）:

```sh
node scripts/import-caves.mjs ~/program/StudyQuest-wt/R/data/caves --scopes > scopes.local.sql
npx wrangler d1 execute anki-typing --remote --file scopes.local.sql   # 約 1.2 万行の UPDATE（無料枠の 1 日 10 万行に収まる）
```

基本・応用（スプレッドシートの問題）の範囲は `data/scopes/1.json`（用語 → ストラテジ／マネジメント／テクノロジ）。

### Stripe をつなぐ

1. Stripe のアカウントを作り、テストモードで「開発者 → API キー」のシークレットキー（`sk_test_…`）を控える
2. 「開発者 → Webhook」でエンドポイント `https://studytype.umekobo.com/pay/webhook` を足し、送るイベントに
   `checkout.session.completed` `checkout.session.async_payment_succeeded` `invoice.paid` `customer.subscription.deleted` を選ぶ。
   署名シークレット（`whsec_…`）を控える
3. 「設定 → カスタマーポータル」を一度保存しておく（月額・年額の解約画面に使う）
4. 「設定 → 決済手段」で PayPay・コンビニ払いを有効にする（1年分で使える。月額の自動更新はカード類だけ）
5. 登録する:

```sh
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

特定商取引法に基づく表記（`/legal`）の販売事業者・連絡先は、環境変数 `SELLER_NAME` `SELLER_ADDRESS` `SELLER_TEL` `SELLER_EMAIL`（wrangler.jsonc の vars）に書く。
本番のキー（`sk_live_…`）に替えるときは、Webhook も本番モードで作り直して両方を入れ替える。

## 手元で動かす

```sh
npm run dev    # http://localhost:8787/
```

ローカルの D1 は `.wrangler/` に作られる（本番とは別）。

## 注意

- GAS 版と同じく、URL を知っていれば誰でも開けて記録も書き込める。
  自分だけに絞りたいときは Cloudflare Access（Zero Trust）でこの Worker を保護する。
- 記録（ランキング・苦手な語・設定・ゴースト）はスプレッドシートから引き継がず、空から始まる。
