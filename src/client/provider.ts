export {};

type TaskStatus = "preparing" | "ready" | "handed_over";
type Task = { id: string; display_number: number; display_number_date?: string; status: TaskStatus; items: { name: string; quantity: number }[] };
const pending = new Set<string>();
const currentDate = document.body.dataset.currentDate ?? "";
const digits = Number(document.body.dataset.displayDigits ?? "3");
let socket: WebSocket | null = null;
let reconnectDelay = 3000;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function actionButton(label: string, task: Task, status: TaskStatus, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `action ${className}`;
  button.dataset.id = task.id;
  button.dataset.status = status;
  button.textContent = label;
  return button;
}

function taskElement(task: Task): HTMLElement {
  const card = document.createElement("article");
  card.className = `card ${task.status === "ready" ? "ready-card" : task.status === "handed_over" ? "completed-card" : ""}`;
  const header = document.createElement("div");
  header.className = "task-head";
  const number = document.createElement("div");
  number.className = "number";
  number.textContent = String(task.display_number).padStart(digits, "0");
  const status = document.createElement("div");
  status.className = "badge";
  status.textContent = task.status === "ready" ? "お呼び出し中" : task.status === "handed_over" ? "受渡済み（2分間取消可）" : "準備中";
  const numberGroup = document.createElement("div");
  numberGroup.append(number);
  if (task.display_number_date && task.display_number_date !== currentDate) {
    const date = document.createElement("div"); date.className = "badge"; date.textContent = `${task.display_number_date}受付`; numberGroup.append(date);
  }
  header.append(numberGroup, status);
  const items = document.createElement("div"); items.className = "items";
  for (const item of task.items) {
    const row = document.createElement("div"); row.className = "item";
    const name = document.createElement("span"); name.textContent = item.name;
    const quantity = document.createElement("strong"); quantity.textContent = `×${item.quantity}`;
    row.append(name, quantity); items.append(row);
  }
  const actions = document.createElement("div"); actions.className = "card-actions";
  if (task.status === "preparing") actions.append(actionButton("提供可能にする", task, "ready", "ready"));
  else if (task.status === "ready") actions.append(actionButton("受渡完了", task, "handed_over", "done"), actionButton("準備中に戻す", task, "preparing", "undo"));
  else actions.append(actionButton("受渡完了を取り消す", task, "ready", "undo"));
  card.append(header, items, actions);
  return card;
}

function render(tasks: Task[]): void {
  const root = requiredElement("task-list");
  if (!tasks.length) {
    const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "現在、準備中の商品はありません"; root.replaceChildren(empty); return;
  }
  const grid = document.createElement("div"); grid.className = "grid"; grid.append(...tasks.map(taskElement)); root.replaceChildren(grid);
}

function setConnection(message: string, offline: boolean): void {
  const element = requiredElement("connection");
  element.textContent = `${message} ${new Date().toLocaleTimeString("ja-JP")}`;
  element.classList.toggle("offline", offline);
}

async function loadTasks(): Promise<void> {
  try {
    const response = await fetch("/api/provider/fulfillments");
    if (response.status === 401) { location.href = "/login"; return; }
    if (response.ok) { render(await response.json() as Task[]); setConnection("同期済み", false); }
  } catch { setConnection("オフライン・再接続中", true); }
  finally { scheduleSync(); }
}

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(loadTasks, socket?.readyState === WebSocket.OPEN ? 30_000 : 5_000);
}

async function updateStatus(id: string, status: TaskStatus): Promise<void> {
  if (pending.has(id) || (status === "handed_over" && !confirm("受付番号の受け渡しを完了しますか？"))) return;
  pending.add(id);
  document.querySelectorAll<HTMLButtonElement>(`button[data-id="${CSS.escape(id)}"]`).forEach(button => button.disabled = true);
  try {
    const response = await fetch(`/api/provider/fulfillments/${encodeURIComponent(id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.status === 401) { location.href = "/login"; return; }
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = data.error ?? "更新に失敗しました"; document.body.append(toast); setTimeout(() => toast.remove(), 3000);
    }
  } catch { setConnection("オフライン・更新を再確認してください", true); }
  finally { pending.delete(id); await loadTasks(); }
}

function connect(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws/provider`);
  socket.onopen = () => { reconnectDelay = 3000; setConnection("リアルタイム接続済み", false); scheduleSync(); };
  socket.onmessage = event => {
    try {
      const data = JSON.parse(String(event.data)) as { type?: string; tasks?: Task[] };
      if (data.type === "provider_update") render(data.tasks ?? []);
    } catch (error) { console.warn("Invalid provider WebSocket message", error); }
  };
  socket.onclose = () => { socket = null; setConnection("再接続中", true); scheduleSync(); setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); };
  socket.onerror = () => socket?.close();
}

document.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-id][data-status]") : null;
  if (button?.dataset.id && button.dataset.status) void updateStatus(button.dataset.id, button.dataset.status as TaskStatus);
});
void loadTasks().then(connect);
