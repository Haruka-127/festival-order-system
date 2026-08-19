import { config } from "../config";
import { pageDocument } from "./layout";
import { formatDateTime } from "../services/time";

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

export function customerPage(order: OrderData, token: string, _securityNonce = ""): string {
  const fulfillments = normalizeFulfillments(order);
return pageDocument({
    title: "注文状況 - 文化祭",
    viewport: "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no",
    stylesheet: "customer",
    script: "customer",
    bodyAttributes: { "data-order-token": token },
    content: `
<main class="card">
  <div class="label">受付番号</div><div class="number">${config.displayNumberPad(order.display_number)}</div>
  <div id="overall" class="overall ${escapeHtml(order.status)}">${escapeHtml(statusLabels[order.status] ?? order.status)}</div>
  <div id="fulfillments">${renderFulfillments(fulfillments)}</div>
  <div class="time">ご注文日時: ${formatDateTime(order.created_at)}</div>
  <div id="connection" class="connection">接続中</div>
</main>
    `,
  });
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
