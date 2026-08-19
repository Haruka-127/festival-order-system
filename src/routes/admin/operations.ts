import { Elysia } from "elysia";
import { getDb, getOne, runSql } from "../../db/database";
import { authMiddleware } from "../../middleware/auth";
import { recordAdminAction, recordAuditEvent } from "../../services/audit";
import { createDatabaseBackup } from "../../services/backup";
import { resetDisplayNumbersForToday } from "../../services/numbering";
import { redirectAdmin, requireAdmin } from "./shared";

export const adminOperationRoutes = new Elysia()
  .use(authMiddleware)
  .post("/api/admin/reset-numbers", ({ set, getUser }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const db = getDb();
    const active = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM orders WHERE status IN ('preparing', 'available')")?.count ?? 0;
    if (active > 0) {
      set.status = 409;
      return { error: "準備中または提供可能の注文が残っているため、番号をリセットできません" };
    }
    resetDisplayNumbersForToday(db);
    recordAdminAction(db, actor, "display_numbers_reset");
    return { success: true };
  })
  .post("/api/admin/settings/orders", ({ body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const data = (body ?? {}) as Record<string, string | undefined>;
    const enabled = data.ordering_enabled === "1" ? 1 : 0;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const openTime = data.order_open_time?.trim() || null;
    const closeTime = data.order_close_time?.trim() || null;
    const dailyLimit = data.daily_order_limit ? Number(data.daily_order_limit) : null;
    const maxItems = Number(data.max_items_per_order);
    const maxQuantity = Number(data.max_total_quantity);
    const retentionDays = Number(data.completed_order_retention_days);
    const returnPath = data.return_to === "advanced" ? "/admin/settings/advanced" : undefined;
    if ((openTime && !timePattern.test(openTime)) || (closeTime && !timePattern.test(closeTime)) || (openTime && closeTime && openTime >= closeTime) || (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1)) || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100 || !Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 10000 || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      return redirectAdmin(addFlash, "error", "不正な注文設定です", "settings", returnPath);
    }
    const db = getDb();
    runSql(db, "UPDATE app_settings SET ordering_enabled = ?, order_open_time = ?, order_close_time = ?, daily_order_limit = ?, max_items_per_order = ?, max_total_quantity = ?, completed_order_retention_days = ?, updated_at = datetime('now') WHERE id = 1", enabled, openTime, closeTime, dailyLimit, maxItems, maxQuantity, retentionDays);
    recordAdminAction(db, actor, "order_settings_changed", { enabled: Boolean(enabled), openTime, closeTime, dailyLimit, maxItems, maxQuantity, retentionDays });
    return redirectAdmin(addFlash, "success", "注文設定を更新しました", "settings", returnPath);
  })
  .get("/api/admin/cleanup/preview", ({ getUser }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const db = getDb();
    const retentionDays = getOne<{ completed_order_retention_days: number }>(db, "SELECT completed_order_retention_days FROM app_settings WHERE id = 1")?.completed_order_retention_days ?? 7;
    const cutoffModifier = `-${retentionDays} days`;
    const target = getOne<{ count: number; oldest: string | null; newest: string | null }>(db, "SELECT COUNT(*) AS count, MIN(updated_at) AS oldest, MAX(updated_at) AS newest FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)", cutoffModifier);
    return { retention_days: retentionDays, count: target?.count ?? 0, oldest: target?.oldest ?? null, newest: target?.newest ?? null };
  })
  .post("/api/admin/backup", async ({ getUser, set }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    try {
      const backup = await createDatabaseBackup();
      recordAdminAction(getDb(), actor, "backup_created", { filename: backup.filename, bytes: backup.bytes });
      return { success: true, ...backup };
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "backup_failed", error: error instanceof Error ? error.message : String(error) }));
      set.status = 503;
      return { error: "バックアップを作成できませんでした" };
    }
  })
  .post("/api/admin/cleanup", async ({ getUser, set }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const db = getDb();
    const retentionDays = getOne<{ completed_order_retention_days: number }>(db, "SELECT completed_order_retention_days FROM app_settings WHERE id = 1")?.completed_order_retention_days ?? 7;
    const cutoffModifier = `-${retentionDays} days`;
    const pendingCount = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)", cutoffModifier)?.count ?? 0;
    if (pendingCount === 0) return { deleted: 0, retention_days: retentionDays, backup: null };
    let backup;
    try {
      backup = await createDatabaseBackup(db);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "cleanup_backup_failed", error: error instanceof Error ? error.message : String(error) }));
      set.status = 503;
      return { error: "削除前バックアップを作成できなかったため、削除を中止しました" };
    }
    const deleteOldOrders = db.transaction(() => {
      const targetCount = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)", cutoffModifier)?.count ?? 0;
      if (targetCount === 0) return 0;
      runSql(db, "DELETE FROM fulfillment_events WHERE fulfillment_id IN (SELECT id FROM order_fulfillments WHERE order_id IN (SELECT id FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)))", cutoffModifier);
      runSql(db, "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?))", cutoffModifier);
      runSql(db, "DELETE FROM order_fulfillments WHERE order_id IN (SELECT id FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?))", cutoffModifier);
      const deleted = runSql(db, "DELETE FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)", cutoffModifier).changes;
      recordAuditEvent(db, { eventType: "orders_cleaned", actorUserId: actor.id, actorUsername: actor.username, details: { deleted, retentionDays } });
      return deleted;
    });
    return { deleted: deleteOldOrders(), retention_days: retentionDays, backup: backup.filename };
  });
