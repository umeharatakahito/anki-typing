// ===============================================================
// restore-plans.mjs
// 会員の表（plans）を Stripe の記録から作り直す。D1 が消えた・壊れたときの最後の手段。
//
//   STRIPE_SECRET_KEY=sk_live_… node scripts/restore-plans.mjs > restore-plans.local.sql
//   （手元のテスト用なら：node scripts/restore-plans.mjs --dev-vars > restore-plans.local.sql）
//   中身と、画面に出る一覧を確かめてから:
//   npx wrangler d1 execute anki-typing --remote --file restore-plans.local.sql
//
// 読むもの（どれも申し込みのとき pay.js が付けた印 metadata.email / metadata.plan で、だれのものか分かる）
//   ・続いている月額の申し込み（subscriptions）… 今の期間の終わり＋少し（pay.js の GRACE）まで
//   ・1 年分の支払い（Checkout Session。支払い済み）… 買った順に、pay.js と同じく 1 年ずつ積み上げる
// 書き方：今の期限より短くはしない（MAX）。反映済みの支払いの印（pay_events）も入れて、
//         あとから Stripe の知らせが来ても 2 度数えないようにする。
// Stripe には何も書き込まない（読むだけ）。
// ===============================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS, GRACE } from '../src/pay.js';

const here = dirname(fileURLToPath(import.meta.url));
const DAY = 86400000;
let key = process.env.STRIPE_SECRET_KEY || '';
if (process.argv.includes('--dev-vars')) {
  const m = readFileSync(join(here, '..', '.dev.vars'), 'utf8').match(/^STRIPE_SECRET_KEY=(.+)$/m);
  key = m ? m[1].trim() : '';
}
if (!/^sk_(test|live)_/.test(key)) {
  console.error('STRIPE_SECRET_KEY（sk_live_… か sk_test_…）を環境変数で渡すか、--dev-vars を付けてください');
  process.exit(1);
}

async function list(path, params) {
  const out = [];
  let after = '';
  for (;;) {
    const q = new URLSearchParams(Object.assign({ limit: '100' }, params, after ? { starting_after: after } : {}));
    const r = await fetch(`https://api.stripe.com/v1/${path}?${q}`, { headers: { authorization: 'Bearer ' + key } });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'Stripe ' + r.status);
    out.push(...j.data);
    if (!j.has_more || !j.data.length) return out;
    after = j.data[j.data.length - 1].id;
  }
}

const plans = new Map();   // email → { until, kind, customer, sub, events: [] }
const get = email => plans.get(email) || plans.set(email, { until: 0, kind: '', customer: '', sub: '', events: [] }).get(email);
const skipped = [];

// 1. 1 年分：古い順に積み上げる（切れていれば買った日から、残っていればその続きから）
const since = Math.floor((Date.now() - 2 * 366 * DAY) / 1000);   // 2 年より前のものは、もう切れている
const sessions = (await list('checkout/sessions', { status: 'complete', 'created[gte]': String(since) }))
  .filter(s => s.mode === 'payment' && s.payment_status === 'paid')
  .sort((a, b) => a.created - b.created);
for (const s of sessions) {
  const email = String((s.metadata && s.metadata.email) || s.client_reference_id || '').toLowerCase();
  const pl = PLANS[s.metadata && s.metadata.plan];
  if (!email || !pl || pl.mode !== 'payment') { skipped.push(`${s.id}：だれの・どのプランか分からない`); continue; }
  const p = get(email);
  p.until = Math.max(p.until, s.created * 1000) + pl.days * DAY;
  if (!p.sub) p.kind = s.metadata.plan;
  p.customer = p.customer || s.customer || '';
  p.events.push('cs:' + s.id);
}

// 2. 月額：続いている申し込み（支払いが遅れているものも、期間の終わりまでは入れる）
for (const status of ['active', 'trialing', 'past_due']) {
  for (const sub of await list('subscriptions', { status })) {
    const email = String((sub.metadata && sub.metadata.email) || '').toLowerCase();
    const plan = sub.metadata && sub.metadata.plan;
    // 今の期間の終わり（新しい API では items の中にある）
    const end = sub.current_period_end || (sub.items && sub.items.data[0] && sub.items.data[0].current_period_end);
    if (!email || !PLANS[plan] || !end) { skipped.push(`${sub.id}：だれの・どのプランか分からない`); continue; }
    const p = get(email);
    p.until = Math.max(p.until, end * 1000 + GRACE);
    Object.assign(p, { kind: plan, customer: sub.customer || p.customer, sub: sub.id });
  }
}

const sql = v => "'" + String(v ?? '').replace(/'/g, "''") + "'";
const out = [];
const now = Date.now();
const day = ms => new Date(ms).toISOString().slice(0, 10);
console.error(`Stripe（${key.startsWith('sk_live_') ? '本番' : 'テスト'}）から ${plans.size} 人分:`);
for (const [email, p] of [...plans].sort((a, b) => b[1].until - a[1].until)) {
  const alive = p.until > now;
  console.error(`  ${alive ? '会員' : '切れ'}  ${email}  ${p.kind}${p.sub ? '（自動更新）' : ''}  期限 ${day(p.until)}`);
  if (!alive) continue;   // 切れているものは入れない
  out.push(`INSERT INTO plans (email, until, kind, customer, sub, updated_at) VALUES (${sql(email)}, ${p.until}, ${sql(p.kind)}, ${sql(p.customer)}, ${sql(p.sub)}, ${now})
  ON CONFLICT(email) DO UPDATE SET until = MAX(plans.until, excluded.until), kind = excluded.kind,
    customer = CASE WHEN excluded.customer <> '' THEN excluded.customer ELSE plans.customer END,
    sub = CASE WHEN excluded.sub <> '' THEN excluded.sub ELSE plans.sub END, updated_at = excluded.updated_at;`);
  p.events.forEach(id => out.push(`INSERT OR IGNORE INTO pay_events (id, at) VALUES (${sql(id)}, ${now});`));
}
if (skipped.length) console.error('飛ばしたもの:\n  ' + skipped.join('\n  '));
console.error(`会員として入れるのは ${plans.size ? [...plans.values()].filter(p => p.until > now).length : 0} 人`);
process.stdout.write(out.join('\n') + '\n');
