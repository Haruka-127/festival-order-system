import { Database } from "bun:sqlite";
import { chmodSync, closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";
import { getDb } from "../db/database";

export type BackupResult = { filename: string; bytes: number };

function pruneOldBackups(backupDirectory: string): void {
  const backups = readdirSync(backupDirectory)
    .filter(filename => /^orders-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/.test(filename))
    .sort()
    .reverse();
  for (const filename of backups.slice(config.backupRetentionCount)) {
    unlinkSync(`${backupDirectory}/${filename}`);
  }
}

// No await between the snapshot and its caller's deletion transaction. The reset
// holds an IMMEDIATE SQLite transaction throughout this synchronous operation.
export function writeDatabaseSnapshot(db: Database, path: string): number {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
  const contents = db.serialize();
  let published = false;
  try {
    const descriptor = openSync(temporaryPath, "wx", 0o600);
    try {
      writeFileSync(descriptor, contents);
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
    const snapshot = new Database(temporaryPath);
    try {
      // serialize() retains a WAL-mode header. Convert only the temporary copy
      // to a standalone database so future read-only views need no WAL/SHM files.
      snapshot.exec("PRAGMA journal_mode = DELETE;");
      if (snapshot.query<{ quick_check: string }, []>("PRAGMA quick_check").all().some(row => row.quick_check !== "ok")) {
        throw new Error("Backup integrity check failed");
      }
    } finally { snapshot.close(); }
    const verifiedDescriptor = openSync(temporaryPath, "r");
    try { fsyncSync(verifiedDescriptor); } finally { closeSync(verifiedDescriptor); }
    // Publish without overwriting an existing archive, then persist the directory.
    linkSync(temporaryPath, path);
    published = true;
    unlinkSync(temporaryPath);
    const directoryDescriptor = openSync(directory, "r");
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    const parentDescriptor = openSync(dirname(directory), "r");
    try { fsyncSync(parentDescriptor); } finally { closeSync(parentDescriptor); }
    return contents.byteLength;
  } catch (error) {
    if (published) { try { unlinkSync(path); } catch {} }
    throw error;
  } finally {
    for (const file of [temporaryPath, `${temporaryPath}-wal`, `${temporaryPath}-shm`, `${temporaryPath}-journal`]) {
      if (existsSync(file)) unlinkSync(file);
    }
  }
}

export function createDatabaseBackup(db: Database = getDb()): BackupResult {
  const backupDirectory = `${config.dataDir}/backups`;
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  chmodSync(backupDirectory, 0o700);
  let time = Date.now();
  let filename: string;
  do { filename = `orders-${new Date(time++).toISOString().replace(/[:.]/g, "-")}.db`; }
  while (existsSync(`${backupDirectory}/${filename}`));
  const path = `${backupDirectory}/${filename}`;
  const bytes = writeDatabaseSnapshot(db, path);
  pruneOldBackups(backupDirectory);
  return { filename, bytes };
}
