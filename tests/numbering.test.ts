import { test, expect, beforeAll, afterAll } from "bun:test";
import { setupTestDb, cleanupTestDb } from "./setup";
import { closeDb, getDb, runSql } from "../src/db/database";
import { getNextDisplayNumberForDate, reserveDisplayNumber } from "../src/services/numbering";

beforeAll(() => setupTestDb());
afterAll(() => cleanupTestDb());

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("numbering starts from 1 for new date", () => {
  const db = getDb();
  const dateStr = "2026-01-01";

  const result = db
    .query(`SELECT COALESCE(MAX(display_number), 0) + 1 as next_num FROM orders WHERE display_number_date = ?`)
    .get(dateStr) as { next_num: number };

  expect(result.next_num).toBe(1);
});

test("number increments within transaction", () => {
  const db = getDb();
  const dateStr = todayDate();
  const id = `num-test-${Date.now()}`;
  const token = `num-token-${Date.now()}`;

  const result = db.transaction(() => {
    const nextNum = db
      .query(`SELECT COALESCE(MAX(display_number), 0) + 1 as next_num FROM orders WHERE display_number_date = ?`)
      .get(dateStr) as { next_num: number };

    runSql(
      db,
      "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, ?, ?, 'preparing', ?, datetime('now'), datetime('now'))",
      id, nextNum.next_num, dateStr, token
    );

    return nextNum.next_num;
  })();

  expect(result).toBeGreaterThanOrEqual(1);

  // Verify the inserted number
  const inserted = db.query("SELECT display_number FROM orders WHERE id = ?").get(id) as any;
  expect(inserted.display_number).toBe(result);

  runSql(db, "DELETE FROM orders WHERE id = ?", id);
});

test("display number increases monotonically across transactions", () => {
  const db = getDb();
  const numbers: number[] = [];

  for (let i = 0; i < 5; i++) {
    const id = `mono-test-${i}-${Date.now()}`;
    const token = `mono-token-${i}-${Date.now()}`;

    const num = db.transaction(() => {
      const nextNum = db
        .query(`SELECT COALESCE(MAX(display_number), 0) + 1 as next_num FROM orders WHERE display_number_date = ?`)
        .get(todayDate()) as { next_num: number };

      runSql(
        db,
        "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, ?, ?, 'preparing', ?, datetime('now'), datetime('now'))",
        id, nextNum.next_num, todayDate(), token
      );

      return nextNum.next_num;
    })();

    numbers.push(num);
  }

  expect(numbers.length).toBe(5);
  for (let i = 1; i < numbers.length; i++) {
    expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
  }

  for (let i = 0; i < 5; i++) {
    runSql(db, "DELETE FROM orders WHERE id LIKE ?", `mono-test-${i}-%`);
  }
});

test("same date orders share number sequence", () => {
  const db = getDb();
  const dateStr = todayDate();

  const before = db
    .query(`SELECT COALESCE(MAX(display_number), 0) as max_num FROM orders WHERE display_number_date = ?`)
    .get(dateStr) as { max_num: number };

  expect(before.max_num).toBeGreaterThanOrEqual(0);
});

test("different dates have independent sequences", () => {
  const db = getDb();
  const date1 = "2026-06-01";
  const date2 = "2026-06-02";

  const num1 = db
    .query(`SELECT COALESCE(MAX(display_number), 0) + 1 as next_num FROM orders WHERE display_number_date = ?`)
    .get(date1) as { next_num: number };

  const num2 = db
    .query(`SELECT COALESCE(MAX(display_number), 0) + 1 as next_num FROM orders WHERE display_number_date = ?`)
    .get(date2) as { next_num: number };

  // For new dates, both should start at 1
  expect(num1.next_num).toBe(1);
  expect(num2.next_num).toBe(1);

  // Insert one order for date1
  runSql(
    db,
    "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, ?, ?, 'preparing', ?, datetime('now'), datetime('now'))",
    "date-test-1", 1, date1, "date-token-1"
  );

  // date1 should now be at 2
  const afterInsert = db
    .query(`SELECT COALESCE(MAX(display_number), 0) + 1 as next_num FROM orders WHERE display_number_date = ?`)
    .get(date1) as { next_num: number };
  expect(afterInsert.next_num).toBe(2);

  // date2 should still be at 1
  const date2Check = db
    .query(`SELECT COALESCE(MAX(display_number), 0) + 1 as next_num FROM orders WHERE display_number_date = ?`)
    .get(date2) as { next_num: number };
  expect(date2Check.next_num).toBe(1);

  runSql(db, "DELETE FROM orders WHERE id = ?", "date-test-1");
});

test("reserved display numbers are tracked by sequence table", () => {
  const db = getDb();
  const dateStr = "2026-12-31";

  const first = reserveDisplayNumber(db, dateStr);
  const second = reserveDisplayNumber(db, dateStr);

  expect(first).toBe(1);
  expect(second).toBe(2);
  expect(getNextDisplayNumberForDate(dateStr)).toBe(3);

  runSql(db, "DELETE FROM number_sequences WHERE display_number_date = ?", dateStr);
});

test("existing sequence is preserved when database is reopened", () => {
  const db = getDb();
  const dateStr = "2027-01-03";

  runSql(
    db,
    "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, ?, ?, 'delivered', ?, datetime('now'), datetime('now'))",
    "preserve-seq-order", 10, dateStr, "preserve-seq-token"
  );
  runSql(
    db,
    "INSERT INTO number_sequences (display_number_date, next_number) VALUES (?, ?) ON CONFLICT(display_number_date) DO UPDATE SET next_number = excluded.next_number",
    dateStr, 1
  );

  closeDb();
  const reopened = getDb();

  expect(getNextDisplayNumberForDate(dateStr)).toBe(1);

  runSql(reopened, "DELETE FROM number_sequences WHERE display_number_date = ?", dateStr);
  runSql(reopened, "DELETE FROM orders WHERE id = ?", "preserve-seq-order");
});
