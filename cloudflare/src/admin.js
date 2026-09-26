// ===============================================================
// admin.js
// 会員の登録・削除（/admin）。ADMIN_EMAILS のアカウントでログインしているときだけ開ける。
//
//   GET  /admin       … ログインしたことのある人と会員の一覧、追加フォーム
//   POST /admin/api   … { action: 'add', email, name, juken } / { action: 'remove', email }
//                       { action: 'juken', email, on } / { action: 'resetNickname', email }
// ===============================================================

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 会員と、ログインしたことのある人をまとめた一覧（会員が先、その中は新しい順）
async function people(env) {
  const { results } = await env.DB.prepare(
    `SELECT e.email, m.name, m.added_at, m.juken, m.email IS NOT NULL AS member,
            u.nickname, u.nickname_set, u.google_name, u.last_login
       FROM (SELECT email FROM members UNION SELECT email FROM users) e
       LEFT JOIN members m ON m.email = e.email
       LEFT JOIN users u ON u.email = e.email
      ORDER BY member DESC, COALESCE(m.added_at, u.last_login) DESC`
  ).all();
  return results;
}

function page(list, viewer) {
  const fmt = ms => ms ? new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';
  const rows = list.map(m => `<tr>
      <td>${esc(m.email)}${m.name ? `<br><small>${esc(m.name)}</small>` : ''}</td>
      <td>${m.nickname ? esc(m.nickname) + (m.nickname_set ? '' : ' <small>(仮)</small>') : '—'}
        ${m.nickname_set ? `<button type="button" class="btn-sub" data-act="resetNickname" data-email="${esc(m.email)}" title="次のログインで決め直してもらう">決め直し</button>` : ''}</td>
      <td><input type="checkbox" class="chk-member" data-email="${esc(m.email)}" ${m.member ? 'checked' : ''}></td>
      <td><input type="checkbox" class="chk-juken" data-email="${esc(m.email)}" ${m.juken ? 'checked' : ''} ${m.member ? '' : 'disabled'}></td>
      <td>${fmt(m.last_login)}</td>
    </tr>`).join('');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>管理</title>
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
  .btn-sub{padding:3px 8px;margin-left:6px;font-size:.75rem;background:transparent;color:var(--muted);border:1px solid var(--line)}
  label.inline{display:flex;align-items:center;gap:6px;color:var(--muted)}
  label.inline input{flex:none}
  input[type=checkbox]{width:20px;height:20px;accent-color:var(--accent)}
  small{color:var(--muted)}
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
  <h1>管理</h1>
  <p class="note">会員 … すべてのレベルが遊べて、広告が出ません。<br>
    大学受験 … 大学受験モードの英単語・古文・歴史・対戦が使えます（会員のみ。日本史・世界史の一問一答は誰でも使えます）。<br>
    管理者（${esc(viewer.email)}）は登録しなくても両方使えます。ログインしたことのある人は下の一覧に出るので、チェックを入れるだけで会員にできます。</p>
  <form id="add">
    <input name="email" type="email" required placeholder="Google アカウントのメールアドレス">
    <input name="memo" type="text" placeholder="メモ（例：娘）">
    <label class="inline"><input name="juken" type="checkbox"> 大学受験も</label>
    <button type="submit">会員に追加</button>
  </form>
  <div class="wrap">
    ${list.length ? `<table><thead><tr><th>メールアドレス</th><th>ニックネーム</th><th>会員</th><th>大学受験</th><th>最後のログイン</th></tr></thead>
      <tbody>${rows}</tbody></table>` : '<div class="empty">まだ誰もいません</div>'}
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
  send({ action:'add', email: this.email.value, name: this.memo.value, juken: this.juken.checked });
};
document.querySelectorAll('.chk-member').forEach(function(c){
  c.onchange = function(){
    if (!c.checked && !confirm(c.dataset.email + ' を会員から外しますか？')) { c.checked = true; return; }
    send(c.checked ? { action:'add', email: c.dataset.email } : { action:'remove', email: c.dataset.email });
  };
});
document.querySelectorAll('.chk-juken').forEach(function(c){
  c.onchange = function(){ send({ action:'juken', email: c.dataset.email, on: c.checked }); };
});
document.querySelectorAll('.btn-sub').forEach(function(b){
  b.onclick = function(){
    if (confirm(b.dataset.email + ' のニックネームを次のログインで決め直してもらいますか？')) send({ action: b.dataset.act, email: b.dataset.email });
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
    return new Response(page(await people(env), viewer), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  if (url.pathname === '/admin/api' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: '送られた内容が読めません' }, 400); }
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: 'メールアドレスの形が正しくありません' }, 400);
    if (body.action === 'add') {
      // 一覧のチェックから会員にしたときは、メモと大学受験の許可はそのまま
      await env.DB.prepare(
        `INSERT INTO members (email, name, added_at, juken) VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE members.name END,
                                          juken = MAX(members.juken, excluded.juken)`
      ).bind(email, String(body.name || '').trim(), Date.now(), body.juken ? 1 : 0).run();
      return json({ ok: true });
    }
    if (body.action === 'juken') {
      await env.DB.prepare('UPDATE members SET juken = ? WHERE email = ?').bind(body.on ? 1 : 0, email).run();
      return json({ ok: true });
    }
    if (body.action === 'resetNickname') {
      await env.DB.prepare("UPDATE users SET nickname_set = 0 WHERE email = ?").bind(email).run();
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
