export {};

type BoardEntry = { fulfillment_id: string; display_number: number; display_number_date?: string };
type BoardLocation = { id: number; name: string; waiting: BoardEntry[]; calling: BoardEntry[] };
type Board = { locations: BoardLocation[] };
type LocatedEntry = BoardEntry & { location_id: number; location_name: string };

const PAGE_SIZE = 10;
const PAGE_INTERVAL = 8000;
const CONNECTED_SYNC_INTERVAL = 60_000;
const DISCONNECTED_SYNC_INTERVAL = 15_000;
let socket: WebSocket | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let board: Board = { locations: [] };
let knownKeys = new Set<string>();
let newIds = new Set<string>();
let waitingPage = 0;
let callingPage = 0;
let reconnectDelay = 3000;
const currentDate = document.body.dataset.currentDate ?? "";
const digits = Number(document.body.dataset.displayDigits ?? "3");

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

const pad = (value: number): string => String(value).padStart(digits, "0");

function flatten(key: "waiting" | "calling"): LocatedEntry[] {
  return board.locations.flatMap(location => location[key].map(entry => ({ ...entry, location_id: location.id, location_name: location.name })));
}

function renderColumn(elementId: string, entries: LocatedEntry[], currentPage: number): void {
  const root = requiredElement(elementId);
  const visible = entries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  root.classList.toggle("dense", visible.length > 7);
  if (!visible.length) { root.replaceChildren(); return; }
  const groups: { id: number; name: string; entries: LocatedEntry[] }[] = [];
  for (const entry of visible) {
    let group = groups.at(-1);
    if (!group || group.id !== entry.location_id) {
      group = { id: entry.location_id, name: entry.location_name, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  root.replaceChildren(...groups.map(group => {
    const section = document.createElement("section"); section.className = "location";
    const heading = document.createElement("h2"); heading.className = "location-name"; heading.textContent = group.name;
    const numbers = document.createElement("div"); numbers.className = "numbers";
    for (const entry of group.entries) {
      const number = document.createElement("div"); number.className = `number${newIds.has(entry.fulfillment_id) ? " new" : ""}`; number.dataset.id = entry.fulfillment_id; number.append(pad(entry.display_number));
      if (entry.display_number_date && entry.display_number_date !== currentDate) {
        const date = document.createElement("span"); date.className = "date-label"; date.textContent = entry.display_number_date; number.append(date);
      }
      numbers.append(number);
    }
    section.append(heading, numbers);
    return section;
  }));
}

function render(): void {
  const waiting = flatten("waiting");
  const calling = flatten("calling");
  const waitingPages = Math.max(1, Math.ceil(waiting.length / PAGE_SIZE));
  const callingPages = Math.max(1, Math.ceil(calling.length / PAGE_SIZE));
  if (waitingPage >= waitingPages) waitingPage = 0;
  if (callingPage >= callingPages) callingPage = 0;
  renderColumn("waiting", waiting, waitingPage);
  renderColumn("calling", calling, callingPage);
  const indicators: string[] = [];
  if (waitingPages > 1) indicators.push(`待 ${waitingPage + 1}/${waitingPages}`);
  if (callingPages > 1) indicators.push(`呼 ${callingPage + 1}/${callingPages}`);
  requiredElement("page").textContent = indicators.join(" ・ ");
  newIds.clear();
}

function applyBoard(next: Board, animate = true): void {
  const nextKeys = new Set<string>();
  for (const location of next.locations) for (const key of ["waiting", "calling"] as const) for (const entry of location[key]) nextKeys.add(`${key}:${entry.fulfillment_id}`);
  newIds = animate ? new Set([...nextKeys].filter(key => !knownKeys.has(key)).map(key => key.slice(key.indexOf(":") + 1))) : new Set();
  knownKeys = nextKeys;
  board = next;
  render();
}

function setConnection(message: string, offline: boolean): void {
  const element = requiredElement("connection");
  element.textContent = `${message} ${new Date().toLocaleTimeString("ja-JP")}`;
  element.classList.toggle("offline", offline);
}

function scheduleSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  const interval = socket?.readyState === WebSocket.OPEN ? CONNECTED_SYNC_INTERVAL : DISCONNECTED_SYNC_INTERVAL;
  syncTimer = setTimeout(load, interval);
}

async function load(): Promise<void> {
  try {
    const response = await fetch("/api/monitor/board");
    if (response.ok) {
      const next = await response.json() as Board;
      applyBoard({ locations: Array.isArray(next.locations) ? next.locations : [] }, knownKeys.size > 0);
      setConnection(socket?.readyState === WebSocket.OPEN ? "リアルタイム接続済み" : "同期済み", false);
    }
  } catch {
    setConnection("オフライン・再接続中", true);
  } finally {
    scheduleSync();
  }
}

function connect(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws/monitor`);
  socket.onopen = () => { reconnectDelay = 3000; setConnection("リアルタイム接続済み", false); scheduleSync(); };
  socket.onmessage = event => {
    try {
      const data = JSON.parse(String(event.data)) as { type?: string; locations?: BoardLocation[] };
      if (data.type === "monitor_update") applyBoard({ locations: Array.isArray(data.locations) ? data.locations : [] });
    } catch (error) {
      console.warn("Invalid monitor WebSocket message", error);
    }
  };
  socket.onclose = () => {
    socket = null;
    setConnection("再接続中", true);
    scheduleSync();
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  };
  socket.onerror = () => socket?.close();
}

setInterval(() => {
  const waitingPages = Math.max(1, Math.ceil(flatten("waiting").length / PAGE_SIZE));
  const callingPages = Math.max(1, Math.ceil(flatten("calling").length / PAGE_SIZE));
  if (waitingPages > 1) waitingPage = (waitingPage + 1) % waitingPages;
  if (callingPages > 1) callingPage = (callingPage + 1) % callingPages;
  if (waitingPages > 1 || callingPages > 1) render();
}, PAGE_INTERVAL);
void load().then(connect);
