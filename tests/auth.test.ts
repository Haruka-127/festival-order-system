import { test, expect, beforeAll, afterAll } from "bun:test";
import { setupTestDb, cleanupTestDb } from "./setup";
import { getDb, getOne, runSql } from "../src/db/database";

beforeAll(() => setupTestDb());
afterAll(() => cleanupTestDb());

test("admin user exists with correct role", () => {
  const db = getDb();
  const admin = db.query("SELECT username, role FROM users WHERE username = ?").get("admin") as any;
  expect(admin).toBeTruthy();
  expect(admin.role).toBe("admin");
});

test("staff user exists with correct role", () => {
  const db = getDb();
  const staff = db.query("SELECT username, role FROM users WHERE username = ?").get("staff1") as any;
  expect(staff).toBeTruthy();
  expect(staff.role).toBe("staff");
});

test("password verification works for admin", async () => {
  const db = getDb();
  const user = db.query("SELECT password_hash FROM users WHERE username = ?").get("admin") as any;
  const valid = await Bun.password.verify("admin123", user.password_hash);
  expect(valid).toBe(true);
});

test("password verification works for staff", async () => {
  const db = getDb();
  const user = db.query("SELECT password_hash FROM users WHERE username = ?").get("staff1") as any;
  const valid = await Bun.password.verify("staff123", user.password_hash);
  expect(valid).toBe(true);
});

test("wrong password is rejected", async () => {
  const db = getDb();
  const user = db.query("SELECT password_hash FROM users WHERE username = ?").get("admin") as any;
  const valid = await Bun.password.verify("wrongpassword", user.password_hash);
  expect(valid).toBe(false);
});

test("session can be created and queried", () => {
  const db = getDb();
  const future = new Date(Date.now() + 86400000).toISOString();
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    "test-session-1", "admin-id", future);

  const row = getOne<{ username: string; role: string }>(
    db,
    "SELECT u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND julianday(s.expires_at) > julianday('now')",
    "test-session-1"
  );

  expect(row).toBeTruthy();
  if (!row) throw new Error("session should be valid");
  expect(row.username).toBe("admin");
  expect(row.role).toBe("admin");

  runSql(db, "DELETE FROM sessions WHERE id = ?", "test-session-1");
});

test("expired session is rejected", () => {
  const db = getDb();
  const past = new Date(Date.now() - 86400000).toISOString();
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    "test-session-expired", "admin-id", past);

  const row = getOne<{ username: string }>(
    db,
    "SELECT u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND julianday(s.expires_at) > julianday('now')",
    "test-session-expired"
  );

  expect(row).toBeNull();
  runSql(db, "DELETE FROM sessions WHERE id = ?", "test-session-expired");
});

test("expired session from same day is rejected", () => {
  const db = getDb();
  const sameDayPast = new Date(Date.now() - 60_000).toISOString();
  runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    "test-session-same-day-expired", "admin-id", sameDayPast);

  const row = getOne<{ username: string }>(
    db,
    "SELECT u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND julianday(s.expires_at) > julianday('now')",
    "test-session-same-day-expired"
  );

  expect(row).toBeNull();
  runSql(db, "DELETE FROM sessions WHERE id = ?", "test-session-same-day-expired");
});

test("duplicate username is rejected", () => {
  const db = getDb();
  expect(() => {
    runSql(db, "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
      "dup-id", "admin", "hash", "staff");
  }).toThrow();
});
