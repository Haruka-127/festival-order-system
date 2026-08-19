import { Database } from "bun:sqlite";
import type { Changes, SQLQueryBindings } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { config } from "../config";
import { initializeDatabaseSchema } from "./migrations";

let db: Database | null = null;
export type DbBinding = SQLQueryBindings;

export function getDb(): Database {
  if (!db) {
    const path = config.dbPath();
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    chmodSync(config.dataDir, 0o700);
    const opened = new Database(path);
    db = opened;
    try {
      opened.exec("PRAGMA journal_mode = WAL;");
      opened.exec("PRAGMA foreign_keys = ON;");
      opened.exec("PRAGMA busy_timeout = 5000;");
      opened.exec("PRAGMA synchronous = NORMAL;");
      opened.exec("PRAGMA wal_autocheckpoint = 1000;");
      opened.transaction(() => initializeDatabaseSchema(opened))();
      const integrity = opened.prepare<{ quick_check: string }, []>("PRAGMA quick_check(1)").get();
      if (integrity?.quick_check !== "ok") throw new Error(`Database integrity check failed: ${integrity?.quick_check ?? "unknown"}`);
      for (const databaseFile of [path, `${path}-wal`, `${path}-shm`]) {
        if (existsSync(databaseFile)) chmodSync(databaseFile, 0o600);
      }
    } catch (error) {
      try { opened.close(); } catch {}
      db = null;
      throw error;
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


export function checkDatabaseReady(db = getDb()): boolean {
  const row = db.prepare<{ ok: number }, []>("SELECT 1 AS ok").get();
  return row?.ok === 1;
}

export function closeDb() {
  if (db) {
    try { db.exec("PRAGMA wal_checkpoint(PASSIVE);"); } catch {}
    db.close();
    db = null;
  }
}
