import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { config } from "../src/config";
import { closeDb, getDb } from "../src/db/database";

const migrationDir = "./data-migration-test";

afterAll(() => {
  closeDb();
  rmSync(migrationDir, { recursive: true, force: true });
});

test("legacy database is migrated to multi-location schema without losing orders", () => {
  closeDb();
  rmSync(migrationDir, { recursive: true, force: true });
  mkdirSync(migrationDir, { recursive: true });
  config.dataDir = migrationDir;
  const legacy = new Database(`${migrationDir}/orders.db`);
  legacy.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin', 'staff')), created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sold_out INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE orders (id TEXT PRIMARY KEY, display_number INTEGER NOT NULL, display_number_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing', 'available', 'delivered', 'cancelled')), token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE number_sequences (display_number_date TEXT PRIMARY KEY, next_number INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id), item_id INTEGER NOT NULL REFERENCES items(id), quantity INTEGER NOT NULL, item_name TEXT NOT NULL);
    INSERT INTO users (id, username, password_hash, role) VALUES ('legacy-staff', 'legacy', 'hash', 'staff');
    INSERT INTO items (id, name) VALUES (1, '旧商品');
    INSERT INTO orders (id, display_number, display_number_date, status, token) VALUES ('legacy-order', 7, '2026-07-16', 'available', '${"b".repeat(64)}');
    INSERT INTO order_items (order_id, item_id, quantity, item_name) VALUES ('legacy-order', 1, 2, '旧商品');
  `);
  legacy.close();

  const migrated = getDb();
  const item = migrated.query("SELECT fulfillment_location_id FROM items WHERE id = 1").get() as { fulfillment_location_id: number };
  const user = migrated.query("SELECT staff_type FROM users WHERE id = 'legacy-staff'").get() as { staff_type: string };
  const task = migrated.query("SELECT status, location_id FROM order_fulfillments WHERE order_id = 'legacy-order'").get() as { status: string; location_id: number };
  const orderItem = migrated.query("SELECT fulfillment_id FROM order_items WHERE order_id = 'legacy-order'").get() as { fulfillment_id: string };

  expect(item.fulfillment_location_id).toBe(1);
  expect(user.staff_type).toBe("cashier");
  expect(task).toEqual({ status: "ready", location_id: 1 });
  expect(orderItem.fulfillment_id).toBe("legacy-legacy-order");
  expect(migrated.query("PRAGMA user_version").get()).toEqual({ user_version: 3 });
  expect(migrated.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_flash_messages'").get()).toEqual({ name: "session_flash_messages" });
  expect(migrated.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_events'").get()).toEqual({ name: "audit_events" });
});
