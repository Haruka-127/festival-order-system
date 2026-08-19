import { Elysia } from "elysia";
import { getDb, getOne, runSql } from "../../db/database";
import { authMiddleware } from "../../middleware/auth";
import { getMonitorBoard } from "../../services/fulfillment";
import { recordAdminAction } from "../../services/audit";
import { wsManager } from "../../services/websocket";
import { MAX_NAME_LENGTH, parseAdminId, parseSortOrder, redirectAdmin, requireAdmin } from "./shared";

export const adminLocationRoutes = new Elysia()
  .use(authMiddleware)
  .post("/api/admin/locations", ({ body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const { name, slug, sort_order } = (body ?? {}) as { name?: string; slug?: string; sort_order?: string };
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedSlug = typeof slug === "string" ? slug.trim().toLowerCase() : "";
    const parsedSortOrder = parseSortOrder(sort_order ?? "0");
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH || !/^[a-z0-9-]{1,50}$/.test(trimmedSlug) || parsedSortOrder === null) return redirectAdmin(addFlash, "error", "提供場所名と英数字の識別子を入力してください", "locations");
    const db = getDb();
    try {
      const inserted = runSql(db, "INSERT INTO fulfillment_locations (name, slug, sort_order) VALUES (?, ?, ?)", trimmedName, trimmedSlug, parsedSortOrder);
      recordAdminAction(db, actor, "location_created", { locationId: Number(inserted.lastInsertRowid), name: trimmedName, slug: trimmedSlug });
    } catch {
      return redirectAdmin(addFlash, "error", "その識別子は既に使用されています", "locations");
    }
    return redirectAdmin(addFlash, "success", "提供場所を追加しました", "locations");
  })
  .post("/api/admin/locations/:id/settings", ({ params: { id }, body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const locationId = parseAdminId(id);
    const data = (body ?? {}) as Record<string, string | undefined>;
    const name = data.name?.trim() ?? "";
    const sortOrder = parseSortOrder(data.sort_order ?? "0");
    const maxOrders = data.max_preparing_orders ? Number(data.max_preparing_orders) : null;
    const maxUnits = data.max_preparing_units ? Number(data.max_preparing_units) : null;
    if (!locationId || !name || name.length > MAX_NAME_LENGTH || sortOrder === null || (maxOrders !== null && (!Number.isInteger(maxOrders) || maxOrders < 1)) || (maxUnits !== null && (!Number.isInteger(maxUnits) || maxUnits < 1))) return redirectAdmin(addFlash, "error", "不正な提供場所設定です", "locations");
    const db = getDb();
    const updated = runSql(db, "UPDATE fulfillment_locations SET name = ?, sort_order = ?, max_preparing_orders = ?, max_preparing_units = ?, updated_at = datetime('now') WHERE id = ?", name, sortOrder, maxOrders, maxUnits, locationId);
    if (!updated.changes) return redirectAdmin(addFlash, "error", "提供場所が見つかりません", "locations");
    recordAdminAction(db, actor, "location_settings_changed", { locationId, name, sortOrder, maxOrders, maxUnits });
    return redirectAdmin(addFlash, "success", "提供場所を更新しました", "locations");
  })
  .post("/api/admin/locations/:id/toggle-active", ({ params: { id }, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const locationId = parseAdminId(id);
    if (!locationId) return redirectAdmin(addFlash, "error", "不正な提供場所IDです", "locations");
    const db = getDb();
    const location = getOne<{ active: number }>(db, "SELECT active FROM fulfillment_locations WHERE id = ?", locationId);
    if (!location) return redirectAdmin(addFlash, "error", "提供場所が見つかりません", "locations");
    if (location.active) {
      const activeTasks = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM order_fulfillments WHERE location_id = ? AND status IN ('preparing', 'ready')", locationId)?.count ?? 0;
      if (activeTasks > 0) return redirectAdmin(addFlash, "error", `進行中の提供タスクが${activeTasks}件あるため停止できません`, "locations");
    }
    runSql(db, "UPDATE fulfillment_locations SET active = ?, updated_at = datetime('now') WHERE id = ?", location.active ? 0 : 1, locationId);
    recordAdminAction(db, actor, "location_availability_changed", { locationId, active: !location.active });
    wsManager.broadcastToMonitor(getMonitorBoard());
    return redirectAdmin(addFlash, "success", location.active ? "提供場所を停止しました" : "提供場所を再開しました", "locations");
  });
