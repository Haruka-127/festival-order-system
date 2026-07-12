import { Database } from "bun:sqlite";
import type { Changes, SQLQueryBindings } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { config } from "../config";

let db: Database | null = null;
export type DbBinding = SQLQueryBindings;

export function getDb(): Database {
  if (!db) {
    const path = config.dbPath();
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    chmodSync(config.dataDir, 0o700);
    db = new Database(path);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    initSchema(db);
    for (const databaseFile of [path, `${path}-wal`, `${path}-shm`]) {
      if (existsSync(databaseFile)) chmodSync(databaseFile, 0o600);
    }
  }
  return db;
}

export function runSql(db: Database, sql: string, ...bindings: DbBinding[]): Changes {
  return db.prepare<unknown, DbBinding[]>(sql).run(...bindings);
}

export function getOne<T>(db: Database, sql: string, ...bindings: DbBinding[]): T | null {
  return db.prepare<T, DbBinding[]>(sql).get(...bindings);
}

export function getAll<T>(db: Database, sql: string, ...bindings: DbBinding[]): T[] {
  return db.prepare<T, DbBinding[]>(sql).all(...bindings);
}

function initSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sold_out INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      display_number INTEGER NOT NULL,
      display_number_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing', 'available', 'delivered', 'cancelled')),
      token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS number_sequences (
      display_number_date TEXT PRIMARY KEY,
      next_number INTEGER NOT NULL DEFAULT 1 CHECK(next_number >= 1),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id),
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      item_name TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(display_number_date);
    CREATE INDEX IF NOT EXISTS idx_orders_token ON orders(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  db.exec(`
    INSERT INTO number_sequences (display_number_date, next_number, updated_at)
    SELECT display_number_date, MAX(display_number) + 1, datetime('now')
    FROM orders
    GROUP BY display_number_date
    ON CONFLICT(display_number_date) DO NOTHING;
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
