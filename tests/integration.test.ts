import { afterAll, beforeAll, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { cleanupTestDb, setupTestDb } from "./setup";
import { getDb, getOne, runSql } from "../src/db/database";
import { todayDate } from "../src/services/numbering";
import { getMonitorBoard, recomputeOrderStatus } from "../src/services/fulfillment";
import { Database } from "bun:sqlite";
import { config } from "../src/config";

const app = createApp();
const origin = "http://localhost:3000";

function request(path: string, method = "GET", body?: unknown, sessionId?: string): Request {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (sessionId) headers.Cookie = `session_id=${sessionId}`;
  return new Request(`${origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}

beforeAll(async () => {
  const db = await setupTestDb();
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES ('integration-cashier', 'staff-id', '2099-01-01 00:00:00')");
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES ('integration-admin', 'admin-id', '2099-01-01 00:00:00')");
});

afterAll(() => cleanupTestDb());

test("health endpoints report liveness and database readiness", async () => {
  expect(await (await app.handle(request("/health/live"))).json()).toEqual({ status: "ok" });
  const ready = await app.handle(request("/health/ready"));
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({ status: "ready" });
});

test("unauthenticated API requests return JSON 401 instead of redirecting", async () => {
  const response = await app.handle(request("/api/staff/orders"));
  expect(response.status).toBe(401);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ error: "authentication_required" });
});

test("admin sections have stable paths", async () => {
  const root = await app.handle(request("/admin", "GET", undefined, "integration-admin"));
  expect(root.status).toBe(302);
  expect(root.headers.get("location")).toBe("/admin/items");

  const pages = [
    ["/admin/items", "items"],
    ["/admin/orders", "orders"],
    ["/admin/users", "users"],
    ["/admin/settings", "settings"],
    ["/admin/settings/locations", "locations"],
    ["/admin/settings/history", "history"],
    ["/admin/settings/advanced", "advanced"],
  ] as const;
  for (const [path, section] of pages) {
    const response = await app.handle(request(path, "GET", undefined, "integration-admin"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain(`id="tab-${section}" class="section active"`);
    expect(html.match(/id="tab-/g)).toHaveLength(1);
  }
});

test("advanced admin forms return to the advanced settings path", async () => {
  const response = await app.handle(request("/api/admin/password", "POST", {
    current_password: "",
    new_password: "short",
  }, "integration-admin"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/admin/settings/advanced");
});

test("reusing an order request id returns the original order without double reservation", async () => {
  const payload = { items: [{ item_id: 1, quantity: 2 }], client_request_id: "integration-request-0001" };
  const first = await app.handle(request("/api/staff/orders", "POST", payload, "integration-cashier"));
  expect(first.status).toBe(201);
  const firstBody = await first.json() as { id: string; display_number: number };

  const second = await app.handle(request("/api/staff/orders", "POST", payload, "integration-cashier"));
  expect(second.status).toBe(200);
  const secondBody = await second.json() as { id: string; duplicated: boolean };
  expect(secondBody.id).toBe(firstBody.id);
  expect(secondBody.duplicated).toBe(true);

  const db = getDb();
  expect(getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM orders WHERE client_request_id = ?", payload.client_request_id)?.count).toBe(1);
  expect(getOne<{ reserved_quantity: number }>(db, "SELECT reserved_quantity FROM daily_item_usage WHERE usage_date = ? AND item_id = 1", todayDate())?.reserved_quantity).toBe(2);
});

test("an order with handed-over items cannot be cancelled as a whole", async () => {
  const db = getDb();
  runSql(db, "INSERT INTO fulfillment_locations (id, name, slug, sort_order) VALUES (201, '統合テスト場所', 'integration-location', 201)");
  runSql(db, "INSERT INTO items (id, name, sort_order, fulfillment_location_id) VALUES (201, '統合テスト商品', 201, 201)");
  const payload = { items: [{ item_id: 1, quantity: 1 }, { item_id: 201, quantity: 1 }], client_request_id: "integration-request-0002" };
  const created = await app.handle(request("/api/staff/orders", "POST", payload, "integration-cashier"));
  expect(created.status).toBe(201);
  const order = await created.json() as { id: string };
  const handed = getOne<{ id: string }>(db, "SELECT id FROM order_fulfillments WHERE order_id = ? ORDER BY location_id LIMIT 1", order.id)!;
  runSql(db, "UPDATE order_fulfillments SET status = 'handed_over', handed_over_at = datetime('now') WHERE id = ?", handed.id);
  recomputeOrderStatus(db, order.id);

  const cancelled = await app.handle(request(`/api/staff/orders/${order.id}/status`, "PATCH", { status: "cancelled", reason: "統合テスト" }, "integration-cashier"));
  expect(cancelled.status).toBe(409);
  expect((await cancelled.json() as { error: string }).error).toContain("受け渡し済み");
  expect(getOne<{ status: string }>(db, "SELECT status FROM orders WHERE id = ?", order.id)?.status).toBe("preparing");
});

test("inactive locations with pending work remain on the monitor board", () => {
  const db = getDb();
  runSql(db, "UPDATE fulfillment_locations SET active = 0 WHERE id = 201");
  const location = getMonitorBoard(db).locations.find(item => item.id === 201);
  expect(location).toBeTruthy();
  expect((location?.waiting.length ?? 0) + (location?.calling.length ?? 0)).toBeGreaterThan(0);
  runSql(db, "UPDATE fulfillment_locations SET active = 1 WHERE id = 201");
});

test("a location with pending work cannot be stopped from the admin API", async () => {
  const db = getDb();
  const response = await app.handle(request("/api/admin/locations/201/toggle-active", "POST", {}, "integration-admin"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/admin/settings/locations");
  expect(getOne<{ active: number }>(db, "SELECT active FROM fulfillment_locations WHERE id = 201")?.active).toBe(1);
});

test("cleanup only removes terminal orders older than the retention period and keeps audit records", async () => {
  const db = getDb();
  runSql(db, "INSERT INTO orders (id, display_number, display_number_date, status, token, updated_at) VALUES ('old-terminal', 8001, ?, 'delivered', ?, datetime('now', '-10 days'))", todayDate(), "c".repeat(64));
  runSql(db, "INSERT INTO orders (id, display_number, display_number_date, status, token, updated_at) VALUES ('recent-terminal', 8002, ?, 'delivered', ?, datetime('now', '-1 day'))", todayDate(), "d".repeat(64));
  runSql(db, "INSERT INTO audit_events (order_id, display_number, event_type, to_status) VALUES ('old-terminal', 8001, 'fulfillment_status', 'handed_over')");

  const response = await app.handle(request("/api/admin/cleanup", "POST", {}, "integration-admin"));
  expect(response.status).toBe(200);
  const cleanupResult = await response.json() as { backup: string };
  expect(cleanupResult.backup).toMatch(/^orders-.*\.db$/);
  expect(getOne(db, "SELECT id FROM orders WHERE id = 'old-terminal'")).toBeNull();
  expect(getOne(db, "SELECT id FROM orders WHERE id = 'recent-terminal'")).toBeTruthy();
  expect(getOne(db, "SELECT id FROM audit_events WHERE order_id = 'old-terminal'")).toBeTruthy();
  const backup = new Database(`${config.dataDir}/backups/${cleanupResult.backup}`, { readonly: true });
  expect(backup.query("SELECT id FROM orders WHERE id = 'old-terminal'").get()).toEqual({ id: "old-terminal" });
  backup.close();
});

test("an administrator can change a staff password and revoke existing sessions", async () => {
  const response = await app.handle(request("/api/admin/users/staff-id/password", "POST", {
    password: "administrator-managed-password",
  }, "integration-admin"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/admin/users");
  const account = getOne<{ password_hash: string }>(getDb(), "SELECT password_hash FROM users WHERE id = 'staff-id'")!;
  expect(await Bun.password.verify("administrator-managed-password", account.password_hash)).toBe(true);
  expect(getOne(getDb(), "SELECT id FROM sessions WHERE id = 'integration-cashier'")).toBeNull();
});

test("staff password changes are only exposed through administration", async () => {
  const response = await app.handle(request("/account/password", "GET", undefined, "integration-cashier"));
  expect(response.status).toBe(404);
});
