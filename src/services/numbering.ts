import type { Database } from "bun:sqlite";
import { getDb, getOne, runSql } from "../db/database";
import { config } from "../config";

export function todayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function nextDisplayNumber(): { number: number; date: string } {
  const db = getDb();
  const date = todayDate();

  const sequence = getOne<{ next_number: number }>(
    db,
    "SELECT next_number FROM number_sequences WHERE display_number_date = ?",
    date
  );
  if (sequence) return { number: sequence.next_number, date };

  const result = getOne<{ next_num: number }>(
    db,
    `SELECT COALESCE(MAX(display_number), 0) + 1 as next_num
     FROM orders WHERE display_number_date = ?`,
    date
  );

  return { number: result?.next_num ?? 1, date };
}

export function getCurrentDisplayNumber(): { number: number; date: string } | null {
  const db = getDb();
  const date = todayDate();

  const row = getOne<{ current_num: number }>(
    db,
    "SELECT next_number - 1 as current_num FROM number_sequences WHERE display_number_date = ?",
    date
  );

  if (!row || row.current_num <= 0) return null;
  return { number: row.current_num, date };
}

export function getNextDisplayNumberForDate(date: string): number {
  const db = getDb();
  const sequence = getOne<{ next_number: number }>(
    db,
    "SELECT next_number FROM number_sequences WHERE display_number_date = ?",
    date
  );
  if (sequence) return sequence.next_number;

  const result = getOne<{ next_num: number }>(
    db,
    `SELECT COALESCE(MAX(display_number), 0) + 1 as next_num
     FROM orders WHERE display_number_date = ?`,
    date
  );
  return result?.next_num ?? 1;
}

export function reserveDisplayNumber(db: Database, date = todayDate()): number {
  const row = getOne<{ display_number: number }>(
    db,
    `INSERT INTO number_sequences (display_number_date, next_number, updated_at)
     VALUES (?, 2, datetime('now'))
     ON CONFLICT(display_number_date) DO UPDATE SET
       next_number = next_number + 1,
       updated_at = datetime('now')
     RETURNING next_number - 1 as display_number`,
    date
  );
  if (!row) throw new Error("受付番号の採番に失敗しました");
  return row.display_number;
}

export function resetDisplayNumbersForToday(db = getDb()): void {
  runSql(
    db,
    `INSERT INTO number_sequences (display_number_date, next_number, updated_at)
     VALUES (?, 1, datetime('now'))
     ON CONFLICT(display_number_date) DO UPDATE SET
       next_number = 1,
       updated_at = datetime('now')`,
    todayDate()
  );
}
