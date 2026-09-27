// data/kihon-fixes.json（「基本・応用」= kbn '1' の直し）を、id ごとの UPDATE 文にする。
//   node scripts/kihon-fixes.mjs > kihon.sql && npx wrangler d1 execute anki-typing --remote --file kihon.sql
// 主キー（id）で引くので、読み取りは 1 行ずつで済む
import { readFileSync } from 'node:fs';
const fixes = JSON.parse(readFileSync(new URL('../data/kihon-fixes.json', import.meta.url), 'utf8'));
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
for (const [id, f] of Object.entries(fixes)) {
  const set = ['que', 'kan', 'ans'].filter(k => f[k] != null).map(k => `${k} = ${q(f[k])}`);
  if (set.length) console.log(`UPDATE problems SET ${set.join(', ')} WHERE id = ${Number(id)} AND kbn = '1';`);
}
