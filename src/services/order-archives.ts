import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "node:fs";
import { config } from "../config";
import { getAll, getDb, getOne, runSql } from "../db/database";
import { recordAdminAction, type AdminAuditActor } from "./audit";
import { writeDatabaseSnapshot } from "./backup";

export type OrderArchive = {
  id: string; created_at: string; actor_username: string; order_count: number; active_count: number;
  oldest_order_at: string | null; newest_order_at: string | null; bytes: number;
  format_version: number; display_digits: number;
};
export type ResetPreview = {
  count: number; active_count: number; oldest: string | null; newest: string | null;
  sold_units: number; reserved_units: number; revision: string;
};
export class ArchiveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function validArchiveId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
}

export function getOrderGeneration(db = getDb()): number {
  return getOne<{ order_generation: number }>(db, "SELECT order_generation FROM app_settings WHERE id = 1")!.order_generation;
}

export function getResetPreview(db = getDb()): ResetPreview {
  return db.transaction(() => computeResetPreview(db))();
}

function computeResetPreview(db: Database): ResetPreview {
  const summary = getOne<Omit<ResetPreview, "revision">>(db, `SELECT COUNT(*) AS count,
    COALESCE(SUM(status IN ('preparing', 'available')), 0) AS active_count,
    MIN(created_at) AS oldest, MAX(created_at) AS newest,
    (SELECT COALESCE(SUM(quantity), 0) FROM fulfilled_item_sales) AS sold_units,
    (SELECT COALESCE(SUM(reserved_quantity), 0) FROM daily_item_usage) AS reserved_units
    FROM orders`)!;
  // Compare all order data, including changes within the same timestamp. Changes
  // to login sessions or unrelated administrative settings do not invalidate it.
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(String(getOrderGeneration(db)));
  for (const query of [
    "SELECT * FROM orders ORDER BY id",
    "SELECT * FROM order_items ORDER BY id",
    "SELECT * FROM order_fulfillments ORDER BY id",
    "SELECT * FROM fulfillment_events ORDER BY id",
    "SELECT * FROM fulfilled_item_sales ORDER BY fulfillment_id, item_id",
    "SELECT * FROM daily_item_usage ORDER BY usage_date, item_id",
    "SELECT * FROM number_sequences ORDER BY display_number_date",
    "SELECT * FROM audit_events WHERE event_type != 'admin_action' ORDER BY id",
  ]) {
    hash.update(query);
    for (const row of db.query(query).iterate()) hash.update(JSON.stringify(row));
  }
  return { ...summary, revision: hash.digest("hex") };
}

export function getOrderArchive(id: string, db = getDb()): OrderArchive | null {
  if (!validArchiveId(id)) return null;
  return getOne<OrderArchive>(db, "SELECT * FROM order_archives WHERE id = ?", id);
}

function archivePath(id: string): string {
  if (!validArchiveId(id)) throw new ArchiveError(404, "バックアップが見つかりません");
  return `${config.dataDir}/order-archives/${id}.db`;
}

export function readOrderArchive<T>(archive: OrderArchive, reader: (db: Database) => T): T {
  if (archive.format_version !== 1) throw new ArchiveError(503, "この形式のバックアップは現在のバージョンでは閲覧できません");
  let snapshot: Database;
  try { snapshot = new Database(archivePath(archive.id), { readonly: true }); }
  catch { throw new ArchiveError(503, "バックアップファイルを読み込めません。保存先を確認してください"); }
  try {
    // Never initialize or migrate historical databases, and never authenticate
    // using the sessions or accounts contained in them.
    return reader(snapshot);
  } finally { snapshot.close(); }
}

export function resetOrderHistory(actor: AdminAuditActor, requestId: string, revision: string, db = getDb()) {
  if (!validArchiveId(requestId)) throw new ArchiveError(400, "不正なリセット要求です");
  let createdFile: string | null = null;
  try {
    // This entire critical section is synchronous. HTTP handlers cannot insert
    // an order between saving its archive and clearing the live data. IMMEDIATE
    // also excludes SQLite writers using another connection.
    return db.transaction(() => {
      const existing = getOrderArchive(requestId, db);
      if (existing) return { archive: existing, duplicated: true };
      const preview = getResetPreview(db);
      if (preview.revision !== revision) {
        throw new ArchiveError(409, "確認後に注文データが更新されました。対象件数を確認し直してください");
      }
      const path = archivePath(requestId);
      // A crash after file publication but before commit can leave an unlisted
      // file. The matching live revision is still present, so retry can replace
      // only this unregistered file. Registered archives are returned above.
      if (existsSync(path)) unlinkSync(path);
      const bytes = writeDatabaseSnapshot(db, path);
      createdFile = path;
      const archive: OrderArchive = {
        id: requestId, created_at: new Date().toISOString(), actor_username: actor.username,
        order_count: preview.count, active_count: preview.active_count,
        oldest_order_at: preview.oldest, newest_order_at: preview.newest,
        bytes, format_version: 1, display_digits: config.displayNumberDigits,
      };
      for (const table of ["fulfillment_events", "order_items", "order_fulfillments", "orders", "fulfilled_item_sales", "daily_item_usage", "number_sequences"]) {
        runSql(db, `DELETE FROM ${table}`);
      }
      runSql(db, "DELETE FROM audit_events WHERE event_type != 'admin_action'");
      runSql(db, "UPDATE app_settings SET order_generation = order_generation + 1 WHERE id = 1");
      runSql(db, `INSERT INTO order_archives
        (id, created_at, actor_username, order_count, active_count, oldest_order_at, newest_order_at, bytes, format_version, display_digits)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, archive.id, archive.created_at, archive.actor_username,
        archive.order_count, archive.active_count, archive.oldest_order_at, archive.newest_order_at,
        archive.bytes, archive.format_version, archive.display_digits);
      recordAdminAction(db, actor, "order_history_reset", { archiveId: archive.id, orders: archive.order_count, activeOrders: archive.active_count });
      return { archive, duplicated: false };
    }).immediate();
  } catch (error) {
    // A database error rolls all live-data changes back. A crash can leave an
    // unlisted archive file, but can never commit deletion before saving it.
    if (createdFile) { try { unlinkSync(createdFile); } catch {} }
    throw error;
  }
}

export function listOrderArchives(page = 1, db = getDb()) {
  const total = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM order_archives")!.count;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const currentPage = Math.min(page, totalPages);
  return {
    archives: getAll<OrderArchive>(db, "SELECT * FROM order_archives ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?", (currentPage - 1) * 20),
    page: currentPage, totalPages,
  };
}
