import { paginateNumberGroups, type MeasuredNumberGroup, type NumberGroup, type NumberPage } from "./monitor-layout";
import { MonitorCallTracker, MonitorChime } from "./monitor-sound";

type BoardEntry = { fulfillment_id: string; display_number: number; display_number_date?: string };
type BoardLocation = { id: number; name: string; waiting: BoardEntry[]; calling: BoardEntry[] };
type Board = { locations: BoardLocation[]; order_generation?: number };
type ColumnKey = "waiting" | "calling";
type ColumnState = { pages: NumberPage<BoardEntry>[]; page: number };

const PAGE_INTERVAL = 8000;
const CONNECTED_SYNC_INTERVAL = 60_000;
const DISCONNECTED_SYNC_INTERVAL = 15_000;
let socket: WebSocket | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let board: Board = { locations: [] };
let knownKeys = new Set<string>();
let newIds = new Set<string>();
const columns: Record<ColumnKey, ColumnState> = {
  waiting: { pages: [], page: 0 }, calling: { pages: [], page: 0 },
};
const narrowScreen = window.matchMedia("(max-width: 640px)");
let layoutFrame: number | null = null;
let reconnectDelay = 3000;
let snapshotVersion = 0;
const currentDate = document.body.dataset.currentDate ?? "";
const digits = Number(document.body.dataset.displayDigits ?? "3");

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

const pad = (value: number): string => String(value).padStart(digits, "0");
const callTracker = new MonitorCallTracker();
const soundNotice = requiredElement("monitor-sound-notice");
const soundMessage = requiredElement("monitor-sound-message");
const soundEnable = requiredElement("monitor-sound-enable") as HTMLButtonElement;
const chime = new MonitorChime(requiredElement("monitor-chime") as HTMLAudioElement, state => {
  soundNotice.hidden = state === "ready";
  soundEnable.disabled = state === "retrying";
  soundEnable.textContent = state === "unavailable" ? "呼び出し音を再試行" : "呼び出し音を有効にする";
  soundMessage.textContent = state === "blocked"
    ? "ブラウザが呼び出し音の自動再生を制限しています。有効にすると確認音が1回鳴ります。"
    : state === "unavailable"
      ? "呼び出し音を再生できませんでした。通信状況を確認して再試行してください。"
      : state === "retrying" ? "確認音を再生しています…" : "";
});
soundEnable.addEventListener("click", () => chime.retry());

function groupsFor(key: ColumnKey): NumberGroup<BoardEntry>[] {
  return board.locations.filter(location => location[key].length).map(location => ({
    id: location.id, name: location.name,
    entries: [...location[key]].sort((left, right) =>
      (left.display_number_date ?? currentDate).localeCompare(right.display_number_date ?? currentDate)
      || left.display_number - right.display_number
      || left.fulfillment_id.localeCompare(right.fulfillment_id)),
  }));
}

function groupElement(group: NumberGroup<BoardEntry>, animate: boolean): HTMLElement {
  const section = document.createElement("section"); section.className = "location";
  const heading = document.createElement("h2"); heading.className = "location-name"; heading.textContent = group.name;
  const numbers = document.createElement("div"); numbers.className = "numbers";
  for (const entry of group.entries) {
    const number = document.createElement("div");
    number.className = `number${animate && newIds.has(entry.fulfillment_id) ? " new" : ""}`;
    number.dataset.id = entry.fulfillment_id;
    const label = document.createElement("span"); label.className = "number-label"; label.textContent = pad(entry.display_number);
    number.append(label);
    if (entry.display_number_date && entry.display_number_date !== currentDate) {
      const date = document.createElement("span"); date.className = "date-label"; date.textContent = entry.display_number_date;
      number.append(date);
    }
    numbers.append(number);
  }
  section.append(heading, numbers);
  return section;
}

function measureColumn(key: ColumnKey): void {
  const root = requiredElement(key);
  if (root.clientWidth === 0) return;
  const state = columns[key];
  const anchor = state.pages[state.page]?.groups[0]?.entries[0]?.fulfillment_id;
  const groups = groupsFor(key);
  // Measure without animation, using exactly the same markup and styles as the
  // displayed page. Read and replace in one frame so all-data markup is not painted.
  root.classList.remove("is-overflowing");
  root.style.removeProperty("--number-font-size");
  root.style.removeProperty("--number-min-width");
  const sections = groups.map(group => groupElement(group, false));
  root.replaceChildren(...sections);
  if (!sections.length) { state.pages = [{ groups: [], height: 0, overflowing: false }]; state.page = 0; return; }
  const style = getComputedStyle(root);
  const width = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const labels = [...root.querySelectorAll<HTMLElement>(".number-label, .date-label")];
  const labelWidth = () => labels.reduce((maximum, label) => Math.max(maximum, label.getBoundingClientRect().width), 0);
  const widest = labelWidth();
  if (widest > width) {
    const fontSize = parseFloat(getComputedStyle(sections[0]!.querySelector(".numbers")!).fontSize);
    root.style.setProperty("--number-font-size", `${fontSize * Math.max(1, width - 2) / widest}px`);
  }
  root.style.setProperty("--number-min-width", `${Math.min(width, Math.ceil(labelWidth()) + 4)}px`);
  const measured = groups.map((group, groupIndex): MeasuredNumberGroup<BoardEntry> => {
    const section = sections[groupIndex]!;
    const numbers = section.querySelector<HTMLElement>(".numbers")!;
    const rows: MeasuredNumberGroup<BoardEntry>["rows"] = [];
    let previousTop = -Infinity;
    [...numbers.children].forEach((element, index) => {
      const rectangle = element.getBoundingClientRect();
      if (Math.abs(rectangle.top - previousTop) > 1) {
        rows.push({ entries: [], height: 0 });
        previousTop = rectangle.top;
      }
      const row = rows.at(-1)!;
      row.entries.push(group.entries[index]!);
      row.height = Math.max(row.height, rectangle.height);
    });
    return { id: group.id, name: group.name, headingHeight: numbers.getBoundingClientRect().top - section.getBoundingClientRect().top, rows };
  });
  const rowGap = parseFloat(getComputedStyle(sections[0]!.querySelector(".numbers")!).rowGap);
  // Narrow screens use the normal document scroll; desktop columns have a fixed
  // available height, including all heading, date-label and spacing costs.
  const height = narrowScreen.matches ? Infinity : Math.max(0, root.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 1);
  state.pages = paginateNumberGroups(measured, height, parseFloat(style.rowGap), rowGap);
  const anchoredPage = anchor ? state.pages.findIndex(page => page.groups.some(group => group.entries.some(entry => entry.fulfillment_id === anchor))) : -1;
  state.page = anchoredPage >= 0 ? anchoredPage : Math.min(state.page, state.pages.length - 1);
}

