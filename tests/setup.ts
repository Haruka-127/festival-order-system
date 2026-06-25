import { mkdirSync, rmSync } from "node:fs";
import { config } from "../src/config";
import { getDb, closeDb, runSql } from "../src/db/database";

config.dataDir = "./data-test";
config.baseUrl = "http://localhost:3001";
config.port = 3001;

export async function setupTestDb() {
  mkdirSync(config.dataDir, { recursive: true });
  const db = getDb();

  const adminHash = await Bun.password.hash("admin123");
  const staffHash = await Bun.password.hash("staff123");

  runSql(db, "INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
    "admin-id", "admin", adminHash, "admin");
  runSql(db, "INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
    "staff-id", "staff1", staffHash, "staff");

  runSql(db, "INSERT OR IGNORE INTO items (id, name, active, sold_out, sort_order) VALUES (?, ?, ?, ?, ?)",
    1, "テスト商品A", 1, 0, 1);
  runSql(db, "INSERT OR IGNORE INTO items (id, name, active, sold_out, sort_order) VALUES (?, ?, ?, ?, ?)",
    2, "テスト商品B", 1, 0, 2);
  runSql(db, "INSERT OR IGNORE INTO items (id, name, active, sold_out, sort_order) VALUES (?, ?, ?, ?, ?)",
    3, "売切商品C", 1, 1, 3);
  runSql(db, "INSERT OR IGNORE INTO items (id, name, active, sold_out, sort_order) VALUES (?, ?, ?, ?, ?)",
    4, "停止商品D", 0, 0, 4);

  return db;
}

export function cleanupTestDb() {
  try {
    closeDb();
    rmSync(config.dataDir, { recursive: true, force: true });
  } catch {}
}
