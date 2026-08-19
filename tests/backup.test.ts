import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { config } from "../src/config";
import { createDatabaseBackup } from "../src/services/backup";

const backupTestDirectory = "./data-backup-test";
const originalDataDirectory = config.dataDir;
const originalRetentionCount = config.backupRetentionCount;

afterEach(() => {
  config.dataDir = originalDataDirectory;
  config.backupRetentionCount = originalRetentionCount;
  rmSync(backupTestDirectory, { recursive: true, force: true });
});

test("database backups prune only old generated backups beyond the retention count", async () => {
  config.dataDir = backupTestDirectory;
  config.backupRetentionCount = 2;
  const backupDirectory = `${backupTestDirectory}/backups`;
  mkdirSync(backupDirectory, { recursive: true });
  await Bun.write(`${backupDirectory}/orders-2026-01-01T00-00-00-000Z.db`, "oldest");
  await Bun.write(`${backupDirectory}/orders-2026-01-02T00-00-00-000Z.db`, "old");
  await Bun.write(`${backupDirectory}/keep-me.txt`, "unrelated");

  const db = new Database(":memory:");
  db.exec("CREATE TABLE example (id INTEGER PRIMARY KEY);");
  await createDatabaseBackup(db);
  db.close();

  const filenames = readdirSync(backupDirectory).sort();
  expect(filenames).toContain("keep-me.txt");
  expect(filenames).not.toContain("orders-2026-01-01T00-00-00-000Z.db");
  expect(filenames.filter(filename => filename.endsWith(".db"))).toHaveLength(2);
});
