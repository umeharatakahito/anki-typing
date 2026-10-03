// ===============================================================
// ota.js
// 問題の自動更新。アプリを作り直さなくても、サーバー（D1）で直した・足した問題が届く（サーバーは cloudflare/src/appdata.js）。
//
//   ・アプリを開いたとき、/app/manifest（問題集の一覧と、問題集ごとの版 v）を見る
//   ・版が変わった問題集だけ /app/data/<kbn>?v= をダウンロードして、IndexedDB に残す（次からはオフラインでもそれを使う）
//   ・一覧（menu）も残す。サーバーの一覧に無い問題集でも、アプリに入っているものは消さない（mergeMenu）
//   ・無料の問題（free = 1）だけ。有料の範囲は、これまでどおり会員だけが account.js の /app/set で受け取る
//   ・図は URL のまま残し、アプリに入っている図（data/images.json）なら、それを使う（app.js の fixImgs）
//   ・遊んでいる最中には入れ替えない（app.js は、ホームにいるときだけ画面を描き直す）
// ===============================================================

const SERVER = () => { try { return JSON.parse(localStorage.getItem('st.server')) || 'https://studytype.umekobo.com'; } catch (e) { return 'https://studytype.umekobo.com'; } };

// account.js と同じ IndexedDB（'studytype' の 'sets'）。キーは free:<kbn>（無料の問題）と ota:menu（一覧）
function idb() {
  return new Promise((ok, ng) => {
    const r = indexedDB.open('studytype', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sets');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
  });
}
async function get(key) {
  try {
    const db = await idb();
    return await new Promise(ok => { const r = db.transaction('sets').objectStore('sets').get(key); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
  } catch (e) { return null; }
}
async function put(key, val) {
  try {
    const db = await idb();
    await new Promise(ok => { const t = db.transaction('sets', 'readwrite'); t.objectStore('sets').put(val, key); t.oncomplete = () => ok(); t.onerror = () => ok(); });
  } catch (e) { /* 保存できない：アプリの中の問題のまま */ }
}

// サーバーから届いた無料の問題集（無ければ null）と一覧
export const otaSet = kbn => get('free:' + kbn).then(d => (d && d.q ? d : null));
export const otaMenu = () => get('ota:menu');

// アプリに入っている一覧（bundled）と、届いた一覧（remote）を合わせる。届いた方を優先し、届いた方に無い問題集は残す
export function mergeMenu(bundled, remote) {
  if (!remote || !remote.menu || !remote.sets) return bundled;
  const menu = remote.menu.map(m => ({ ...m, groups: m.groups.map(g => ({ ...g, sets: g.sets.slice() })) }));
  const has = new Set(menu.flatMap(m => m.groups.flatMap(g => g.sets)));
  for (const bm of bundled.menu) {
    let m = menu.find(x => x.key === bm.key);
    for (const bg of bm.groups) for (const k of bg.sets) {
      if (has.has(k) || !bundled.sets[k]) continue;
      if (!m) { m = { ...bm, groups: [] }; menu.push(m); }
      let g = m.groups.find(x => x.label === bg.label);
      if (!g) { g = { label: bg.label, sets: [] }; m.groups.push(g); }
      g.sets.push(k);
    }
    // 同じ問題集が 2 か所以上にあるもの（社会の地図など）は、そのまま 2 か所に
  }
  return { menu, sets: { ...bundled.sets, ...remote.sets } };
}

const timeout = (p, ms) => Promise.race([p, new Promise((_, ng) => setTimeout(() => ng(new Error('timeout')), ms))]);
let checking = null;
// 新しい問題があるか見て、あればダウンロードする。戻り値 { manifest, changed: [kbn] }（通信できなければ changed は空）
export function checkUpdates() {
  if (checking) return checking;
  checking = (async () => {
    let manifest;
    try { manifest = await timeout(fetch(SERVER() + '/app/manifest', { cache: 'no-store' }).then(r => r.ok ? r.json() : null), 10000); }
    catch (e) { return { manifest: null, changed: [] }; }
    if (!manifest || !manifest.sets) return { manifest: null, changed: [] };
    const changed = [];
    for (const [kbn, s] of Object.entries(manifest.sets)) {
      const have = await get('free:' + kbn);
      if (have && have.v === s.v) continue;
      try {
        const d = await timeout(fetch(SERVER() + '/app/data/' + encodeURIComponent(kbn) + '?v=' + s.v).then(r => r.ok ? r.json() : null), 20000);
        if (!d || !Array.isArray(d.q)) continue;
        await put('free:' + kbn, { scopes: d.scopes || [], q: d.q, v: d.v, got: Date.now() });   // at は会員の問題の印なので使わない（app.js の setup）
        changed.push(kbn);
      } catch (e) { /* 次に開いたときにもう一度 */ }
    }
    const old = await get('ota:menu');
    await put('ota:menu', { menu: manifest.menu, sets: manifest.sets, at: manifest.at || Date.now() });
    const menuChanged = !old || JSON.stringify(old.menu) !== JSON.stringify(manifest.menu) || JSON.stringify(old.sets) !== JSON.stringify(manifest.sets);
    return { manifest, changed, menuChanged };
  })().finally(() => { checking = null; });
  return checking;
}

// アプリに入っていない図を、先に読んでおく（電波のあるうちに。オフラインでも出やすくする）
export async function prefetchImages(urls) {
  const list = [...new Set(urls)].filter(u => /^https?:/.test(u));
  let i = 0;
  const worker = async () => { while (i < list.length) { const u = list[i++]; try { await fetch(u, { mode: 'no-cors' }); } catch (e) {} } };
  await Promise.all([worker(), worker(), worker()]);
}