function renderPages(): void {
  const indicators: string[] = [];
  for (const key of ["waiting", "calling"] as const) {
    const state = columns[key];
    const page = state.pages[state.page];
    const root = requiredElement(key);
    root.classList.toggle("is-overflowing", page?.overflowing ?? false);
    root.replaceChildren(...(page?.groups ?? []).map(group => groupElement(group, true)));
    root.scrollTop = 0;
    if (state.pages.length > 1) {
      const total = board.locations.reduce((sum, location) => sum + location[key].length, 0);
      indicators.push(`${key === "waiting" ? "待" : "呼"} ${state.page + 1}/${state.pages.length}（全${total}件）`);
    }
  }
  requiredElement("page").textContent = indicators.join(" ・ ");
  newIds.clear();
}

function scheduleLayout(): void {
  if (layoutFrame !== null) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = null;
    measureColumn("waiting");
    measureColumn("calling");
    renderPages();
  });
}

function applyBoard(next: Board, animate = true, silent = false): void {
  if ((next.order_generation ?? 0) < (board.order_generation ?? 0)) return;
  snapshotVersion += 1;
  if ((next.order_generation ?? 0) > (board.order_generation ?? 0)) {
    for (const state of Object.values(columns)) { state.pages = []; state.page = 0; }
    chime.stop();
  }
  const shouldChime = callTracker.accept(next, silent);
  const nextKeys = new Set<string>();
  for (const location of next.locations) for (const key of ["waiting", "calling"] as const) for (const entry of location[key]) nextKeys.add(`${key}:${entry.fulfillment_id}`);
  newIds = animate ? new Set([...nextKeys].filter(key => !knownKeys.has(key)).map(key => key.slice(key.indexOf(":") + 1))) : new Set();
  knownKeys = nextKeys;
  board = next;
  scheduleLayout();
  if (shouldChime) chime.notify();
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
  const version = snapshotVersion;
  try {
    const response = await fetch("/api/monitor/board");
    if (response.ok) {
      const next = await response.json() as Board;
      // A polling response started before a WebSocket update must not restore
      // old waiting tasks and make the same transition ring a second time.
      if (version !== snapshotVersion) return;
      applyBoard({ locations: Array.isArray(next.locations) ? next.locations : [], order_generation: next.order_generation }, knownKeys.size > 0);
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
  const connection = new WebSocket(`${protocol}//${location.host}/ws/monitor`);
  socket = connection;
  let initialSnapshot = true;
  connection.onopen = () => {
    if (socket !== connection) return;
    snapshotVersion += 1;
    reconnectDelay = 3000; setConnection("リアルタイム接続済み", false); scheduleSync();
  };
  connection.onmessage = event => {
    if (socket !== connection) return;
    try {
      const data = JSON.parse(String(event.data)) as { type?: string; locations?: BoardLocation[]; order_generation?: number };
      if (data.type === "monitor_update") {
        applyBoard({ locations: Array.isArray(data.locations) ? data.locations : [], order_generation: data.order_generation }, true, initialSnapshot);
        initialSnapshot = false;
      }
    } catch (error) {
      console.warn("Invalid monitor WebSocket message", error);
    }
  };
  connection.onclose = () => {
    if (socket !== connection) return;
    socket = null;
    setConnection("再接続中", true);
    scheduleSync();
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  };
  connection.onerror = () => connection.close();
}

setInterval(() => {
  if (layoutFrame !== null) return;
  let changed = false;
  for (const state of Object.values(columns)) {
    if (state.pages.length > 1) { state.page = (state.page + 1) % state.pages.length; changed = true; }
  }
  if (changed) renderPages();
}, PAGE_INTERVAL);
const sizes = new Map<Element, string>();
const observer = new ResizeObserver(entries => {
  for (const entry of entries) {
    const size = `${entry.contentRect.width}:${narrowScreen.matches ? "auto" : entry.contentRect.height}`;
    if (sizes.get(entry.target) === size) continue;
    sizes.set(entry.target, size);
    scheduleLayout();
  }
});
observer.observe(requiredElement("waiting"));
observer.observe(requiredElement("calling"));
window.addEventListener("resize", scheduleLayout);
document.fonts.ready.then(scheduleLayout);
document.fonts.addEventListener("loadingdone", scheduleLayout);
void load().then(connect);
