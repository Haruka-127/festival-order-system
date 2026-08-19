import { config } from "../../config";
import { formatDateTime } from "../../services/time";
import { escapeHtml, renderPagination } from "./helpers";
import type { AdminOrder, AdminPageState } from "./types";

export function renderOrdersSection(orders: AdminOrder[], pageState: AdminPageState = {}): string {
  const statusLabels: Record<string, string> = { preparing: "準備中", available: "提供可能", delivered: "受渡済", cancelled: "キャンセル" };
  const statusColors: Record<string, string> = { preparing: "badge-blue", available: "badge-green", delivered: "badge-gray", cancelled: "badge-red" };
  const filter = pageState.orderFilter ?? "active";
  return `<div id="tab-orders" class="section active">
    <div class="card">
      <div class="section-tools section-tools-wrap">
        <div><h2>注文</h2><p class="section-description">最近の注文を確認できます</p></div>
        <div class="filter-group" role="group" aria-label="注文状態で絞り込み">
          <a class="filter-button${filter === "active" ? " active" : ""}" data-order-filter="active" href="/admin/orders?status=active" ${filter === "active" ? 'aria-current="page"' : ""}>対応中</a>
          <a class="filter-button${filter === "completed" ? " active" : ""}" data-order-filter="completed" href="/admin/orders?status=completed" ${filter === "completed" ? 'aria-current="page"' : ""}>完了</a>
          <a class="filter-button${filter === "all" ? " active" : ""}" data-order-filter="all" href="/admin/orders?status=all" ${filter === "all" ? 'aria-current="page"' : ""}>すべて</a>
        </div>
      </div>
      <div class="table-wrap"><table class="order-table">
        <thead><tr><th>受付番号</th><th>商品</th><th>状態</th><th>日時</th><th>詳細</th></tr></thead>
        <tbody>${orders.map(order => `<tr data-order-status="${escapeHtml(order.status)}">
          <td class="order-number">${config.displayNumberPad(order.display_number)}</td>
          <td class="order-items">${escapeHtml(order.items)}</td>
          <td><span class="badge ${statusColors[order.status] || "badge-gray"}">${escapeHtml(statusLabels[order.status] || order.status)}</span></td>
          <td class="muted">${formatDateTime(order.created_at)}</td>
          <td><a href="/order/${encodeURIComponent(order.token)}" target="_blank" rel="noopener noreferrer" class="detail-link">詳細</a></td>
        </tr>`).join("")}</tbody>
      </table>${orders.length ? "" : '<p class="empty-state" data-order-empty>該当する注文はありません</p>'}</div>
      ${renderPagination(pageState.pagination)}
    </div>
  </div>`;
}
