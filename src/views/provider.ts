import { config } from "../config";
import { todayDate } from "../services/numbering";

export type ProviderTask = {
  id: string;
  display_number: number;
  display_number_date: string;
  status: string;
  created_at: string;
  handed_over_at?: string | null;
  items: { name: string; quantity: number }[];
};

export function providerPage(locationName: string, tasks: ProviderTask[], securityNonce = ""): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${escapeHtml(locationName)} - 提供担当</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;background:#f3f4f6;color:#111827}
    header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:#fff;border-bottom:1px solid #d1d5db}
    h1{font-size:22px;margin:0}.subtitle,.connection{color:#6b7280;font-size:13px;margin-top:3px}.connection.offline{color:#b91c1c}.actions{display:flex;gap:8px;align-items:center}
    button{font:inherit;cursor:pointer}.logout,.action{border:1px solid #d1d5db;background:#fff;color:#111827;border-radius:7px;padding:9px 14px;font-weight:700}.ready{background:#166534;color:#fff;border-color:#166534}.done{background:#111827;color:#fff;border-color:#111827}.undo{color:#4b5563}
    main{padding:18px;max-width:1400px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));gap:14px}.card{background:#fff;border:1px solid #d1d5db;padding:16px}.card.ready-card{border:3px solid #166534}.card.completed-card{opacity:.72}.number{font-size:52px;font-weight:800;line-height:1}.badge{font-size:13px;font-weight:700;color:#6b7280}.ready-card .badge{color:#166534}.items{margin:14px 0;min-height:48px}.item{display:flex;justify-content:space-between;padding:3px 0}.card-actions{display:flex;gap:7px;flex-wrap:wrap}.empty{text-align:center;color:#6b7280;padding:80px 20px;font-size:20px}.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111827;color:#fff;padding:11px 20px;z-index:5}
  </style>
</head>
<body>
  <header>
    <div><h1>${escapeHtml(locationName)}</h1><div class="subtitle">提供担当画面</div><div id="connection" class="connection">接続中</div></div>
    <div class="actions"><a class="logout" href="/account/password" style="text-decoration:none">パスワード変更</a><form method="POST" action="/logout"><button class="logout" type="submit">ログアウト</button></form></div>
  </header>
  <main><div id="task-list">${renderTasks(tasks)}</div></main>
  <script nonce="${securityNonce}">
    let socket = null;
    let reconnectTimer = null;
    let reconnectDelay = 3000;
    const pending = new Set();
    const currentDate = ${JSON.stringify(todayDate())};
    const escapeHtml = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const pad = value => String(value).padStart(${config.displayNumberDigits}, '0');

    function render(tasks) {
      const root = document.getElementById('task-list');
      if (!tasks.length) { root.innerHTML = '<div class="empty">現在、準備中の商品はありません</div>'; return; }
      root.innerHTML = '<div class="grid">' + tasks.map(task => {
        const items = task.items.map(item => '<div class="item"><span>' + escapeHtml(item.name) + '</span><strong>×' + item.quantity + '</strong></div>').join('');
        const buttons = task.status === 'preparing'
          ? '<button class="action ready" data-id="' + escapeHtml(task.id) + '" data-status="ready">提供可能にする</button>'
          : task.status === 'ready'
            ? '<button class="action done" data-id="' + escapeHtml(task.id) + '" data-status="handed_over">受渡完了</button><button class="action undo" data-id="' + escapeHtml(task.id) + '" data-status="preparing">準備中に戻す</button>'
            : '<button class="action undo" data-id="' + escapeHtml(task.id) + '" data-status="ready">受渡完了を取り消す</button>';
        const statusLabel = task.status === 'ready' ? 'お呼び出し中' : task.status === 'handed_over' ? '受渡済み（2分間取消可）' : '準備中';
        const previous = task.display_number_date && task.display_number_date !== currentDate ? '<div class="badge">' + escapeHtml(task.display_number_date) + '受付</div>' : '';
        return '<article class="card ' + (task.status === 'ready' ? 'ready-card' : task.status === 'handed_over' ? 'completed-card' : '') + '"><div style="display:flex;justify-content:space-between;align-items:start"><div><div class="number">' + pad(task.display_number) + '</div>' + previous + '</div><div class="badge">' + statusLabel + '</div></div><div class="items">' + items + '</div><div class="card-actions">' + buttons + '</div></article>';
      }).join('') + '</div>';
    }

    async function loadTasks() {
      try {
        const response = await fetch('/api/provider/fulfillments');
        if (response.status === 401) { location.href = '/login'; return; }
        if (response.ok) { render(await response.json()); setConnection('同期済み', false); }
      } catch { setConnection('オフライン・再接続中', true); }
    }

    async function updateStatus(id, status) {
      if (pending.has(id)) return;
      if (status === 'handed_over' && !confirm('受付番号の受け渡しを完了しますか？')) return;
      pending.add(id);
      document.querySelectorAll('button[data-id="' + CSS.escape(id) + '"]').forEach(button => button.disabled = true);
      try {
        const response = await fetch('/api/provider/fulfillments/' + encodeURIComponent(id) + '/status', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) });
        if (response.status === 401) { location.href = '/login'; return; }
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = data.error || '更新に失敗しました'; document.body.appendChild(toast); setTimeout(() => toast.remove(), 3000);
        }
      } catch { setConnection('オフライン・更新を再確認してください', true); }
      finally { pending.delete(id); await loadTasks(); }
    }

    function setConnection(message, offline) {
      const element = document.getElementById('connection');
      element.textContent = message + ' ' + new Date().toLocaleTimeString('ja-JP');
      element.classList.toggle('offline', offline);
    }

    function connect() {
      if (socket && socket.readyState <= 1) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(protocol + '//' + location.host + '/ws/provider');
      socket.onopen = () => { reconnectDelay = 3000; setConnection('リアルタイム接続済み', false); };
      socket.onmessage = event => { try { const data = JSON.parse(event.data); if (data.type === 'provider_update') render(data.tasks || []); } catch {} };
      socket.onclose = () => { socket = null; setConnection('再接続中', true); reconnectTimer = setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); };
      socket.onerror = () => socket && socket.close();
    }
    document.addEventListener('click', event => { const button = event.target.closest('button[data-id]'); if (button) updateStatus(button.dataset.id, button.dataset.status); });
    setInterval(loadTasks, 5000);
    connect();
  </script>
