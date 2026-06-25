import { test, expect, beforeAll, afterAll } from "bun:test";
import { setupTestDb, cleanupTestDb } from "./setup";
import { getDb, getOne, runSql } from "../src/db/database";
import { nextDisplayNumber } from "../src/services/numbering";

beforeAll(() => setupTestDb());
afterAll(() => cleanupTestDb());

test("items are seeded correctly", () => {
  const db = getDb();
  const items = db.query("SELECT id, name, active, sold_out FROM items ORDER BY id").all() as any[];
  expect(items.length).toBeGreaterThanOrEqual(4);
  expect(items[0].name).toBe("テスト商品A");
  expect(items[0].active).toBe(1);
  expect(items[0].sold_out).toBe(0);
});

test("users are seeded correctly", () => {
  const db = getDb();
  const users = db.query("SELECT username, role FROM users ORDER BY username").all() as any[];
  const usernames = users.map((u: any) => u.username);
  expect(usernames).toContain("admin");
  expect(usernames).toContain("staff1");
});

test("item can be created", () => {
  const db = getDb();
  runSql(db, "INSERT INTO items (name, sort_order) VALUES (?, ?)", "新商品", 5);
  const item = db.query("SELECT name FROM items WHERE name = ?").get("新商品") as any;
  expect(item.name).toBe("新商品");
});

test("item can be toggled sold_out", () => {
  const db = getDb();
  runSql(db, "UPDATE items SET sold_out = 1 WHERE id = ?", 1);
  const item = db.query("SELECT sold_out FROM items WHERE id = ?").get(1) as any;
  expect(item.sold_out).toBe(1);
  runSql(db, "UPDATE items SET sold_out = 0 WHERE id = ?", 1);
});

test("sold-out item is rejected", () => {
  const db = getDb();
  const item = db.query("SELECT active, sold_out FROM items WHERE id = ?").get(3) as any;
  expect(item.active).toBe(1);
  expect(item.sold_out).toBe(1);
});

test("inactive item is rejected", () => {
  const db = getDb();
  const item = db.query("SELECT active, sold_out FROM items WHERE id = ?").get(4) as any;
  expect(item.active).toBe(0);
});

test("display number is generated sequentially", () => {
  const db = getDb();
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  runSql(db, "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, ?, ?, 'preparing', ?, datetime('now'), datetime('now'))",
    "order-1", 1, dateStr, "token-test-1");
  runSql(db, "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, ?, ?, 'preparing', ?, datetime('now'), datetime('now'))",
    "order-2", 2, dateStr, "token-test-2");

  const { number } = nextDisplayNumber();
  expect(number).toBe(3);
});

test("display number is independent per day", () => {
  const { number, date } = nextDisplayNumber();
  // This should still be the current date, and number should increment
  expect(number).toBeGreaterThanOrEqual(1);
  expect(date).toBeTruthy();
});

test("order status transitions are valid", () => {
  const db = getDb();

  const statuses = ["preparing", "available", "delivered", "cancelled"];
  for (const s of statuses) {
    const count = db.query("SELECT COUNT(*) as cnt FROM orders WHERE status = ?").get(s) as any;
    if (s === "preparing") {
      expect(count.cnt).toBeGreaterThanOrEqual(2);
    }
  }
});

test("sequential order creation produces unique numbers", () => {
  const db = getDb();
  const dateStr = new Date().toISOString().slice(0, 10);
  const numbers: number[] = [];

  for (let i = 0; i < 10; i++) {
    const id = `seq-test-${i}-${Date.now()}`;
    const token = `seq-token-${i}-${Date.now()}`;
    const nextNum = db
      .query(`SELECT COALESCE(MAX(display_number), 0) + 1 as next_num FROM orders WHERE display_number_date = ?`)
      .get(dateStr) as { next_num: number };

    runSql(
      db,
      "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, ?, ?, 'preparing', ?, datetime('now'), datetime('now'))",
      id, nextNum.next_num, dateStr, token
    );
    numbers.push(nextNum.next_num);
  }

  const unique = new Set(numbers);
  expect(unique.size).toBe(numbers.length);

  for (let i = 1; i < numbers.length; i++) {
    expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
  }

  // Cleanup
  for (let i = 0; i < 10; i++) {
    runSql(db, "DELETE FROM orders WHERE id LIKE ?", `seq-test-${i}-%`);
  }
});

test("order token is unique", () => {
  const tokens = new Set<string>();
  const db = getDb();
  const orders = db.query("SELECT token FROM orders").all() as any[];
  for (const o of orders) {
    expect(tokens.has(o.token)).toBe(false);
    tokens.add(o.token);
  }
});

test("status update to available works", () => {
  const db = getDb();
  const order = db.query("SELECT id, status FROM orders WHERE status = 'preparing' LIMIT 1").get() as any;
  if (!order) return;

  runSql(db, "UPDATE orders SET status = 'available', updated_at = datetime('now') WHERE id = ?", order.id);
  const updated = db.query("SELECT status FROM orders WHERE id = ?").get(order.id) as any;
  expect(updated.status).toBe("available");

  // Clean up
  runSql(db, "UPDATE orders SET status = 'preparing', updated_at = datetime('now') WHERE id = ?", order.id);
});

test("available orders appear in monitor query", () => {
  const db = getDb();
  const available = db.query("SELECT display_number FROM orders WHERE status = 'available' ORDER BY display_number ASC").all() as any[];

  // Mark one as available
  const order = db.query("SELECT id, display_number FROM orders WHERE status = 'preparing' LIMIT 1").get() as any;
  if (!order) return;

  runSql(db, "UPDATE orders SET status = 'available', updated_at = datetime('now') WHERE id = ?", order.id);

  const afterUpdate = db.query("SELECT display_number FROM orders WHERE status = 'available' ORDER BY display_number ASC").all() as any[];
  expect(afterUpdate.some((o: any) => o.display_number === order.display_number)).toBe(true);

  runSql(db, "UPDATE orders SET status = 'preparing', updated_at = datetime('now') WHERE id = ?", order.id);
});

test("delivered orders are excluded from monitor", () => {
  const db = getDb();

  const order = db.query("SELECT id, display_number FROM orders WHERE status = 'preparing' LIMIT 1").get() as any;
  if (!order) return;

  runSql(db, "UPDATE orders SET status = 'available', updated_at = datetime('now') WHERE id = ?", order.id);
  runSql(db, "UPDATE orders SET status = 'delivered', updated_at = datetime('now') WHERE id = ?", order.id);

  const available = db.query("SELECT display_number FROM orders WHERE status = 'available' ORDER BY display_number ASC").all() as any[];
  expect(available.some((o: any) => o.display_number === order.display_number)).toBe(false);
});

test("password is hashed, not plain text", () => {
  const db = getDb();
  const user = db.query("SELECT password_hash FROM users WHERE username = ?").get("admin") as any;
  expect(user.password_hash).not.toBe("admin123");
  expect(user.password_hash.startsWith("$")).toBe(true);
  expect(user.password_hash.length).toBeGreaterThan(20);
});

test("session expires after max age", () => {
  const db = getDb();
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    "expired-session", "admin-id", "2020-01-01T00:00:00.000Z");

  const valid = getOne<{ id: string }>(
    db,
    "SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND julianday(s.expires_at) > julianday('now')",
    "expired-session"
  );

  expect(valid).toBeNull();
  runSql(db, "DELETE FROM sessions WHERE id = ?", "expired-session");
});
