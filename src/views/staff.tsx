import { config } from "../config";
import { pageDocument } from "./layout";
import type { CashierOrder } from "../contracts/view-models";
import { formatDateTime } from "../services/time";
import { todayDate } from "../services/numbering";

type Item = { id: number; name: string; sold_out: number; sort_order: number; location_name?: string; max_quantity_per_order?: number | null };
export function staffPage(items: Item[], orders: CashierOrder[], _securityNonce = ""): string {
return pageDocument({
    title: "店員画面 - 文化祭飲食システム",
    viewport: "width=device-width, initial-scale=1.0",
    stylesheet: "staff",
    script: "staff",
    bodyAttributes: { "data-current-date": todayDate(), "data-display-digits": String(config.displayNumberDigits) },
    content: `
<header class="topbar">
    <div class="brand"><div class="brand-mark" aria-hidden="true">注</div><div><div class="brand-kicker">FESTIVAL ORDER SYSTEM</div><h1>注文受付</h1></div></div>
    <div class="topbar-actions">
      <span class="current-time">${formatDateTime(new Date())}</span>
      <form method="POST" action="/logout" style="display:inline"><button type="submit" class="btn">ログアウト</button></form>
    </div>
  </header>
  <div class="app">
    <div class="menu-panel">
      <div class="panel-heading"><div><div class="panel-kicker">ORDER ENTRY</div><h2>新しい注文</h2></div><p class="panel-note">商品ボタンまたは数字キーで追加できます</p></div>

      <div id="cart" class="cart">
        <h2>カート</h2>
        <div id="cart-items" aria-live="polite">
          <div class="empty-orders">商品を選択してください</div>
        </div>
        <div id="cart-total" class="cart-total" style="display:none">
          <span>合計</span>
          <span id="cart-count">0点</span>
        </div>
        <button id="submit-order" class="btn btn-success btn-lg btn-block mt-2" style="display:none" data-action="submit-order">
          注文を確定する
        </button>
      </div>

      <div class="catalog-toolbar">
        <h2 class="catalog-title">商品を選択</h2>
        <div class="search-box"><input type="search" id="item-search" aria-label="商品を検索" placeholder="商品名で検索"></div>
      </div>

      <div class="menu-grid" id="menu-grid">
        ${items.map((item, i) => {
          const key = i < 9 ? i + 1 : 0;
          return `
          <button class="menu-btn ${item.sold_out ? 'sold-out' : ''}" data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-key="${key}" data-add-item-id="${item.id}"
            ${item.sold_out ? 'disabled' : ''}>
            <span class="key-hint">${key}</span>
            ${escapeHtml(item.name)}
            <span class="item-location">${escapeHtml(item.location_name ?? "既定提供場所")}</span>
            ${item.sold_out ? '<span class="soldout-label">売り切れ</span>' : ''}
            <span class="cart-badge" id="badge-${item.id}" style="display:none">0</span>
          </button>`;
        }).join("")}
      </div>
    </div>

    <div class="orders-panel">
      <div class="panel-heading">
        <div><div class="panel-kicker">ORDER STATUS</div><h2>現在の注文</h2></div>
        <div><div id="last-updated" class="panel-note">更新確認中</div><div class="tabs" id="order-tabs" role="tablist" aria-label="注文状態で絞り込み">
          <button class="tab active" data-filter="all" role="tab" aria-selected="true">すべて</button>
          <button class="tab" data-filter="preparing" role="tab" aria-selected="false">準備中</button>
          <button class="tab" data-filter="available" role="tab" aria-selected="false">提供可能</button>
        </div></div>
      </div>
      <div id="order-list">
        ${orders.length === 0 ? '<div class="empty-orders">現在、注文はありません</div>' : orders.map(order => orderCard(order)).join("")}
      </div>
    </div>
  </div>

  <div id="modal" class="modal-overlay" style="display:none">
    <div class="modal-content" id="modal-content" role="dialog" aria-modal="true" aria-label="注文受付結果">
      <div id="modal-body"></div>
    </div>
  </div>
  <div id="toast-container"></div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function orderCard(order: CashierOrder): string {
  const orderId = escapeHtml(order.id);
  const fulfillments = order.fulfillments ?? [{ id: order.id, location_name: "既定提供場所", status: order.status === "available" ? "ready" : order.status === "delivered" ? "handed_over" : order.status, items: order.items ?? [] }];
  const fulfillmentHtml = fulfillments.map(fulfillment => {
    const label = { preparing: "準備中", ready: "提供可能", handed_over: "受渡済", cancelled: "キャンセル" }[fulfillment.status] ?? fulfillment.status;
    const items = fulfillment.items.map(item => `${escapeHtml(item.name)} x${item.quantity}`).join(", ");
    return `<div class="fulfillment-line"><strong>${escapeHtml(fulfillment.location_name)}</strong> <span style="color:#6b7280">${label}</span><br>${items}</div>`;
  }).join("");
  const hasReady = fulfillments.some(fulfillment => fulfillment.status === "ready" || fulfillment.status === "handed_over");
  const statusLabel = order.status === "available" ? "全ブース提供可能" : hasReady ? "一部提供可能" : "準備中";
  const statusClass = {
    preparing: "status-preparing",
    available: "status-available",
    delivered: "status-delivered",
    cancelled: "status-cancelled",
  }[order.status];

  const actions = `<button class="btn-cancel" data-order-id="${orderId}" data-order-status="cancelled">注文をキャンセル</button>`;

  return `<div class="order-card${order.status === "available" ? " available" : ""}" data-status="${order.status}">
    <div class="order-header">
      <span class="order-num">${config.displayNumberPad(order.display_number)}</span>
      ${order.display_number_date && order.display_number_date !== todayDate() ? `<span class="panel-note">${escapeHtml(order.display_number_date)}受付</span>` : ""}
      <span class="badge ${statusClass}">${statusLabel}</span>
    </div>
    <div class="order-items">${fulfillmentHtml}</div>
    <div class="order-actions">${actions}</div>
  </div>`;
}
