import { config } from "../config";

type OrderData = {
  display_number: number;
  status: string;
  created_at: string;
  items: { name: string; quantity: number }[];
};

export function customerPage(order: OrderData, token: string, securityNonce = ""): string {
  const statusLabel: Record<string, string> = {
    preparing: "準備中",
    available: "お召し上がりいただけます",
    delivered: "お渡し済み",
    cancelled: "キャンセル",
  };
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>注文状況 - 文化祭</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;background:#fff;color:#111827;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
    .card{background:#fff;border-radius:8px;padding:32px 24px;max-width:420px;width:100%;text-align:center;border:1px solid #e5e7eb;box-shadow:none}
    .order-number{font-size:4rem;font-weight:800;color:#111827;line-height:1;margin:8px 0 4px}
    .order-label{font-size:1rem;color:#6b7280;margin-bottom:16px}
    .status-display{display:flex;align-items:center;justify-content:center;padding:20px 16px;border:1px solid #d1d5db;border-radius:8px;margin:18px 0;background:#fff}
    .status-display.available{border-color:#111827;animation:availablePop .5s ease-out}
    .status-display.cancelled{border-color:#fecaca}
    .status-text{font-size:1.3rem;font-weight:700}
    .status-text.preparing{color:#111827}
    .status-text.available{color:#111827}
    .status-text.cancelled{color:#991b1b}
    .status-text.delivered{color:#111827}
    .items-list{text-align:left;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0}
    .items-list h3{font-size:0.9rem;color:#6b7280;margin-bottom:8px}
    .item-row{display:flex;justify-content:space-between;padding:4px 0;font-size:1rem}
    .item-row .qty{color:#6b7280}
    .access-time{font-size:0.8rem;color:#9ca3af}
    .progress-bar{width:100%;height:4px;background:#e5e7eb;border-radius:2px;margin:16px 0;overflow:hidden}
    .progress-bar .fill{height:100%;border-radius:2px;transition:width .5s ease;background:#111827}
    @keyframes availablePop{0%{transform:scale(.95)}50%{transform:scale(1.02)}100%{transform:scale(1)}}
    @media(max-width:400px){
      .card{padding:24px 16px}
      .order-number{font-size:3rem}
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:0.9rem;color:#6b7280;margin-bottom:8px">受付番号</div>
    <div class="order-number">${config.displayNumberPad(order.display_number)}</div>

    <div class="status-display ${order.status}" id="status-display">
      <div class="status-text ${order.status}" id="status-text">${statusLabel[order.status]}</div>
    </div>

    <div class="progress-bar">
      <div class="fill" id="progress-fill" style="width:${order.status === "preparing" ? "30" : order.status === "available" ? "70" : "100"}%"></div>
    </div>

    <div class="items-list">
      <h3>ご注文内容</h3>
      ${order.items.map(i => `<div class="item-row"><span>${escapeHtml(i.name)}</span><span class="qty">×${i.quantity}</span></div>`).join("")}
    </div>

    <div class="access-time">ご注文日時: ${new Date(order.created_at).toLocaleString("ja-JP")}</div>
  </div>

  <script nonce="${securityNonce}">
    let ws = null;
    let reconnectTimer = null;
    const token = ${JSON.stringify(token).replace(/</g, "\\u003c")};

    function connect() {
      if (ws && ws.readyState <= 1) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + window.location.host + '/ws/order/' + token);

      ws.onopen = () => {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'order_update') {
            updateStatus(data.status);
          }
        } catch(err) {}
      };

      ws.onclose = () => {
        ws = null;
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws && ws.close();
      };
    }

    function updateStatus(status) {
      const display = document.getElementById('status-display');
      const text = document.getElementById('status-text');
      const progress = document.getElementById('progress-fill');

      const labels = { preparing: '準備中', available: 'お召し上がりいただけます', delivered: 'お渡し済み', cancelled: 'キャンセル' };

      display.className = 'status-display ' + status;
      text.className = 'status-text ' + status;
      text.textContent = labels[status] || status;

      if (status === 'preparing') progress.style.width = '30%';
      else if (status === 'available') progress.style.width = '70%';
      else progress.style.width = '100%';
    }

    async function init() {
      try {
        const res = await fetch('/api/order/' + token);
        if (res.ok) {
          const data = await res.json();
          updateStatus(data.status);
        }
      } catch(e) {}
      connect();
    }
    init();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
