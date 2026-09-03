export {};

type CartDraft = { items?: [number, number][]; requestId?: string | null; signature?: string };
type OrderItem = { name: string; quantity: number };
type Fulfillment = { id: string; location_name: string; status: string; items: OrderItem[] };
type StaffOrder = {
  id: string; display_number: number; display_number_date?: string; status: string; items?: OrderItem[]; fulfillments?: Fulfillment[];
};
type StaffItem = { id: number; name: string; sold_out: number; location_name?: string };

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string | number): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

let savedDraft: CartDraft | null = null;
try { savedDraft = JSON.parse(sessionStorage.getItem("staff-order-draft") || "null") as CartDraft | null; } catch {}
const cart = new Map<number, number>(Array.isArray(savedDraft?.items) ? savedDraft.items : []);
let submitting = false;
let pendingRequestId = savedDraft?.requestId ?? null;
let pendingPayloadSignature = savedDraft?.signature ?? "";
const currentDate = document.body.dataset.currentDate ?? "";
let currentFilter = "all";

function showEmpty(container: HTMLElement, message: string): void {
  container.replaceChildren(createElement("div", "empty-orders", message));
}

function fulfillmentLine(fulfillment: Fulfillment): HTMLElement {
  const line = createElement("div", "fulfillment-line");
  line.append(createElement("strong", "", fulfillment.location_name));
  const status = fulfillment.status === "preparing" ? "準備中" : fulfillment.status === "ready" ? "提供可能" : fulfillment.status === "handed_over" ? "受渡済" : "キャンセル";
  line.append(" ", createElement("span", "fulfillment-status", status), document.createElement("br"));
  line.append(fulfillment.items.map(item => `${item.name} x${item.quantity}`).join(", "));
  return line;
}

function saveDraft(): void {
  if (cart.size === 0 && !pendingRequestId) { sessionStorage.removeItem("staff-order-draft"); return; }
  sessionStorage.setItem("staff-order-draft", JSON.stringify({ items: [...cart.entries()], requestId: pendingRequestId, signature: pendingPayloadSignature }));
}

function invalidatePendingRequest(): void {
  pendingRequestId = null;
  pendingPayloadSignature = "";
  saveDraft();
}

function addToCart(id: number): void {
  if (submitting) return;
  cart.set(id, (cart.get(id) ?? 0) + 1);
  invalidatePendingRequest();
  updateCart();
}

function changeQty(id: number, delta: number): void {
  const next = (cart.get(id) ?? 0) + delta;
  if (next <= 0) cart.delete(id); else cart.set(id, next);
  invalidatePendingRequest();
  updateCart();
}

function updateCart(): void {
  const container = requiredElement("cart-items");
  const total = requiredElement("cart-total");
  const submitButton = requiredElement<HTMLButtonElement>("submit-order");
  const entries = [...cart.entries()];
  document.querySelectorAll<HTMLButtonElement>(".menu-btn").forEach(button => {
    const id = Number(button.dataset.id);
    const quantity = cart.get(id) ?? 0;
    const badge = document.getElementById(`badge-${id}`);
    button.classList.toggle("selected", quantity > 0);
    if (badge) { badge.textContent = String(quantity); badge.hidden = quantity === 0; }
  });
  if (!entries.length) {
    showEmpty(container, "商品を選択してください");
    total.hidden = true;
    requiredElement("cart-count").textContent = "0点";
    requiredElement("cart-summary-count").textContent = "0点";
    submitButton.disabled = true;
    return;
  }
  let count = 0;
  const rows = entries.map(([id, quantity]) => {
    const name = document.querySelector<HTMLElement>(`.menu-btn[data-id="${id}"]`)?.dataset.name ?? "商品";
    count += quantity;
    const row = createElement("div", "cart-item");
    const controls = createElement("div", "cart-qty");
    const decrease = createElement("button", "", "−"); decrease.dataset.changeItemId = String(id); decrease.dataset.delta = "-1";
    const increase = createElement("button", "", "+"); increase.dataset.changeItemId = String(id); increase.dataset.delta = "1";
    controls.append(decrease, createElement("span", "", quantity), increase);
    row.append(createElement("span", "", name), controls);
    return row;
  });
  container.replaceChildren(...rows);
  total.hidden = false;
  requiredElement("cart-count").textContent = `${count}点`;
  requiredElement("cart-summary-count").textContent = `${count}点`;
  submitButton.disabled = submitting;
}

