import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { closeDb, getAll, getDb, getOne, runSql } from "../src/db/database";
import { getOrderArchive, getOrderGeneration, getResetPreview, readOrderArchive } from "../src/services/order-archives";
import { createDatabaseBackup, writeDatabaseSnapshot } from "../src/services/backup";
import { wsManager } from "../src/services/websocket";
import { cleanupTestDb, setupTestDb } from "./setup";

const app = createApp();
const root = "/admin/settings/archives";
const api = "/api/admin/order-history";
const orderTables = ["orders", "order_items", "order_fulfillments", "fulfillment_events", "fulfilled_item_sales", "daily_item_usage", "number_sequences"];
const archivePath = (id: string) => `${config.dataDir}/order-archives/${id}.db`;
const count = (table: string, db = getDb()) => getOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${table}`)!.count;

function request(path: string, method = "GET", body?: unknown, session = "archive-admin", origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000${path}`, {
    method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: `session_id=${session}` },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual",
  });
}
const call = (path: string, method = "GET", body?: unknown, session?: string) => app.handle(request(path, method, body, session));
const resetRequest = () => ({ request_id: crypto.randomUUID(), revision: getResetPreview().revision, confirmation: "リセット" });

async function createOrder(requestId: string = crypto.randomUUID(), quantity = 2) {
  const response = await call("/api/staff/orders", "POST", {
    items: [{ item_id: 1, quantity }], client_request_id: requestId, order_generation: getOrderGeneration(),
  }, "archive-cashier");
  expect(response.status).toBe(201);
  return await response.json() as { id: string; token: string; display_number: number };
}

async function changeStatus(orderId: string, status: string) {
  const task = getOne<{ id: string }>(getDb(), "SELECT id FROM order_fulfillments WHERE order_id = ?", orderId)!;
  const response = await call(`/api/provider/fulfillments/${task.id}/status`, "PATCH", { status }, "archive-provider");
  expect(response.status).toBe(200);
}

beforeEach(async () => {
  const db = await setupTestDb();
  runSql(db, "INSERT INTO users (id, username, password_hash, role, staff_type, fulfillment_location_id) VALUES ('archive-provider', 'provider', 'unused', 'staff', 'provider', 1)");
  for (const [session, user] of [["archive-admin", "admin-id"], ["archive-cashier", "staff-id"], ["archive-provider", "archive-provider"]]) {
    runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')", session!, user!);
  }
});
afterEach(() => cleanupTestDb());

