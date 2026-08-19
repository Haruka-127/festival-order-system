import type { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { config } from "../config";
import { getDb } from "../db/database";

export type BackupResult = { filename: string; bytes: number };

export async function createDatabaseBackup(db: Database = getDb()): Promise<BackupResult> {
  const backupDirectory = `${config.dataDir}/backups`;
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  chmodSync(backupDirectory, 0o700);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `orders-${timestamp}.db`;
  const path = `${backupDirectory}/${filename}`;
  const contents = db.serialize();
  await Bun.write(path, contents);
  chmodSync(path, 0o600);
  return { filename, bytes: contents.byteLength };
}