function padNumber(value: number): string {
  return String(value).padStart(Number(document.body.dataset.displayDigits ?? "3"), "0");
}

function showToast(message: string): void {
  const toast = createElement("div", "toast", message);
  requiredElement("toast-container").append(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function submitOrder(): Promise<void> {
  if (submitting || cart.size === 0) return;
  submitting = true;
  const button = requiredElement<HTMLButtonElement>("submit-order");
  button.disabled = true;
  button.textContent = "送信中...";
  try {
    const items = [...cart.entries()].map(([id, quantity]) => ({ item_id: id, quantity }));
    const signature = JSON.stringify(items);
    if (!pendingRequestId || pendingPayloadSignature !== signature) {
      pendingRequestId = crypto.randomUUID();
      pendingPayloadSignature = signature;
      saveDraft();
    }
    const response = await fetch("/api/staff/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, client_request_id: pendingRequestId }) });
    if (response.status === 401) { location.href = "/login"; return; }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "エラーが発生しました" })) as { error?: string };
      showToast(error.error ?? "エラーが発生しました");
      return;
    }
    const data = await response.json() as { display_number: number };
    cart.clear();
    invalidatePendingRequest();
    updateCart();
    const closeButton = createElement("button", "btn btn-primary modal-close-button", "閉じる");
    closeButton.dataset.action = "close-modal";
    requiredElement("modal-body").replaceChildren(
      createElement("div", "text-lg font-bold", "注文を受け付けました"), createElement("div", "big-num", padNumber(data.display_number)),
      createElement("div", "modal-label", "受付番号"), createElement("div", "modal-help", "受付番号をお客様へお伝えください"), closeButton,
    );
    requiredElement("modal").hidden = false;
    await refreshOrders();
  } catch {
    showToast("通信エラーが発生しました");
  } finally {
    submitting = false;
    button.disabled = cart.size === 0;
    button.textContent = "注文を確定する";
  }
}

function closeModal(event?: Event): void {
  const modal = requiredElement("modal");
  if (event && event.target !== modal) return;
  modal.hidden = true;
}

function applyOrderFilter(): void {
  document.querySelectorAll<HTMLElement>(".order-card").forEach(card => {
    card.hidden = currentFilter !== "all" && card.dataset.status !== currentFilter;
  });
}

