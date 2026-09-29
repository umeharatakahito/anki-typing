// アプリのアイコン（キーの形の S）と起動画面を作る。cloudflare の sharp を使う
//   node scripts/make-icons.mjs
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(here, '..', '..', 'cloudflare', 'package.json'))('sharp');
const assets = join(here, '..', 'ios', 'App', 'App', 'Assets.xcassets');

// アイコン：紺の地に、オレンジのカーソルが付いた S のキー（角は iOS が丸めるので四角で描く）
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2b53"/><stop offset="1" stop-color="#0b1330"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <circle cx="900" cy="120" r="360" fill="#ff6b35" opacity=".16"/>
  <rect x="172" y="212" width="680" height="680" rx="150" fill="#070d24"/>
  <rect x="172" y="162" width="680" height="660" rx="150" fill="#2b3d73"/>
  <rect x="244" y="224" width="536" height="500" rx="104" fill="#3a5096"/>
  <text x="480" y="628" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-weight="900" font-size="440" fill="#ffffff">S</text>
  <rect x="664" y="332" width="50" height="296" rx="18" fill="#ff6b35"/>
</svg>`;
await sharp(Buffer.from(icon)).flatten({ background: '#0b1330' }).png().toFile(join(assets, 'AppIcon.appiconset', 'AppIcon-512@2x.png'));

// 起動画面：紺一色の真ん中に小さく S のキー
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="#0f1a3d"/>
  <g transform="translate(1166 1166) scale(0.39)">${icon.replace(/^[\s\S]*?<rect width="1024" height="1024" fill="url\(#g\)"\/>/, '').replace(/<circle[^>]*\/>/, '').replace('</svg>', '')}</g></svg>`;
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await sharp(Buffer.from(splash)).png().toFile(join(assets, 'Splash.imageset', f));
}
console.log('アイコンと起動画面を作りました');
