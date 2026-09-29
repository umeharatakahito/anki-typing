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

## これから

- 有料の範囲（アプリ内課金）、ログインしてランキング・戦績を Web と共有
- 対戦（近くの部屋も）、通知
