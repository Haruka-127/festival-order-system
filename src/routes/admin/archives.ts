import { Elysia } from "elysia";
import type { Database } from "bun:sqlite";
import { getAll, getOne } from "../../db/database";
import { authMiddleware } from "../../middleware/auth";
import { ArchiveError, getOrderArchive, getOrderGeneration, getResetPreview, listOrderArchives, readOrderArchive, resetOrderHistory, validArchiveId } from "../../services/order-archives";
import { getMonitorBoard } from "../../services/fulfillment";
import { wsManager } from "../../services/websocket";
import { adminPage } from "../../views/admin";
import type { AdminEvent, AdminOrder, AdminPageState, ArchivePageData } from "../../views/admin/types";
import { requireAdmin } from "./shared";

const root = "/admin/settings/archives";
const eventFields = "display_number, location_name, event_type, from_status, to_status, actor_username AS username, details, created_at";
const pageNumber = (value?: string) => value && /^\d+$/.test(value) ? Math.max(1, Math.min(Number(value), 1_000_000)) : 1;

function pagination(page: number, totalPages: number, href: (page: number) => string) {
  return { page, totalPages, previousHref: page > 1 ? href(page - 1) : null, nextHref: page < totalPages ? href(page + 1) : null };
}

function render(data: ArchivePageData, state: AdminPageState = {}, status = 200): Response {
  return new Response(adminPage([], [], [], null, "", undefined, undefined, [], [], "archives", undefined, { ...state, archivePage: data }), {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function archivePage(id: string, reader: (db: Database, archive: NonNullable<ReturnType<typeof getOrderArchive>>) => Response): Response {
  const archive = getOrderArchive(id);
  if (!archive) return render({ kind: "error", message: "バックアップが見つかりません" }, {}, 404);
  try { return readOrderArchive(archive, db => reader(db, archive)); }
  catch (error) {
    console.error(JSON.stringify({ event: "archive_read_failed", archiveId: id, error: error instanceof Error ? error.message : String(error) }));
    return render({ kind: "error", message: error instanceof ArchiveError ? error.message : "バックアップを読み込めません。保存ファイルを確認してください" }, {}, 503);
  }
}

export const adminArchiveRoutes = new Elysia()
  .use(authMiddleware)
  .get(root, ({ getUser, query }) => {
    const actor = requireAdmin(getUser(), false);
    if (actor instanceof Response) return actor;
    const list = listOrderArchives(pageNumber(query.page));
    return render({ kind: "index", archives: list.archives }, { pagination: pagination(list.page, list.totalPages, page => `${root}?page=${page}`) });
  })
  .get(`${root}/:id`, ({ getUser, params: { id }, query }) => {
    const actor = requireAdmin(getUser(), false);
    if (actor instanceof Response) return actor;
    return archivePage(id, (db, archive) => {
      const filter = query.status === "active" || query.status === "completed" ? query.status : "all";
      const where = filter === "active" ? "WHERE status IN ('preparing', 'available')" : filter === "completed" ? "WHERE status IN ('delivered', 'cancelled')" : "";
      const total = getOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM orders ${where}`)!.count;
      const totalPages = Math.max(1, Math.ceil(total / 50));
      const page = Math.min(pageNumber(query.page), totalPages);
      const orders = getAll<AdminOrder>(db, `SELECT o.id, o.display_number, o.status, o.created_at, '' AS token,
        COALESCE((SELECT GROUP_CONCAT(oi.item_name || ' × ' || oi.quantity, ', ') FROM order_items oi WHERE oi.order_id = o.id), '') AS items
        FROM orders o ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT 50 OFFSET ?`, (page - 1) * 50);
      const soldUnits = getOne<{ quantity: number }>(db, "SELECT COALESCE(SUM(quantity), 0) AS quantity FROM fulfilled_item_sales")!.quantity;
      const sales = getAll<{ name: string; quantity: number }>(db, "SELECT item_name AS name, SUM(quantity) AS quantity FROM fulfilled_item_sales GROUP BY item_id, item_name ORDER BY quantity DESC, name ASC");
      return render({ kind: "orders", archive, orders, soldUnits, sales }, { orderFilter: filter, pagination: pagination(page, totalPages, next => `${root}/${id}?status=${filter}&page=${next}`) });
    });
  })
  .get(`${root}/:id/history`, ({ getUser, params: { id }, query }) => {
    const actor = requireAdmin(getUser(), false);
    if (actor instanceof Response) return actor;
    return archivePage(id, (db, archive) => {
      const total = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM audit_events")!.count;
      const totalPages = Math.max(1, Math.ceil(total / 50));
      const page = Math.min(pageNumber(query.page), totalPages);
      const events = getAll<AdminEvent>(db, `SELECT ${eventFields} FROM audit_events ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ?`, (page - 1) * 50);
      return render({ kind: "history", archive, events }, { pagination: pagination(page, totalPages, next => `${root}/${id}/history?page=${next}`) });
    });
  })
  .get(`${root}/:id/orders/:orderId`, ({ getUser, params: { id, orderId }, query }) => {
    const actor = requireAdmin(getUser(), false);
    if (actor instanceof Response) return actor;
    return archivePage(id, (db, archive) => {
      const order = getOne<Extract<ArchivePageData, { kind: "detail" }>["order"]>(db, `SELECT o.id, o.display_number, o.display_number_date, o.status,
        o.created_at, o.updated_at, o.cancellation_reason,
        COALESCE((SELECT actor_username FROM audit_events WHERE order_id = o.id AND event_type = 'order_created' ORDER BY id LIMIT 1), u.username) AS created_by_name
        FROM orders o LEFT JOIN users u ON u.id = o.created_by WHERE o.id = ?`, orderId);
      if (!order) return render({ kind: "error", message: "保存された注文が見つかりません" }, {}, 404);
      const fulfillments = getAll<{ id: string; location_name: string; status: string; ready_at: string | null; handed_over_at: string | null }>(db,
        `SELECT f.id, l.name AS location_name, f.status, f.ready_at, f.handed_over_at FROM order_fulfillments f
         JOIN fulfillment_locations l ON l.id = f.location_id WHERE f.order_id = ? ORDER BY l.sort_order, l.id`, orderId)
        .map(task => ({ ...task, items: getAll<{ name: string; quantity: number }>(db, "SELECT item_name AS name, quantity FROM order_items WHERE fulfillment_id = ? ORDER BY id", task.id) }));
      const total = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM audit_events WHERE order_id = ?", orderId)!.count;
      const totalPages = Math.max(1, Math.ceil(total / 50));
      const page = Math.min(pageNumber(query.page), totalPages);
      const events = getAll<AdminEvent>(db, `SELECT ${eventFields} FROM audit_events WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 50 OFFSET ?`, orderId, (page - 1) * 50);
      return render({ kind: "detail", archive, order, fulfillments, events }, { pagination: pagination(page, totalPages, next => `${root}/${id}/orders/${encodeURIComponent(orderId)}?page=${next}`) });
    });
  })
  .get("/api/admin/order-history/preview", ({ getUser }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    return getResetPreview();
  })
  .post("/api/admin/order-history/reset", ({ getUser, body, set }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const data = (body ?? {}) as { request_id?: unknown; revision?: unknown; confirmation?: unknown };
    if (data.confirmation !== "リセット" || typeof data.request_id !== "string" || !validArchiveId(data.request_id) || typeof data.revision !== "string" || !/^[a-f0-9]{64}$/.test(data.revision)) {
      set.status = 400;
      return { error: "対象を確認し、確認文字「リセット」を入力してください" };
    }
    let result;
    try { result = resetOrderHistory(actor, data.request_id, data.revision); }
    catch (error) {
      if (!(error instanceof ArchiveError)) console.error(JSON.stringify({ event: "order_reset_failed", error: error instanceof Error ? error.message : String(error) }));
      set.status = error instanceof ArchiveError ? error.status : 503;
      return { error: error instanceof ArchiveError ? error.message : "バックアップまたはリセットに失敗しました。注文データは変更していません" };
    }
    if (!result.duplicated) {
      // Notification failures must not turn a committed reset into an HTTP error.
      try {
        wsManager.broadcastOrderReset(getOrderGeneration());
        wsManager.broadcastToMonitor(getMonitorBoard());
      } catch (error) { console.error(JSON.stringify({ event: "order_reset_notification_failed", error: String(error) })); }
    }
    return { success: true, archive_id: result.archive.id, duplicated: result.duplicated };
  });
