import { afterAll, beforeAll, expect, test } from "bun:test";
import { cleanupTestDb, setupTestDb } from "./setup";
import { getDb, runSql } from "../src/db/database";
import { getCustomerOrderByToken, getMonitorBoard, recomputeOrderStatus } from "../src/services/fulfillment";
import { getProviderTasks } from "../src/routes/provider";
import { getUserBySessionId } from "../src/middleware/auth";

const orderId = "fulfillment-test-order";
const token = "a".repeat(64);

beforeAll(async () => {
  const db = await setupTestDb();
  runSql(db, "INSERT INTO fulfillment_locations (id, name, slug, sort_order) VALUES (101, '焼き物ブース', 'test-grill', 1)");
  runSql(db, "INSERT INTO fulfillment_locations (id, name, slug, sort_order) VALUES (102, 'ドリンクブース', 'test-drink', 2)");
  runSql(db, "INSERT INTO items (id, name, sort_order, fulfillment_location_id) VALUES (101, '焼きそば', 101, 101)");
  runSql(db, "INSERT INTO items (id, name, sort_order, fulfillment_location_id) VALUES (102, 'ジュース', 102, 102)");
  runSql(db, "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, 9001, '2026-07-16', 'preparing', ?, datetime('now'), datetime('now'))", orderId, token);
  runSql(db, "INSERT INTO order_fulfillments (id, order_id, location_id, status) VALUES ('fulfillment-grill', ?, 101, 'ready')", orderId);
  runSql(db, "UPDATE order_fulfillments SET ready_at = datetime('now') WHERE id = 'fulfillment-grill'");
  runSql(db, "INSERT INTO order_fulfillments (id, order_id, location_id, status) VALUES ('fulfillment-drink', ?, 102, 'preparing')", orderId);
  runSql(db, "INSERT INTO order_items (order_id, item_id, quantity, item_name, fulfillment_id) VALUES (?, 101, 1, '焼きそば', 'fulfillment-grill')", orderId);
  runSql(db, "INSERT INTO order_items (order_id, item_id, quantity, item_name, fulfillment_id) VALUES (?, 102, 2, 'ジュース', 'fulfillment-drink')", orderId);

  const hash = await Bun.password.hash("provider-test-password");
  runSql(db, "INSERT INTO users (id, username, password_hash, role, staff_type, fulfillment_location_id) VALUES ('provider-test-id', 'provider-test', ?, 'staff', 'provider', 101)", hash);
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES ('provider-test-session', 'provider-test-id', '2099-01-01 00:00:00')");
});

afterAll(() => cleanupTestDb());

test("monitor board separates waiting and calling numbers by location", () => {
  const board = getMonitorBoard();
  const grill = board.locations.find(location => location.id === 101)!;
  const drink = board.locations.find(location => location.id === 102)!;
  expect(grill.waiting).toHaveLength(0);
  expect(grill.calling.map(entry => entry.display_number)).toContain(9001);
  expect(drink.waiting.map(entry => entry.display_number)).toContain(9001);
  expect(drink.calling).toHaveLength(0);
});

test("customer keeps one number and receives per-location progress", () => {
  const order = getCustomerOrderByToken(token)!;
  expect(order.display_number).toBe(9001);
  expect(order.status).toBe("partially_ready");
  expect(order.fulfillments).toHaveLength(2);
  expect(order.fulfillments.find(item => item.location_name === "焼き物ブース")?.status).toBe("ready");
  expect(order.fulfillments.find(item => item.location_name === "ドリンクブース")?.items).toEqual([{ name: "ジュース", quantity: 2 }]);
});

test("provider task query is scoped to one location", () => {
  const grillTasks = getProviderTasks(101);
  const drinkTasks = getProviderTasks(102);
  expect(grillTasks.map(task => task.id)).toEqual(["fulfillment-grill"]);
  expect(drinkTasks.map(task => task.id)).toEqual(["fulfillment-drink"]);
  expect(grillTasks[0]?.items).toEqual([{ name: "焼きそば", quantity: 1 }]);
});

test("session resolves provider role and assigned location", () => {
  const user = getUserBySessionId("provider-test-session");
  expect(user?.role).toBe("provider");
  expect(user?.fulfillmentLocationId).toBe(101);
  expect(user?.fulfillmentLocationName).toBe("焼き物ブース");
});

test("aggregate order status changes only after all locations are ready", () => {
  const db = getDb();
  expect(recomputeOrderStatus(db, orderId)).toBe("preparing");
  runSql(db, "UPDATE order_fulfillments SET status = 'ready', ready_at = datetime('now') WHERE id = 'fulfillment-drink'");
  expect(recomputeOrderStatus(db, orderId)).toBe("available");
  runSql(db, "UPDATE order_fulfillments SET status = 'handed_over', handed_over_at = datetime('now') WHERE order_id = ?", orderId);
  expect(recomputeOrderStatus(db, orderId)).toBe("delivered");
});

test("schema contains configurable order and location limits", () => {
  const db = getDb();
  const settings = db.query("SELECT max_items_per_order, max_total_quantity FROM app_settings WHERE id = 1").get() as { max_items_per_order: number; max_total_quantity: number };
  const location = db.query("SELECT max_preparing_orders, max_preparing_units FROM fulfillment_locations WHERE id = 101").get() as { max_preparing_orders: number | null; max_preparing_units: number | null };
  expect(settings).toEqual({ max_items_per_order: 50, max_total_quantity: 500 });
  expect(location.max_preparing_orders).toBeNull();
  expect(location.max_preparing_units).toBeNull();
});