test("reset archives every order state, clears related counters and pushes empty boards while preserving configuration", async () => {
  const db = getDb();
  const completed = await createOrder();
  await changeStatus(completed.id, "ready");
  await changeStatus(completed.id, "handed_over");
  const ready = await createOrder();
  await changeStatus(ready.id, "ready");
  const preparing = await createOrder();
  const cancelled = await createOrder();
  expect((await call(`/api/staff/orders/${cancelled.id}/status`, "PATCH", { status: "cancelled", reason: "注文変更" }, "archive-cashier")).status).toBe(200);
  runSql(db, "INSERT INTO audit_events (event_type, actor_username, details) VALUES ('admin_action', 'admin', '{\"action\":\"item_created\"}')");
  const saved = new Map(orderTables.map(table => [table, getAll(db, `SELECT * FROM ${table} ORDER BY rowid`)]));
  const users = getAll(db, "SELECT * FROM users ORDER BY id");
  const items = getAll(db, "SELECT * FROM items ORDER BY id");
  const settings = getOne<Record<string, unknown>>(db, "SELECT * FROM app_settings")!;
  const locations = getAll(db, "SELECT * FROM fulfillment_locations");
  const notifications: string[] = [];
  const monitor = { readyState: 1, send: (message: string) => notifications.push(message) } as any;
  const provider = { readyState: 1, send: (message: string) => notifications.push(message) } as any;
  const customer = { readyState: 1, send: (message: string) => notifications.push(message) } as any;
  wsManager.addMonitor(monitor);
  wsManager.addProviderClient(1, provider);
  wsManager.addOrderClient(preparing.token, customer);
  const payload = resetRequest();
  try {
    const response = await call(`${api}/reset`, "POST", payload);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, archive_id: payload.request_id, duplicated: false });
  } finally {
    wsManager.remove(monitor); wsManager.remove(provider); wsManager.remove(customer);
  }
  for (const table of orderTables) expect(count(table)).toBe(0);
  expect(getAll(db, "PRAGMA foreign_key_check")).toEqual([]);
  expect(getAll(db, "SELECT * FROM users ORDER BY id")).toEqual(users);
  expect(getAll(db, "SELECT * FROM items ORDER BY id")).toEqual(items);
  expect(getAll(db, "SELECT * FROM fulfillment_locations")).toEqual(locations);
  expect(getOne<Record<string, unknown>>(db, "SELECT * FROM app_settings")).toEqual({ ...settings, order_generation: 1 });
  expect(getAll<{ event_type: string }>(db, "SELECT event_type FROM audit_events").every(event => event.event_type === "admin_action")).toBe(true);
  expect(getOne(db, "SELECT id FROM audit_events WHERE details LIKE '%order_history_reset%'")).not.toBeNull();
  const archive = getOrderArchive(payload.request_id)!;
  expect(archive.order_count).toBe(4);
  expect(archive.active_count).toBe(2);
  expect(statSync(archivePath(archive.id)).mode & 0o777).toBe(0o600);
  expect(statSync(`${config.dataDir}/order-archives`).mode & 0o777).toBe(0o700);
  readOrderArchive(archive, snapshot => {
    for (const table of orderTables) expect(getAll(snapshot, `SELECT * FROM ${table} ORDER BY rowid`)).toEqual(saved.get(table)!);
    expect(() => snapshot.exec("DELETE FROM orders")).toThrow();
  });
  expect(notifications.some(message => message.includes('"type":"order_reset"'))).toBe(true);
  expect(notifications.some(message => message.includes('"tasks":[]'))).toBe(true);
  expect(notifications.some(message => message.includes('"waiting":[],"calling":[]'))).toBe(true);
  expect((await call(`/api/order/${preparing.token}`)).status).toBe(404);
  const newOrder = await createOrder();
  expect(newOrder.display_number).toBe(1);
  expect((await call("/api/staff/orders", "GET", undefined, "archive-cashier")).headers.get("X-Order-Generation")).toBe("1");
  expect((await call("/api/provider/fulfillments", "GET", undefined, "archive-provider")).headers.get("X-Order-Generation")).toBe("1");
  expect((await (await call("/api/monitor/board")).json() as { order_generation: number }).order_generation).toBe(1);
  closeDb();
  expect(getOrderArchive(archive.id)?.order_count).toBe(4);
  expect(getOrderGeneration()).toBe(1);
});

test("archive pages use the saved data, escape names, paginate, and never link to live customer tokens", async () => {
  const db = getDb();
  runSql(db, "UPDATE items SET name = ? WHERE id = 1", '<img src=x onerror="alert(1)">');
  const order = await createOrder();
  await changeStatus(order.id, "ready");
  await changeStatus(order.id, "handed_over");
  const payload = resetRequest();
  expect((await call(`${api}/reset`, "POST", payload)).status).toBe(200);
  const fileBefore = readFileSync(archivePath(payload.request_id));
  runSql(db, "UPDATE items SET name = '変更後の商品' WHERE id = 1");
  runSql(db, "UPDATE fulfillment_locations SET name = '変更後の場所' WHERE id = 1");
  const index = await (await call(root)).text();
  expect(index).toContain(payload.request_id);
  const list = await (await call(`${root}/${payload.request_id}`)).text();
  expect(list).toContain("&lt;img");
  expect(list).not.toContain("<img src=x");
  expect(list).not.toContain(order.token);
  expect(list).toContain(`<strong>2点</strong>`);
  const detail = await (await call(`${root}/${payload.request_id}/orders/${order.id}`)).text();
  expect(detail).toContain("既定提供場所");
  expect(detail).toContain("staff1");
  expect(detail).toContain("&lt;img");
  expect(detail).not.toContain("変更後の場所");
  expect(detail).not.toContain("変更後の商品");
  expect(detail).toContain("提供可能 → 受渡済");
  const history = await (await call(`${root}/${payload.request_id}/history`)).text();
  expect(history).toContain("注文作成");
  expect(readFileSync(archivePath(payload.request_id))).toEqual(fileBefore);
  expect((await call(`${root}/${payload.request_id}/orders/missing`)).status).toBe(404);
});

