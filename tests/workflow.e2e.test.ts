import { afterAll, beforeAll, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { getDb, getOne, runSql } from "../src/db/database";
import { cleanupTestDb, setupTestDb } from "./setup";

const app = createApp();
const origin = "http://localhost:3000";
const cashierSession = "workflow-cashier";
const providerSession = "workflow-provider";
const adminSession = "workflow-admin";

function request(path: string, method = "GET", body?: unknown, sessionId?: string): Request {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (sessionId) headers.Cookie = `session_id=${sessionId}`;
  return new Request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
}

beforeAll(async () => {
  const db = await setupTestDb();
  runSql(db, "INSERT INTO users (id, username, password_hash, role, staff_type, fulfillment_location_id) VALUES ('workflow-provider-id', 'workflow-provider', 'unused', 'staff', 'provider', 1)");
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 'staff-id', '2099-01-01 00:00:00')", cashierSession);
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 'workflow-provider-id', '2099-01-01 00:00:00')", providerSession);
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 'admin-id', '2099-01-01 00:00:00')", adminSession);
});

afterAll(() => cleanupTestDb());

test("an order moves through cashier, provider, monitor, customer and administration views", async () => {
  const createdResponse = await app.handle(request("/api/staff/orders", "POST", {
    items: [{ item_id: 1, quantity: 2 }],
    client_request_id: "workflow-order-request",
  }, cashierSession));
  expect(createdResponse.status).toBe(201);
  const created = await createdResponse.json() as { id: string; token: string; display_number: number };
  const fulfillment = getOne<{ id: string }>(getDb(), "SELECT id FROM order_fulfillments WHERE order_id = ?", created.id)!;

  const providerTasks = await (await app.handle(request("/api/provider/fulfillments", "GET", undefined, providerSession))).json() as { id: string }[];
  expect(providerTasks.map(task => task.id)).toContain(fulfillment.id);
  const initialCustomer = await (await app.handle(request(`/api/order/${created.token}`))).json() as { status: string };
  expect(initialCustomer.status).toBe("preparing");

  const ready = await app.handle(request(`/api/provider/fulfillments/${fulfillment.id}/status`, "PATCH", { status: "ready" }, providerSession));
  expect(ready.status).toBe(200);
  const readyCustomer = await (await app.handle(request(`/api/order/${created.token}`))).json() as { status: string };
  expect(readyCustomer.status).toBe("available");
  const monitor = await (await app.handle(request("/api/monitor/board"))).json() as { locations: { calling: { display_number: number }[] }[] };
  expect(monitor.locations.flatMap(location => location.calling).map(entry => entry.display_number)).toContain(created.display_number);

  const handedOver = await app.handle(request(`/api/provider/fulfillments/${fulfillment.id}/status`, "PATCH", { status: "handed_over" }, providerSession));
  expect(handedOver.status).toBe(200);
  const completedCustomer = await (await app.handle(request(`/api/order/${created.token}`))).json() as { status: string };
  expect(completedCustomer.status).toBe("delivered");
  const completedMonitor = await (await app.handle(request("/api/monitor/board"))).json() as { locations: { waiting: unknown[]; calling: unknown[] }[] };
  expect(completedMonitor.locations.flatMap(location => [...location.waiting, ...location.calling])).toHaveLength(0);

  const administration = await (await app.handle(request("/admin/orders?status=completed", "GET", undefined, adminSession))).text();
  expect(administration).toContain(`/order/${created.token}`);
  const auditCount = getOne<{ count: number }>(getDb(), "SELECT COUNT(*) AS count FROM audit_events WHERE order_id = ?", created.id)?.count ?? 0;
  expect(auditCount).toBe(3);
});