function filterOrders(filter: string): void {
  currentFilter = filter;
  document.querySelectorAll<HTMLElement>("#order-tabs .tab").forEach(tab => {
    const active = tab.dataset.filter === filter;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  applyOrderFilter();
}

function filterItems(query: string): void {
  document.querySelectorAll<HTMLButtonElement>(".menu-btn").forEach(button => {
    button.hidden = !(button.dataset.name ?? "").toLowerCase().includes(query.toLowerCase());
  });
}

async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  if (status !== "cancelled" || !confirm("この注文全体をキャンセルしますか？")) return;
  const reason = prompt("キャンセル理由を入力してください（200文字以内）", "お客様都合");
  if (reason === null) return;
  if (!reason.trim() || reason.trim().length > 200) { showToast("キャンセル理由を200文字以内で入力してください"); return; }
  const buttons = document.querySelectorAll<HTMLButtonElement>(`button[data-order-id="${CSS.escape(orderId)}"]`);
  buttons.forEach(button => button.disabled = true);
  try {
    const response = await fetch(`/api/staff/orders/${encodeURIComponent(orderId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason: reason.trim() }) });
    if (response.status === 401) { location.href = "/login"; return; }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "エラー" })) as { error?: string };
      showToast(error.error ?? "操作に失敗しました");
      return;
    }
    await refreshOrders();
  } catch {
    showToast("通信エラーが発生しました");
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

async function refreshOrders(): Promise<void> {
  try {
    const response = await fetch("/api/staff/orders");
    if (response.status === 401) { location.href = "/login"; return; }
    if (!response.ok) return;
    const orders = await response.json() as StaffOrder[];
    const container = requiredElement("order-list");
    if (!orders.length) { showEmpty(container, "現在、注文はありません"); return; }
    const cards = orders.map(order => {
      const fulfillments = order.fulfillments ?? [{ id: order.id, location_name: "既定提供場所", status: order.status === "available" ? "ready" : order.status, items: order.items ?? [] }];
      const statusClass = order.status === "preparing" ? "status-preparing" : order.status === "available" ? "status-available" : order.status === "delivered" ? "status-delivered" : "status-cancelled";
      const hasReady = fulfillments.some(fulfillment => fulfillment.status === "ready" || fulfillment.status === "handed_over");
      const statusLabel = order.status === "available" ? "全ブース提供可能" : hasReady ? "一部提供可能" : "準備中";
      const card = createElement("div", `order-card${order.status === "available" ? " available" : ""}`); card.dataset.status = order.status;
      const header = createElement("div", "order-header"); header.append(createElement("span", "order-num", padNumber(order.display_number)));
      if (order.display_number_date && order.display_number_date !== currentDate) header.append(createElement("span", "panel-note", `${order.display_number_date}受付`));
      header.append(createElement("span", `badge ${statusClass}`, statusLabel));
      const items = createElement("div", "order-items"); items.append(...fulfillments.map(fulfillmentLine));
      const cancel = createElement("button", "btn-cancel", "注文をキャンセル"); cancel.dataset.orderId = order.id; cancel.dataset.orderStatus = "cancelled";
      const actions = createElement("div", "order-actions"); actions.append(cancel); card.append(header, items, actions);
      return card;
    });
    container.replaceChildren(...cards);
    requiredElement("last-updated").textContent = `最終更新 ${new Date().toLocaleTimeString("ja-JP")}`;
    applyOrderFilter();
  } catch {
    requiredElement("last-updated").textContent = "通信を再確認中";
  }
}

async function refreshItems(): Promise<void> {
  try {
    const response = await fetch("/api/staff/items");
    if (response.status === 401) { location.href = "/login"; return; }
    if (!response.ok) return;
    const items = await response.json() as StaffItem[];
    const orderableIds = new Set(items.filter(item => !item.sold_out).map(item => item.id));
    let removed = false;
    for (const id of [...cart.keys()]) if (!orderableIds.has(id)) { cart.delete(id); removed = true; }
    if (removed) { invalidatePendingRequest(); showToast("販売状態が変わった商品をカートから外しました"); }
    const buttons = items.map((item, index) => {
      const key = index < 9 ? index + 1 : 0;
      const button = createElement("button", `menu-btn${item.sold_out ? " sold-out" : ""}`);
      button.dataset.id = String(item.id); button.dataset.name = item.name; button.dataset.key = String(key); button.dataset.addItemId = String(item.id); button.disabled = Boolean(item.sold_out);
      button.append(createElement("span", "key-hint", key), item.name, createElement("span", "item-location", item.location_name ?? "既定提供場所"));
      if (item.sold_out) button.append(createElement("span", "soldout-label", "売り切れ"));
      const badge = createElement("span", "cart-badge", "0"); badge.id = `badge-${item.id}`; badge.hidden = true; button.append(badge);
      return button;
    });
    requiredElement("menu-grid").replaceChildren(...buttons);
    updateCart();
    filterItems(requiredElement<HTMLInputElement>("item-search").value);
  } catch {
    requiredElement("last-updated").textContent = "通信を再確認中";
  }
}

document.addEventListener("keydown", event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
  if (!requiredElement("modal").hidden) { if (event.key === "Enter") closeModal(); return; }
  if (event.key === "Enter") { if (cart.size > 0 && !submitting) void submitOrder(); return; }
  const key = Number.parseInt(event.key);
  if (!Number.isNaN(key)) {
    const target = document.querySelector<HTMLButtonElement>(`.menu-btn[data-key="${key}"]:not(.sold-out)`);
    if (target?.dataset.id) addToCart(Number(target.dataset.id));
  }
});
document.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
  if (button?.dataset.addItemId) addToCart(Number(button.dataset.addItemId));
  else if (button?.dataset.changeItemId) changeQty(Number(button.dataset.changeItemId), Number(button.dataset.delta));
  else if (button?.dataset.orderId && button.dataset.orderStatus) void updateOrderStatus(button.dataset.orderId, button.dataset.orderStatus);
  else if (button?.dataset.filter) filterOrders(button.dataset.filter);
  else if (button?.dataset.action === "submit-order") void submitOrder();
  else if (button?.dataset.action === "close-modal") closeModal();
  else if (event.target === requiredElement("modal")) closeModal();
});
requiredElement<HTMLInputElement>("item-search").addEventListener("input", event => filterItems((event.target as HTMLInputElement).value));
setInterval(refreshOrders, 5000);
setInterval(refreshItems, 5000);
updateCart();
