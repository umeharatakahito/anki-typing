# STUDY TYPE（スマホアプリ）

Capacitor で作った iPhone アプリ。画面は `www/`（HTML と JavaScript）、iPhone のプロジェクトは `ios/`。

- **自作フリックキーボード**（スマホ本体のキーボードは使わない）。かなは 12 キーのフリック、英語は英字キーボード
- **オフライン**：無料の問題（約 5,800 問）と図をアプリの中に入れてある。電波が無くても遊べる
- 遊び方は Web 版の「本番」と同じ（写経・基本・極 × 60・90・120 秒、正解で +秒・ミスで −秒）。自己ベストは端末に残す

## 作り方

```sh
cd mobile
npm install
npm run data            # cloudflare の手元の D1 から、問題と図を www/ に作る（先に cloudflare で問題を入れておく）
node scripts/make-icons.mjs   # アイコンと起動画面（変えたときだけ）
npx cap sync ios        # www/ を iPhone のプロジェクトへ写す
```

シミュレーターで動かす：

```sh
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator -derivedDataPath build/sim build
```

iPhone に入れる（Mac につないで、iPhone の「デベロッパモード」をオンにしておく）：

```sh
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -destination 'id=<iPhone の UDID>' -derivedDataPath build/dev -allowProvisioningUpdates build
xcrun devicectl device install app --device <UDID> build/dev/Build/Products/Debug-iphoneos/App.app
```

UDID は `xcrun devicectl list devices` で見る。署名のチームは P89RKRTMXS。

## iPad

- iPhone と iPad の両方に対応（`TARGETED_DEVICE_FAMILY = "1,2"`）。iPad は縦横どちらでも使える
- 広い画面（幅 700pt 以上）では、中身を真ん中に集める（`www/css/app.css` の最後）
- 外付けキーボード（Magic Keyboard など）：英字のまま打てばローマ字をかなに直して入る（`www/js/keyboard.js` の attachHardware）。
  打つと画面のキーボードがしまわれ（ヒント・パスだけ残る）、画面にさわると戻る。Tab でヒント
- App Store 用の 13 インチ iPad のスクリーンショットは `store-shots/ipad13/`（2064×2752）

## 広告（AdMob）

`www/js/ads.js`。トップ・一覧・設定・結果の画面の下にバナーを出し、遊んでいる最中と対戦中は出さない。
トラッキング（興味に合わせた広告）は使わない（npa）ので、「トラッキングを許可」の確認は出さない。

- いまは **Google のテスト広告**（`AD_CONFIG.live = false`、Info.plist の `GADApplicationIdentifier` もテスト用の ID）。
  自分の本物の広告を押すと AdMob のアカウントが止まることがあるので、開発中と TestFlight はテストのまま
- App Store に出す版を作るときだけ：`ads.js` の `live` を `true` にし、Info.plist の `GADApplicationIdentifier` を
  本物のアプリ ID `ca-app-pub-6787317133124761~2648671992` に替える（バナーのユニット ID
  `ca-app-pub-6787317133124761/1566865473` は `ads.js` に入っている）

## App Store / TestFlight

```sh
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath build/StudyType.xcarchive -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath build/StudyType.xcarchive -exportOptionsPlist ExportOptions-AppStore.plist -exportPath build/export -allowProvisioningUpdates
```

2 つ目で App Store Connect に上がる（Xcode の設定 → Accounts に開発者の Apple ID が入っていること）。
上げるたびにビルド番号（project の CURRENT_PROJECT_VERSION）を 1 つ上げる。

## これから

- 有料の範囲（アプリ内課金）、ログインしてランキング・戦績を Web と共有
- 対戦（近くの部屋も）、通知
