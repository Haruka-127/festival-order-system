export {};

type Fulfillment = { location_name: string; status: string; items: { name: string; quantity: number }[] };
type OrderUpdate = { status: string; fulfillments: Fulfillment[] };

const overallLabels: Record<string, string> = { preparing: "準備中です", partially_ready: "一部の商品を受け取れます", available: "すべての商品を受け取れます", delivered: "受け渡しが完了しました", cancelled: "キャンセルされました" };
const fulfillmentLabels: Record<string, string> = { preparing: "準備中", ready: "提供可能", handed_over: "受渡済み", cancelled: "キャンセル" };
const token = document.body.dataset.orderToken ?? "";
let socket: WebSocket | null = null;
let reconnectDelay = 3000;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function fulfillmentElement(fulfillment: Fulfillment): HTMLElement {
  const section = document.createElement("section");
  section.className = "location";
  const head = document.createElement("div");
  head.className = "location-head";
  const name = document.createElement("div");
  name.className = "location-name";
  name.textContent = fulfillment.location_name;
  const status = document.createElement("div");
  status.className = `status ${fulfillment.status}`;
  status.textContent = fulfillmentLabels[fulfillment.status] ?? fulfillment.status;
  head.append(name, status);
  section.append(head);
  for (const item of fulfillment.items ?? []) {
    const row = document.createElement("div");
    row.className = "item";
    const label = document.createElement("span");
    label.textContent = item.name;
    const quantity = document.createElement("strong");
    quantity.textContent = `×${item.quantity}`;
    row.append(label, quantity);
    section.append(row);
  }
  return section;
}

function render(data: OrderUpdate): void {
  const overall = requiredElement("overall");
  overall.className = `overall ${data.status}`;
  overall.textContent = overallLabels[data.status] ?? data.status;
  requiredElement("fulfillments").replaceChildren(...(data.fulfillments ?? []).map(fulfillmentElement));
}

function setConnection(message: string, offline: boolean): void {
  const element = requiredElement("connection");
  element.textContent = `${message} ${new Date().toLocaleTimeString("ja-JP")}`;
  element.classList.toggle("offline", offline);
}

async function load(): Promise<void> {
  try {
    const response = await fetch(`/api/order/${encodeURIComponent(token)}`);
    if (response.ok) { render(await response.json() as OrderUpdate); setConnection("同期済み", false); }
  } catch { setConnection("オフライン・再接続中", true); }
  finally { scheduleSync(); }
}

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(load, socket?.readyState === WebSocket.OPEN ? 60_000 : 15_000);
}

function connect(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws/order/${encodeURIComponent(token)}`);
  socket.onopen = () => { reconnectDelay = 3000; setConnection("リアルタイム接続済み", false); scheduleSync(); };
  socket.onmessage = event => {
    try {
      const data = JSON.parse(String(event.data)) as OrderUpdate & { type?: string };
      if (data.type === "order_update") render(data);
    } catch (error) { console.warn("Invalid order WebSocket message", error); }
  };
  socket.onclose = () => { socket = null; setConnection("再接続中", true); scheduleSync(); setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); };
  socket.onerror = () => socket?.close();
}

void load().then(connect);