test("a failed archive write or failed reset transaction leaves all live order data intact", async () => {
  await createOrder();
  const db = getDb();
  const before = new Map([...orderTables, "audit_events", "app_settings"].map(table => [table, getAll(db, `SELECT * FROM ${table} ORDER BY rowid`)]));
  const blockedDirectory = `${config.dataDir}/order-archives`;
  writeFileSync(blockedDirectory, "not a directory");
  expect((await call(`${api}/reset`, "POST", resetRequest())).status).toBe(503);
  unlinkSync(blockedDirectory);
  runSql(db, "CREATE TRIGGER fail_order_reset BEFORE DELETE ON orders BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  expect((await call(`${api}/reset`, "POST", resetRequest())).status).toBe(503);
  for (const [table, rows] of before) expect(getAll(db, `SELECT * FROM ${table} ORDER BY rowid`)).toEqual(rows);
  expect(count("order_archives")).toBe(0);
  expect(readdirSync(blockedDirectory)).toEqual([]);
  runSql(db, "DROP TRIGGER fail_order_reset");
  expect((await call(`${api}/reset`, "POST", resetRequest())).status).toBe(200);
});

test("changes after preview invalidate confirmation, and duplicate reset requests preserve newer orders", async () => {
  const old = await createOrder("retry-order-0001");
  const outdated = resetRequest();
  await changeStatus(old.id, "ready");
  expect((await call(`${api}/reset`, "POST", outdated)).status).toBe(409);
  expect(count("orders")).toBe(1);
  expect(count("order_archives")).toBe(0);
  const payload = resetRequest();
  expect((await call(`${api}/reset`, "POST", payload)).status).toBe(200);
  const staleOrder = await call("/api/staff/orders", "POST", { items: [{ item_id: 1, quantity: 2 }], client_request_id: "retry-order-0001" }, "archive-cashier");
  expect(staleOrder.status).toBe(409);
  expect((await staleOrder.json() as { code: string }).code).toBe("orders_reset");
  expect(count("orders")).toBe(0);
  const newer = await createOrder();
  const retried = await call(`${api}/reset`, "POST", payload);
  expect(retried.status).toBe(200);
  expect((await retried.json() as { duplicated: boolean }).duplicated).toBe(true);
  expect(count("orders")).toBe(1);
  expect(count("order_archives")).toBe(1);
  expect(getOne(getDb(), "SELECT id FROM orders WHERE id = ?", newer.id)).not.toBeNull();
});

test("archive and reset endpoints require current administrator access and explicit confirmation", async () => {
  await createOrder();
  const payload = resetRequest();
  for (const session of ["invalid-session", "archive-cashier", "archive-provider"]) {
    expect((await call(`${api}/reset`, "POST", payload, session)).status).toBe(session === "invalid-session" ? 401 : 403);
    expect((await call(`${api}/preview`, "GET", undefined, session)).status).toBe(session === "invalid-session" ? 401 : 403);
    expect((await call(root, "GET", undefined, session)).status).toBe(session === "invalid-session" ? 302 : 403);
  }
  expect((await call(`${api}/reset`, "POST", { ...payload, confirmation: "" })).status).toBe(400);
  expect((await app.handle(request(`${api}/reset`, "POST", payload, "archive-admin", "https://other.example"))).status).toBe(403);
  expect(count("orders")).toBe(1);
  expect((await call(`${api}/reset`, "POST", payload)).status).toBe(200);
  for (const path of [`${root}/${payload.request_id}`, `${root}/${payload.request_id}/history`, `${root}/${payload.request_id}/orders/missing`]) {
    expect((await call(path, "GET", undefined, "archive-cashier")).status).toBe(403);
  }
  runSql(getDb(), "DELETE FROM sessions WHERE id = 'archive-admin'");
  expect((await call(`${root}/${payload.request_id}`)).status).toBe(302);
  // The archived copy still contains the old admin session; it grants no access.
  const snapshot = new Database(archivePath(payload.request_id), { readonly: true });
  try { expect(snapshot.query("SELECT id FROM sessions WHERE id = 'archive-admin'").get()).toBeTruthy(); }
  finally { snapshot.close(); }
});

test("reset archives survive ordinary backup retention and report missing or unsupported files safely", async () => {
  await createOrder();
  const payload = resetRequest();
  expect((await call(`${api}/reset`, "POST", payload)).status).toBe(200);
  const originalRetention = config.backupRetentionCount;
  try {
    config.backupRetentionCount = 1;
    createDatabaseBackup(); createDatabaseBackup();
    expect(readdirSync(`${config.dataDir}/backups`)).toHaveLength(1);
    expect(existsSync(archivePath(payload.request_id))).toBe(true);
  } finally { config.backupRetentionCount = originalRetention; }
  expect((await call(`${root}/not-an-archive`)).status).toBe(404);
  expect((await call(`${root}/${crypto.randomUUID()}`)).status).toBe(404);
  runSql(getDb(), "UPDATE order_archives SET format_version = 999 WHERE id = ?", payload.request_id);
  expect((await call(`${root}/${payload.request_id}`)).status).toBe(503);
  runSql(getDb(), "UPDATE order_archives SET format_version = 1 WHERE id = ?", payload.request_id);
  unlinkSync(archivePath(payload.request_id));
  expect((await call(`${root}/${payload.request_id}`)).status).toBe(503);
  expect(existsSync(archivePath(payload.request_id))).toBe(false);
});

test("a retry recovers an unregistered archive file left before a reset commit", async () => {
  await createOrder();
  const payload = resetRequest();
  writeDatabaseSnapshot(getDb(), archivePath(payload.request_id));
  expect(count("order_archives")).toBe(0);
  expect((await call(`${api}/reset`, "POST", payload)).status).toBe(200);
  expect(count("orders")).toBe(0);
  expect(count("order_archives")).toBe(1);
  readOrderArchive(getOrderArchive(payload.request_id)!, db => expect(count("orders", db)).toBe(1));
});

test("two concurrent reset requests cannot reset twice and a stale creation cannot cross the reset", async () => {
  await createOrder();
  let payload = resetRequest();
  const requests = [
    call(`${api}/reset`, "POST", payload),
    call(`${api}/reset`, "POST", { ...payload, request_id: crypto.randomUUID() }),
    call("/api/staff/orders", "POST", { items: [{ item_id: 1, quantity: 1 }], order_generation: 0 }, "archive-cashier"),
  ];
  const responses = await Promise.all(requests);
  // Request parsing may schedule creation before either reset. In that case
  // both confirmations must be rejected, preserving the newly accepted order.
  let expectedArchivedOrders = 1;
  if (responses[2]!.status === 201) {
    expect(responses.slice(0, 2).map(response => response.status)).toEqual([409, 409]);
    expect(count("orders")).toBe(2);
    expect(count("order_archives")).toBe(0);
    expectedArchivedOrders = 2;
    payload = resetRequest();
    const second = await Promise.all([
      call(`${api}/reset`, "POST", payload),
      call(`${api}/reset`, "POST", { ...payload, request_id: crypto.randomUUID() }),
    ]);
    expect(second.map(response => response.status).sort()).toEqual([200, 409]);
  } else {
    expect(responses[2]!.status).toBe(409);
    expect(responses.slice(0, 2).map(response => response.status).sort()).toEqual([200, 409]);
  }
  expect(count("order_archives")).toBe(1);
  expect(count("orders")).toBe(0);
  const archiveId = getOne<{ id: string }>(getDb(), "SELECT id FROM order_archives")!.id;
  const archive = getOrderArchive(archiveId)!;
  readOrderArchive(archive, snapshot => expect(count("orders", snapshot)).toBe(expectedArchivedOrders));
});

test("reset also clears historical totals without remaining orders, and archives paginate orders and audit events", async () => {
  const db = getDb();
  for (let index = 0; index < 55; index++) {
    runSql(db, "INSERT INTO orders (id, display_number, display_number_date, status, token) VALUES (?, ?, '2026-01-01', 'delivered', ?)", `historic-${index}`, index + 1, `token-${index}`);
    runSql(db, "INSERT INTO audit_events (order_id, event_type, display_number) VALUES (?, 'order_created', ?)", `historic-${index}`, index + 1);
  }
  const payload = resetRequest();
  expect((await call(`${api}/reset`, "POST", payload)).status).toBe(200);
  const page = await (await call(`${root}/${payload.request_id}?status=completed&page=2`)).text();
  expect(page).toContain("2 / 2ページ");
  expect(page.match(/class="detail-link"/g)).toHaveLength(5);
  expect(await (await call(`${root}/${payload.request_id}/history?page=2`)).text()).toContain("2 / 2ページ");
  runSql(db, `INSERT INTO fulfilled_item_sales (fulfillment_id, order_id, item_id, item_name, quantity, sales_date, location_id, location_name, completed_at)
    VALUES ('removed-fulfillment', 'removed-order', 1, '削除済み注文の商品', 7, '2026-01-01', 1, '既定提供場所', '2026-01-01')`);
  runSql(db, "INSERT INTO daily_item_usage (usage_date, item_id, reserved_quantity) VALUES ('2026-01-01', 1, 7)");
  const second = resetRequest();
  expect((await call(`${api}/reset`, "POST", second)).status).toBe(200);
  expect(count("fulfilled_item_sales")).toBe(0);
  expect(count("daily_item_usage")).toBe(0);
  expect(getOrderGeneration()).toBe(2);
  expect(count("order_archives")).toBe(2);
  const secondPage = await (await call(`${root}/${second.request_id}`)).text();
  expect(secondPage).toContain("<strong>7点</strong>");
  expect(secondPage).toContain("削除済み注文の商品");
});
