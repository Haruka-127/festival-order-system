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
<a class="skip-link" href="#main-content">本文へ移動</a>
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand"><h1>注文受付</h1></div>
    <div class="topbar-actions">
      <span class="current-time">${formatDateTime(new Date())}</span>
      <form method="POST" action="/logout" class="inline-form"><button type="submit" class="btn">ログアウト</button></form>
    </div>
  </div>
  </header>
  <main id="main-content" class="app">
    <section class="menu-panel" aria-labelledby="new-order-heading">
      <div class="panel-heading reception-heading"><h2 id="new-order-heading">新しい注文</h2></div>

      <div id="cart" class="cart">
        <div class="cart-heading"><h3>カート</h3><span id="cart-count" class="count-badge">0点</span></div>
        <div id="cart-items" aria-live="polite">
          <div class="empty-orders">商品を選択してください</div>
        </div>
        <div id="cart-total" class="cart-total" hidden>
          <span>合計数量</span>
          <strong id="cart-summary-count">0点</strong>
        </div>
        <p class="keyboard-help"><kbd>1</kbd>〜<kbd>0</kbd> 商品追加　<kbd>Enter</kbd> 注文確定</p>
        <button id="submit-order" class="btn btn-success btn-lg btn-block" disabled data-action="submit-order">
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
            <span class="cart-badge" id="badge-${item.id}" hidden>0</span>
          </button>`;
        }).join("")}
      </div>
    </section>

    <section class="orders-panel" aria-labelledby="current-orders-heading">
      <div class="panel-heading">
        <div><h2 id="current-orders-heading">現在の注文</h2><div id="last-updated" class="panel-note">更新確認中</div></div>
        <div class="tabs" id="order-tabs" role="tablist" aria-label="注文状態で絞り込み">
          <button class="tab active" data-filter="all" role="tab" aria-selected="true">すべて</button>
          <button class="tab" data-filter="preparing" role="tab" aria-selected="false">準備中</button>
          <button class="tab" data-filter="available" role="tab" aria-selected="false">提供可能</button>
        </div>
      </div>
      <div id="order-list">
        ${orders.length === 0 ? '<div class="empty-orders">現在、注文はありません</div>' : orders.map(order => orderCard(order)).join("")}
      </div>
    </section>
  </main>

  <div id="modal" class="modal-overlay" hidden>
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
    return `<div class="fulfillment-line"><strong>${escapeHtml(fulfillment.location_name)}</strong> <span class="fulfillment-status">${label}</span><br>${items}</div>`;
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