</body>
</html>`;
}

function renderTasks(tasks: ProviderTask[]): string {
  if (tasks.length === 0) return '<div class="empty">現在、準備中の商品はありません</div>';
  return `<div class="grid">${tasks.map(task => `<article class="card ${task.status === "ready" ? "ready-card" : task.status === "handed_over" ? "completed-card" : ""}">
    <div style="display:flex;justify-content:space-between;align-items:start"><div><div class="number">${config.displayNumberPad(task.display_number)}</div>${task.display_number_date !== todayDate() ? `<div class="badge">${escapeHtml(task.display_number_date)}受付</div>` : ""}</div><div class="badge">${task.status === "ready" ? "お呼び出し中" : task.status === "handed_over" ? "受渡済み（2分間取消可）" : "準備中"}</div></div>
    <div class="items">${task.items.map(item => `<div class="item"><span>${escapeHtml(item.name)}</span><strong>×${item.quantity}</strong></div>`).join("")}</div>
    <div class="card-actions">${task.status === "preparing" ? `<button class="action ready" data-id="${escapeHtml(task.id)}" data-status="ready">提供可能にする</button>` : task.status === "ready" ? `<button class="action done" data-id="${escapeHtml(task.id)}" data-status="handed_over">受渡完了</button><button class="action undo" data-id="${escapeHtml(task.id)}" data-status="preparing">準備中に戻す</button>` : `<button class="action undo" data-id="${escapeHtml(task.id)}" data-status="ready">受渡完了を取り消す</button>`}</div>
  </article>`).join("")}</div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
