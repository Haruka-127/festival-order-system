import { config } from "../config";

type Item = { id: number; name: string; active: number; sold_out: number; sort_order: number };
type OrderSummary = { id: string; display_number: number; status: string; created_at: string; items: string; token: string };
type UserSummary = { id: string; username: string; role: string; created_at: string };

export function adminPage(items: Item[], orders: OrderSummary[], users: UserSummary[], currentNum: { number: number; date: string } | null, securityNonce = ""): string {
  const statusLabels: Record<string, string> = { preparing: "準備中", available: "提供可能", delivered: "受渡済", cancelled: "キャンセル" };
  const statusColors: Record<string, string> = { preparing: "badge-blue", available: "badge-green", delivered: "badge-gray", cancelled: "badge-red" };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理画面 - 文化祭飲食システム</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;background:#fff;color:#111827;line-height:1.5}
    button{cursor:pointer;font:inherit}
    input,select,textarea{font:inherit}
    .app{max-width:1000px;margin:0 auto;padding:16px}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px}
    .header h1{font-size:22px}
    .tabs{display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap}
    .tab{padding:10px 20px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-weight:600;background:#fff;color:#374151;transition:all .15s}
    .tab.active{background:#111827;border-color:#111827;color:#fff}
    .tab:hover:not(.active){background:#f9fafb}
    .section{display:none}
    .section.active{display:block}
    .card{background:#fff;border-radius:8px;padding:20px;border:1px solid #e5e7eb;box-shadow:none;margin-bottom:16px}
    .card h2{font-size:18px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:14px}
    th{background:#f9fafb;font-weight:600;color:#374151}
    tr:hover{background:#f8fafc}
    .form-group{margin-bottom:12px}
    .form-group label{display:block;font-size:13px;font-weight:600;color:#4b5563;margin-bottom:4px}
    .form-group input{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px}
    .form-group input:focus{outline:none;border-color:#111827}
    .form-row{display:flex;gap:12px;flex-wrap:wrap}
    .form-row .form-group{flex:1;min-width:120px}
    .inline-form{display:inline}
    .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600}
    .badge-blue{background:#f3f4f6;color:#111827}
    .badge-green{background:#dcfce7;color:#15803d}
    .badge-gray{background:#e5e7eb;color:#4b5563}
    .badge-red{background:#fecaca;color:#991b1b}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:8px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#111827;font-size:13px;font-weight:600;transition:all .15s}
    .btn:hover{background:#f9fafb}
    .btn:active{transform:scale(.97)}
    .btn-primary,.btn-success{background:#111827;border-color:#111827;color:#fff}
    .btn-primary:hover,.btn-success:hover{background:#374151}
    .btn-warning{background:#fff;color:#111827}
    .btn-danger{background:#fff;border-color:#dc2626;color:#b91c1c}
    .btn-secondary{background:#fff;color:#374151}
    .btn-sm{padding:4px 10px;font-size:12px}
    .flex{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .mt-2{margin-top:8px}
    .mb-2{margin-bottom:8px}
    .text-center{text-align:center}
    .status-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0}
    .stat-card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}
    .stat-card .num{font-size:28px;font-weight:700;color:#111827}
    .stat-card .label{font-size:12px;color:#6b7280;margin-top:2px}
    .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;animation:fadeIn .3s}
    @keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    .confirm-dialog{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center}
    .confirm-content{background:#fff;border-radius:16px;padding:24px;max-width:400px;width:90%;text-align:center}
    .confirm-content p{margin-bottom:16px;font-size:15px}
  </style>
</head>
<body>
  <div class="app">
    <div class="header">
      <h1>管理画面</h1>
      <div class="flex">
        <a href="/staff" class="btn btn-primary btn-sm">店員画面</a>
        <form method="POST" action="/logout" class="inline-form">
          <button type="submit" class="btn btn-secondary btn-sm">ログアウト</button>
        </form>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="items">商品管理</button>
      <button class="tab" data-tab="orders">注文一覧</button>
      <button class="tab" data-tab="users">ユーザー管理</button>
      <button class="tab" data-tab="settings">設定</button>
    </div>

    <!-- Items Tab -->
    <div id="tab-items" class="section active">
      <div class="card">
        <h2>商品一覧</h2>
        <div class="flex mb-2">
          <button class="btn btn-success btn-sm" data-action="show-add-item">＋ 新規商品</button>
        </div>
        <div id="add-item-form" style="display:none;background:#fff;border:1px solid #e5e7eb;padding:16px;border-radius:8px;margin-bottom:12px">
          <h3 style="font-size:15px;margin-bottom:8px">新規商品を追加</h3>
          <form method="POST" action="/api/admin/items" class="form-row">
            <div class="form-group"><input type="text" name="name" placeholder="商品名" required></div>
            <div class="form-group"><input type="number" name="sort_order" placeholder="表示順" value="0" style="max-width:100px"></div>
            <div><button type="submit" class="btn btn-primary">追加</button></div>
          </form>
        </div>
        <table>
          <thead><tr><th>表示順</th><th>商品名</th><th>状態</th><th>操作</th></tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>
                  <form method="POST" action="/api/admin/items/${item.id}/sort" class="inline-form">
                    <input type="number" name="sort_order" value="${item.sort_order}" data-auto-submit style="width:60px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:13px">
                  </form>
                </td>
                <td>
                  <form method="POST" action="/api/admin/items/${item.id}/rename" class="inline-form" style="display:flex;gap:4px">
                    <input type="text" name="name" value="${escapeHtml(item.name)}" style="padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:13px">
                    <button type="submit" class="btn btn-sm btn-primary">更新</button>
                  </form>
                </td>
                <td>
                  ${item.active ? "" : '<span class="badge badge-gray">停止中</span> '}
                  ${item.sold_out ? '<span class="badge badge-red">売り切れ</span>' : '<span class="badge badge-green">販売中</span>'}
                </td>
                <td>
                  <div class="flex">
                    <form method="POST" action="/api/admin/items/${item.id}/toggle-active" class="inline-form">
                      <button type="submit" class="btn btn-sm ${item.active ? "btn-warning" : "btn-success"}">
                        ${item.active ? "販売停止" : "販売再開"}
                      </button>
                    </form>
                    <form method="POST" action="/api/admin/items/${item.id}/toggle-soldout" class="inline-form">
                      <button type="submit" class="btn btn-sm ${item.sold_out ? "btn-success" : "btn-warning"}">
                        ${item.sold_out ? "売切解除" : "売り切れ"}
                      </button>
                    </form>
                    <button class="btn btn-sm btn-danger" data-delete-item-id="${item.id}" data-delete-item-name="${escapeHtml(item.name)}">削除</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Orders Tab -->
    <div id="tab-orders" class="section">
      <div class="card">
        <h2>注文一覧</h2>
        <div class="flex mb-2">
          <span class="stat-card" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px">
            <span class="num" style="font-size:16px">${orders.filter(o => o.status === "preparing").length}</span>
            <span class="label">準備中</span>
          </span>
          <span class="stat-card" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px">
            <span class="num" style="font-size:16px">${orders.filter(o => o.status === "available").length}</span>
            <span class="label">提供可能</span>
          </span>
          <span class="stat-card" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px">
            <span class="num" style="font-size:16px">${orders.filter(o => o.status === "delivered").length}</span>
            <span class="label">受渡済</span>
          </span>
          <span class="stat-card" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px">
            <span class="num" style="font-size:16px">${orders.filter(o => o.status === "cancelled").length}</span>
            <span class="label">キャンセル</span>
          </span>
        </div>
        <table>
          <thead><tr><th>受付番号</th><th>商品</th><th>状態</th><th>日時</th><th>QR</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td style="font-weight:700">${config.displayNumberPad(o.display_number)}</td>
                <td style="font-size:13px">${escapeHtml(o.items)}</td>
                <td><span class="badge ${statusColors[o.status] || "badge-gray"}">${escapeHtml(statusLabels[o.status] || o.status)}</span></td>
                <td style="font-size:12px;color:#6b7280">${new Date(o.created_at).toLocaleString("ja-JP")}</td>
                <td><a href="/order/${encodeURIComponent(o.token)}" target="_blank" rel="noopener noreferrer" style="font-size:12px">開く</a></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Users Tab -->
    <div id="tab-users" class="section">
      <div class="card">
        <h2>ユーザー管理</h2>
        <div class="flex mb-2">
          <button class="btn btn-success btn-sm" data-action="show-add-user">＋ 新規スタッフ</button>
        </div>
        <div id="add-user-form" style="display:none;background:#fff;border:1px solid #e5e7eb;padding:16px;border-radius:8px;margin-bottom:12px">
          <h3 style="font-size:15px;margin-bottom:8px">スタッフを追加</h3>
          <form method="POST" action="/api/admin/users" class="form-row">
            <div class="form-group"><input type="text" name="username" placeholder="ユーザー名" required></div>
            <div class="form-group"><input type="password" name="password" placeholder="パスワード" required></div>
            <div><button type="submit" class="btn btn-primary">追加</button></div>
          </form>
        </div>
        <table>
          <thead><tr><th>ユーザー名</th><th>権限</th><th>作成日</th><th>操作</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${escapeHtml(u.username)}</td>
                <td><span class="badge ${u.role === "admin" ? "badge-blue" : "badge-gray"}">${u.role === "admin" ? "管理者" : "店員"}</span></td>
                <td style="font-size:12px;color:#6b7280">${new Date(u.created_at).toLocaleString("ja-JP")}</td>
                <td>
                  ${u.role !== "admin" ? `<form method="POST" action="/api/admin/users/${encodeURIComponent(u.id)}/delete" class="inline-form" data-confirm-delete-user><button type="submit" class="btn btn-sm btn-danger">削除</button></form>` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Settings Tab -->
    <div id="tab-settings" class="section">
      <div class="card">
        <h2>番号設定</h2>
        <div class="flex" style="align-items:center;gap:16px">
          <div>
            <div style="font-size:13px;color:#6b7280">現在の日付</div>
            <div style="font-size:18px;font-weight:700">${currentNum ? currentNum.date : "---"}</div>
          </div>
          <div>
            <div style="font-size:13px;color:#6b7280">現在の番号</div>
            <div style="font-size:24px;font-weight:700;color:#111827">${currentNum ? config.displayNumberPad(currentNum.number) : "---"}</div>
          </div>
        </div>
        <div class="mt-2">
          <button class="btn btn-warning" data-action="reset-numbers">番号をリセット</button>
          <span style="font-size:12px;color:#6b7280;margin-left:8px">※ 未処理の注文がない場合のみ、新しい注文を1番から採番します</span>
        </div>
      </div>

      <div class="card">
        <h2>データ管理</h2>
        <button type="button" class="btn btn-danger" data-action="cleanup">古い注文を削除</button>
        <span style="font-size:12px;color:#6b7280;margin-left:8px">受け渡し済み・キャンセルの注文データを削除します</span>
      </div>
    </div>
  </div>

  <div id="toast-container"></div>
  <div id="confirm-modal" style="display:none"></div>

  <script nonce="${securityNonce}">
    function showTab(name) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + name).classList.add('active');
      document.querySelector('.tab[data-tab="' + name + '"]').classList.add('active');
    }

    function showAddItem() {
      const f = document.getElementById('add-item-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    }
    function showAddUser() {
      const f = document.getElementById('add-user-form');
      f.style.display = f.style.display === 'none' ? 'block' : 'none';
    }

    function showToast(msg) {
      const c = document.getElementById('toast-container');
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      c.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    function confirmDeleteItem(id, name) {
      if (confirm('「' + name + '」を削除しますか？\\n過去の注文データには影響しません。')) {
        fetch('/api/admin/items/' + id + '/delete', { method: 'POST' })
          .then(r => { if (r.ok) location.reload(); else showToast('削除に失敗しました'); })
          .catch(() => showToast('エラーが発生しました'));
      }
    }

    function confirmReset() {
      if (confirm('受付番号をリセットしますか？\\n現在の注文データは保持されますが、新しい注文は1から採番されます。')) {
        fetch('/api/admin/reset-numbers', { method: 'POST' })
          .then(async r => {
            const data = await r.json().catch(() => ({}));
            if (r.ok) {
              showToast('番号をリセットしました');
              setTimeout(() => location.reload(), 1000);
            } else {
              showToast(data.error || 'リセットに失敗しました');
            }
          })
          .catch(() => showToast('エラーが発生しました'));
      }
    }

    function confirmCleanup() {
      if (confirm('受け渡し済みおよびキャンセルの注文を削除しますか？\\nこの操作は元に戻せません。')) {
        fetch('/api/admin/cleanup', { method: 'POST' })
          .then(async r => {
            const data = await r.json().catch(() => ({}));
            if (r.ok) {
              showToast('古い注文を' + (data.deleted || 0) + '件削除しました');
              setTimeout(() => location.reload(), 1000);
            } else {
              showToast(data.error || '削除に失敗しました');
            }
          })
          .catch(() => showToast('エラーが発生しました'));
      }
    }

    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.tab) showTab(button.dataset.tab);
      else if (button.dataset.action === 'show-add-item') showAddItem();
      else if (button.dataset.action === 'show-add-user') showAddUser();
      else if (button.dataset.action === 'reset-numbers') confirmReset();
      else if (button.dataset.action === 'cleanup') confirmCleanup();
      else if (button.dataset.deleteItemId) confirmDeleteItem(Number(button.dataset.deleteItemId), button.dataset.deleteItemName || '');
    });

    document.addEventListener('change', event => {
      const input = event.target.closest('input[data-auto-submit]');
      if (input && input.form) input.form.requestSubmit();
    });

    document.addEventListener('submit', event => {
      if (event.target.matches('form[data-confirm-delete-user]') && !confirm('このスタッフを削除しますか？')) event.preventDefault();
    });

    // Check for success/error params
    const params = new URLSearchParams(window.location.search);
    if (params.get('success')) showToast(params.get('success'));
    if (params.get('error')) showToast(params.get('error'));
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
