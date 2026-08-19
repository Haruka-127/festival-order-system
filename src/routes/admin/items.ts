import { Elysia } from "elysia";
import { getDb, getOne, runSql } from "../../db/database";
import { authMiddleware } from "../../middleware/auth";
import { isPositiveInteger } from "../../security";
import { getMonitorBoard } from "../../services/fulfillment";
import { recordAdminAction } from "../../services/audit";
import { wsManager } from "../../services/websocket";
import { MAX_NAME_LENGTH, parseAdminId, parseSortOrder, redirectAdmin, requireAdmin } from "./shared";

export const adminItemRoutes = new Elysia()
  .use(authMiddleware)
  .post("/api/admin/items", ({ body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const { name, sort_order, fulfillment_location_id } = (body ?? {}) as { name?: string; sort_order?: string; fulfillment_location_id?: string };
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const parsedSortOrder = parseSortOrder(sort_order ?? "0");
    const locationId = typeof fulfillment_location_id === "string" && isPositiveInteger(fulfillment_location_id, 2_147_483_647) ? Number(fulfillment_location_id) : null;
    const db = getDb();
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH || parsedSortOrder === null || !locationId || !getOne(db, "SELECT id FROM fulfillment_locations WHERE id = ? AND active = 1", locationId)) {
      return redirectAdmin(addFlash, "error", "商品名と有効な提供場所を入力してください", "items");
    }
    const inserted = runSql(db, "INSERT INTO items (name, sort_order, fulfillment_location_id) VALUES (?, ?, ?)", trimmedName, parsedSortOrder, locationId);
    recordAdminAction(db, actor, "item_created", { itemId: Number(inserted.lastInsertRowid), name: trimmedName, locationId });
    return redirectAdmin(addFlash, "success", "商品を追加しました", "items");
  })
  .post("/api/admin/items/:id/rename", ({ params: { id }, body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const itemId = parseAdminId(id);
    const { name } = (body ?? {}) as { name?: string };
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!itemId || !trimmedName || trimmedName.length > MAX_NAME_LENGTH) return redirectAdmin(addFlash, "error", "商品名を入力してください", "items");
    const db = getDb();
    const updated = runSql(db, "UPDATE items SET name = ? WHERE id = ?", trimmedName, itemId);
    if (!updated.changes) return redirectAdmin(addFlash, "error", "商品が見つかりません", "items");
    recordAdminAction(db, actor, "item_renamed", { itemId, name: trimmedName });
    return redirectAdmin(addFlash, "success", "商品名を更新しました", "items");
  })
  .post("/api/admin/items/:id/sort", ({ params: { id }, body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const itemId = parseAdminId(id);
    const parsedSortOrder = parseSortOrder((body as { sort_order?: string } | null)?.sort_order ?? "0");
    if (!itemId || parsedSortOrder === null) return redirectAdmin(addFlash, "error", "不正な表示順です", "items");
    const db = getDb();
    const updated = runSql(db, "UPDATE items SET sort_order = ? WHERE id = ?", parsedSortOrder, itemId);
    if (!updated.changes) return redirectAdmin(addFlash, "error", "商品が見つかりません", "items");
    recordAdminAction(db, actor, "item_sort_changed", { itemId, sortOrder: parsedSortOrder });
    return redirectAdmin(addFlash, "success", "表示順を更新しました", "items");
  })
  .post("/api/admin/items/:id/toggle-active", ({ params: { id }, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const itemId = parseAdminId(id);
    if (!itemId) return redirectAdmin(addFlash, "error", "不正な商品IDです", "items");
    const db = getDb();
    const item = getOne<{ active: number }>(db, "SELECT active FROM items WHERE id = ?", itemId);
    if (!item) return redirectAdmin(addFlash, "error", "商品が見つかりません", "items");
    runSql(db, "UPDATE items SET active = ? WHERE id = ?", item.active ? 0 : 1, itemId);
    recordAdminAction(db, actor, "item_availability_changed", { itemId, active: !item.active });
    return redirectAdmin(addFlash, "success", item.active ? "商品の販売を停止しました" : "商品の販売を再開しました", "items");
  })
  .post("/api/admin/items/:id/toggle-soldout", ({ params: { id }, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const itemId = parseAdminId(id);
    if (!itemId) return redirectAdmin(addFlash, "error", "不正な商品IDです", "items");
    const db = getDb();
    const item = getOne<{ sold_out: number }>(db, "SELECT sold_out FROM items WHERE id = ?", itemId);
    if (!item) return redirectAdmin(addFlash, "error", "商品が見つかりません", "items");
    runSql(db, "UPDATE items SET sold_out = ? WHERE id = ?", item.sold_out ? 0 : 1, itemId);
    recordAdminAction(db, actor, "item_sold_out_changed", { itemId, soldOut: !item.sold_out });
    wsManager.broadcastToMonitor(getMonitorBoard());
    return redirectAdmin(addFlash, "success", item.sold_out ? "売り切れを解除しました" : "商品を売り切れにしました", "items");
  })
  .post("/api/admin/items/:id/settings", ({ params: { id }, body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const itemId = parseAdminId(id);
    const data = (body ?? {}) as Record<string, string | undefined>;
    const locationId = data.fulfillment_location_id && isPositiveInteger(data.fulfillment_location_id, 2_147_483_647) ? Number(data.fulfillment_location_id) : null;
    const maxPerOrder = data.max_quantity_per_order ? Number(data.max_quantity_per_order) : null;
    const dailyLimit = data.daily_limit ? Number(data.daily_limit) : null;
    if (!itemId || !locationId || (maxPerOrder !== null && (!Number.isInteger(maxPerOrder) || maxPerOrder < 1)) || (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1))) {
      return redirectAdmin(addFlash, "error", "不正な商品設定です", "items");
    }
    const db = getDb();
    if (!getOne(db, "SELECT id FROM fulfillment_locations WHERE id = ? AND active = 1", locationId)) return redirectAdmin(addFlash, "error", "有効な提供場所を指定してください", "items");
    const updated = runSql(db, "UPDATE items SET fulfillment_location_id = ?, max_quantity_per_order = ?, daily_limit = ? WHERE id = ?", locationId, maxPerOrder, dailyLimit, itemId);
    if (!updated.changes) return redirectAdmin(addFlash, "error", "商品が見つかりません", "items");
    recordAdminAction(db, actor, "item_settings_changed", { itemId, locationId, maxPerOrder, dailyLimit });
    return redirectAdmin(addFlash, "success", "商品設定を更新しました", "items");
  })
  .post("/api/admin/items/:id/delete", ({ params: { id }, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const itemId = parseAdminId(id);
    if (!itemId) return redirectAdmin(addFlash, "error", "不正な商品IDです", "items");
    const db = getDb();
    const item = getOne<{ id: number }>(db, "SELECT id FROM items WHERE id = ?", itemId);
    if (!item) return redirectAdmin(addFlash, "error", "商品が見つかりません", "items");
    const usageCount = getOne<{ cnt: number }>(db, `SELECT
      (SELECT COUNT(*) FROM order_items WHERE item_id = ?) +
      (SELECT COUNT(*) FROM daily_item_usage WHERE item_id = ?) AS cnt`, itemId, itemId)?.cnt ?? 0;
    if (usageCount > 0) {
      runSql(db, "UPDATE items SET active = 0 WHERE id = ?", itemId);
      recordAdminAction(db, actor, "item_disabled", { itemId, reason: "usage_exists" });
      return redirectAdmin(addFlash, "success", "使用実績があるため、販売停止にしました", "items");
    }
    runSql(db, "DELETE FROM items WHERE id = ?", itemId);
    recordAdminAction(db, actor, "item_deleted", { itemId });
    return redirectAdmin(addFlash, "success", "商品を削除しました", "items");
  });
