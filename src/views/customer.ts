import { config } from "../config";

type Fulfillment = { id?: string; location_name: string; status: string; items: { name: string; quantity: number }[] };
type OrderData = {
  display_number: number;
  status: string;
  created_at: string;
  fulfillments?: Fulfillment[];
  items?: { name: string; quantity: number }[];
};

const statusLabels: Record<string, string> = {
  preparing: "準備中です",
  partially_ready: "一部の商品を受け取れます",
  available: "すべての商品を受け取れます",
  delivered: "受け渡しが完了しました",
  cancelled: "キャンセルされました",
};

export function customerPage(order: OrderData, token: string, securityNonce = ""): string {
  const fulfillments = normalizeFulfillments(order);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>注文状況 - 文化祭</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;background:#f3f4f6;color:#111827;padding:18px}.card{max-width:520px;margin:auto;background:#fff;padding:24px;border:1px solid #e5e7eb}.label{text-align:center;color:#6b7280}.number{text-align:center;font-size:64px;font-weight:850;line-height:1.1}.overall{text-align:center;font-size:20px;font-weight:750;padding:15px;margin:16px 0;border-top:2px solid #111827;border-bottom:2px solid #111827}.overall.available,.overall.partially_ready{color:#166534;border-color:#166534}.overall.cancelled{color:#991b1b;border-color:#991b1b}.location{padding:16px 0;border-bottom:1px solid #d1d5db}.location:last-child{border-bottom:0}.location-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.location-name{font-size:18px;font-weight:800}.status{font-size:13px;font-weight:750;padding:4px 8px;background:#e5e7eb}.status.ready{background:#dcfce7;color:#166534}.status.handed_over{background:#111827;color:#fff}.status.cancelled{background:#fee2e2;color:#991b1b}.item{display:flex;justify-content:space-between;color:#4b5563;margin-top:7px}.time{color:#9ca3af;font-size:12px;text-align:center;margin-top:18px}
  </style>
</head>
<body><main class="card">
  <div class="label">受付番号</div><div class="number">${config.displayNumberPad(order.display_number)}</div>
  <div id="overall" class="overall ${escapeHtml(order.status)}">${escapeHtml(statusLabels[order.status] ?? order.status)}</div>
  <div id="fulfillments">${renderFulfillments(fulfillments)}</div>
  <div class="time">ご注文日時: ${new Date(order.created_at).toLocaleString("ja-JP")}</div>
</main>
<script nonce="${securityNonce}">
  const token = ${JSON.stringify(token).replace(/</g, "\\u003c")};
  const escapeHtml = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const overallLabels = { preparing:'準備中です', partially_ready:'一部の商品を受け取れます', available:'すべての商品を受け取れます', delivered:'受け渡しが完了しました', cancelled:'キャンセルされました' };
  const fulfillmentLabels = { preparing:'準備中', ready:'提供可能', handed_over:'受渡済み', cancelled:'キャンセル' };
  let socket = null;

  function render(data) {
    const overall = document.getElementById('overall'); overall.className = 'overall ' + data.status; overall.textContent = overallLabels[data.status] || data.status;
    document.getElementById('fulfillments').innerHTML = (data.fulfillments || []).map(f => '<section class="location"><div class="location-head"><div class="location-name">' + escapeHtml(f.location_name) + '</div><div class="status ' + escapeHtml(f.status) + '">' + (fulfillmentLabels[f.status] || escapeHtml(f.status)) + '</div></div>' + (f.items || []).map(item => '<div class="item"><span>' + escapeHtml(item.name) + '</span><strong>×' + item.quantity + '</strong></div>').join('') + '</section>').join('');
  }
  async function load() { const response = await fetch('/api/order/' + token); if (response.ok) render(await response.json()); }
  function connect() {
    if (socket && socket.readyState <= 1) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'; socket = new WebSocket(protocol + '//' + location.host + '/ws/order/' + token);
    socket.onmessage = event => { try { const data = JSON.parse(event.data); if (data.type === 'order_update') render(data); } catch {} };
    socket.onclose = () => { socket = null; setTimeout(connect, 3000); }; socket.onerror = () => socket && socket.close();
  }
  load().then(connect);
</script></body></html>`;
}

function normalizeFulfillments(order: OrderData): Fulfillment[] {
  if (order.fulfillments) return order.fulfillments;
  return [{ location_name: "ご注文内容", status: order.status === "available" ? "ready" : order.status, items: order.items ?? [] }];
}

function renderFulfillments(fulfillments: Fulfillment[]): string {
  const labels: Record<string, string> = { preparing: "準備中", ready: "提供可能", handed_over: "受渡済み", cancelled: "キャンセル", available: "提供可能", delivered: "受渡済み" };
  return fulfillments.map(fulfillment => `<section class="location"><div class="location-head"><div class="location-name">${escapeHtml(fulfillment.location_name)}</div><div class="status ${escapeHtml(fulfillment.status)}">${escapeHtml(labels[fulfillment.status] ?? fulfillment.status)}</div></div>${fulfillment.items.map(item => `<div class="item"><span>${escapeHtml(item.name)}</span><strong>×${item.quantity}</strong></div>`).join("")}</section>`).join("");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
