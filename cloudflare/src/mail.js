// ===============================================================
// mail.js
// サイトから送るメール（いまは「お支払いありがとうございます」だけ）。
// Stripe の領収書メールには販売者の住所が載るので、そちらは止めて、住所の無いこのメールで知らせる。
//
// 送り方は 2 つ。あるほうを使い、どちらも無ければ送らない（支払いそのものは止めない）
//   RESEND_API_KEY … Resend（無料で月 3,000 通・1 日 100 通）。wrangler secret put で入れる
//   EMAIL          … Cloudflare の send_email バインディング（Workers 有料プラン）。
//                    移るときは wrangler.jsonc に "send_email": [{ "name": "EMAIL" }] を足し、RESEND_API_KEY を消す
//   MAIL_FROM      … 送り主（wrangler.jsonc の vars）。umekobo.com を Resend / Cloudflare で確かめておくこと
// ===============================================================

const DEFAULT_FROM = 'STUDY TYPE <no-reply@umekobo.com>';

export async function sendMail(env, { to, subject, text }) {
  const from = env.MAIL_FROM || DEFAULT_FROM;
  const replyTo = env.SELLER_EMAIL || undefined;
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, reply_to: replyTo })
    });
    if (!res.ok) throw new Error('Resend ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return true;
  }
  if (env.EMAIL && env.EMAIL.send) {
    await env.EMAIL.send({ to, from, subject, text, replyTo });
    return true;
  }
  return false;
}
