// ===============================================================
// admin.js
// 会員の登録・削除（/admin）。ADMIN_EMAILS のアカウントでログインしているときだけ開ける。
//
//   GET  /admin       … 会員の一覧と追加フォーム
//   POST /admin/api   … { action: 'add', email, name } / { action: 'remove', email }
// ===============================================================

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function members(env) {
  const { results } = await env.DB.prepare(
    `SELECT m.email, m.name, m.added_at,
            (SELECT MAX(created_at) FROM sessions s WHERE s.email = m.email) AS last_login
       FROM members m ORDER BY m.added_at DESC`
  ).all();
  return results;
}

function page(list, viewer) {
  const fmt = ms => ms ? new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';
  const rows = list.map(m => `<tr>
      <td>${esc(m.email)}</td><td>${esc(m.name)}</td>
      <td>${fmt(m.added_at)}</td><td>${fmt(m.last_login)}</td>
      <td><button type="button" class="btn-del" data-email="${esc(m.email)}">削除</button></td>
    </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>会員の管理</title>
<style>
  :root,[data-theme="blue"]{--bg:#f3fbfd;--card:#fff;--line:#bfe3ee;--text:#16384a;--muted:#5b7c8c;--accent:#1fa7c9}
  [data-theme="dark"]{--bg:#0f1724;--card:#182236;--line:#2a3651;--text:#e8eef7;--muted:#93a3bd;--accent:#3bc9db}
  body{margin:0;background:var(--bg);color:var(--text);font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif}
  main{max-width:860px;margin:0 auto;padding:48px 16px}
  a{color:var(--accent)}
  h1{font-size:1.5rem;margin:8px 0 4px}
  p.note{color:var(--muted);font-size:.9rem;margin:0 0 24px}
  form{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
  input{flex:1 1 220px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);font:inherit}
  button{padding:10px 16px;border:0;border-radius:8px;background:var(--accent);color:#fff;font:inherit;cursor:pointer}
  .btn-del{padding:6px 10px;background:transparent;color:var(--muted);border:1px solid var(--line)}
  .wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  th,td{padding:10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
  th{color:var(--muted);font-weight:normal}
  tr:last-child td{border-bottom:0}
  .empty{padding:24px;text-align:center;color:var(--muted)}
</style>
</head>
<body>
<main>
  <a href="/">← トップ</a>
  <h1>会員の管理</h1>
  <p class="note">ここに登録した Google アカウントでログインすると、すべての問題が遊べて広告が出なくなります。
    管理者（${esc(viewer.email)}）は登録しなくても会員として扱います。</p>
  <form id="add">
    <input name="email" type="email" required placeholder="Google アカウントのメールアドレス">
    <input name="name" type="text" placeholder="名前（メモ・なくてもよい）">
    <button type="submit">会員に追加</button>
  </form>
  <div class="wrap">
    ${list.length ? `<table><thead><tr><th>メールアドレス</th><th>名前</th><th>登録日</th><th>最後のログイン</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>` : '<div class="empty">まだ会員がいません</div>'}
  </div>
</main>
<script>
function send(body){
  return fetch('/admin/api', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json(); })
    .then(function(j){ if (j.error) alert(j.error); else location.reload(); });
}
document.getElementById('add').onsubmit = function(e){
  e.preventDefault();
  send({ action:'add', email: this.email.value, name: this.name.value });
};
document.querySelectorAll('.btn-del').forEach(function(b){
  b.onclick = function(){
    if (confirm(b.dataset.email + ' を会員から外しますか？')) send({ action:'remove', email: b.dataset.email });
  };
});
</script>
</body>
</html>`;
}

// /admin と /admin/api を受け持つ。該当しなければ null
export async function handleAdmin(request, env, url, viewer) {
  if (url.pathname !== '/admin' && url.pathname !== '/admin/api') return null;
  if (!viewer.admin) {
    return url.pathname === '/admin'
      ? new Response('管理者の Google アカウントでログインしてから開いてください。', {
          status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } })
      : json({ error: '管理者だけが使えます' }, 403);
  }

  if (url.pathname === '/admin' && request.method === 'GET') {
    return new Response(page(await members(env), viewer), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  if (url.pathname === '/admin/api' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: '送られた内容が読めません' }, 400); }
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: 'メールアドレスの形が正しくありません' }, 400);
    if (body.action === 'add') {
      await env.DB.prepare(
        'INSERT INTO members (email, name, added_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name'
      ).bind(email, String(body.name || '').trim(), Date.now()).run();
      return json({ ok: true });
    }
    if (body.action === 'remove') {
      await env.DB.prepare('DELETE FROM members WHERE email = ?').bind(email).run();
      return json({ ok: true });
    }
    return json({ error: 'action が違います' }, 400);
  }
  return new Response('Method Not Allowed', { status: 405 });
}
