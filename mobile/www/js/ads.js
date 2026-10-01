// ===============================================================
// ads.js
// AdMob のバナー広告（@capacitor-community/admob）。トップ・問題集の一覧・プレイ設定・結果の画面の下にだけ出し、
// 遊んでいる最中と対戦中は出さない。ブラウザ（パソコンで試すとき）では何もしない。
//
//   ・トラッキング（興味に合わせた広告）は使わない（npa）。なので「トラッキングを許可」の確認も出さない
//   ・live が false の間は Google のテスト広告。自分の本物の広告を押すと AdMob が止まることがあるので、
//     App Store に出す版を作るときだけ true にする（mobile/README.md）
//   ・本物の ID は AdMob の「STUDY TYPE」アプリ（アプリ ID は ios/App/App/Info.plist の GADApplicationIdentifier）
// ===============================================================

export const AD_CONFIG = {
  live: true,
  // 本物の ID（AdMob の STUDY TYPE）。live を true にするときは、Info.plist の GADApplicationIdentifier も
  // このアプリ ID に替える（テストに戻すときは ca-app-pub-3940256099942544~1458002511）
  appId: 'ca-app-pub-6787317133124761~2648671992',
  banner: {
    real: 'ca-app-pub-6787317133124761/1566865473',    // AdMob の「STUDY TYPE iOS Banner」。live が true のときだけ使う
    test: 'ca-app-pub-3940256099942544/2934735716',    // Google のテスト用バナー
  },
};

const plugin = () => window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;

let ready = null, created = false, shown = false, want = false, height = 0;

// バナーの高さのぶん、画面の下を空ける（広告が画面の中身に重ならないように）
function setSpace(h) {
  height = h;
  document.documentElement.style.setProperty('--ad-h', (shown ? h : 0) + 'px');
}

function init() {
  const ad = plugin();
  if (!ad) return Promise.resolve(false);
  if (!ready) {
    ready = ad.initialize({ initializeForTesting: !AD_CONFIG.live })
      .then(() => {
        ad.addListener('bannerAdSizeChanged', info => setSpace(info && info.height || 0));
        return true;
      })
      .catch(() => false);
  }
  return ready;
}

// 広告を出す画面かどうかを知らせる（app.js が画面を変えるたびに呼ぶ）
export async function adsFor(screenWantsAd) {
  want = !!screenWantsAd;
  const ad = plugin();
  if (!ad || !(await init())) return;
  const unit = AD_CONFIG.live && AD_CONFIG.banner.real ? AD_CONFIG.banner.real : AD_CONFIG.banner.test;
  try {
    if (want && !created) {
      await ad.showBanner({ adId: unit, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0,
        isTesting: !AD_CONFIG.live, npa: true });
      created = true; shown = true;
    } else if (want && !shown) {
      await ad.resumeBanner();   // 隠していたのを出し直す
      shown = true;
    } else if (!want && shown) {
      await ad.hideBanner();
      shown = false;
    }
  } catch (e) { created = false; shown = false; }
  setSpace(height);
}
