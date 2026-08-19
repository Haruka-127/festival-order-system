import { Elysia } from "elysia";
import { getAll, getDb, getOne } from "../../db/database";
import { authMiddleware, type UserInfo } from "../../middleware/auth";
import { getCurrentDisplayNumber } from "../../services/numbering";
import type { FlashMessage } from "../../services/flash";
import { adminPage, type AdminSection } from "../../views/admin";
import { requireAdmin } from "./shared";

const PAGE_SIZE = 50;
type OrderFilter = "active" | "completed" | "all";
type AdminPageContext = { getUser: () => UserInfo | null; consumeFlash: () => FlashMessage[]; securityNonce?: string; query?: Record<string, string | undefined> };

function parsePage(value: string | undefined): number {
  return value && /^\d+$/.test(value) && Number(value) > 0 ? Math.min(Number(value), 1_000_000) : 1;
}

function pagination(page: number, total: number, hrefForPage: (page: number) => string) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  return {
    page: currentPage,
    totalPages,
    previousHref: currentPage > 1 ? hrefForPage(currentPage - 1) : null,
    nextHref: currentPage < totalPages ? hrefForPage(currentPage + 1) : null,
  };
}

function renderAdminPage(context: AdminPageContext, activeSection: AdminSection): Response {
  const { getUser, consumeFlash } = context;
  const result = requireAdmin(getUser(), false);
  if (result instanceof Response) return result;
  const db = getDb();
  const requestedPage = parsePage(context.query?.page);
  const orderFilter: OrderFilter = ["active", "completed", "all"].includes(context.query?.status ?? "")
    ? context.query!.status as OrderFilter : "active";
  const orderWhere = orderFilter === "active" ? "WHERE o.status IN ('preparing', 'available')"
    : orderFilter === "completed" ? "WHERE o.status IN ('delivered', 'cancelled')" : "";
  const orderTotal = activeSection === "orders"
    ? getOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM orders o ${orderWhere}`)?.count ?? 0 : 0;
  const orderPagination = pagination(requestedPage, orderTotal, page => `/admin/orders?status=${orderFilter}&page=${page}`);

  const items = activeSection === "items" ? getAll<{
    id: number; name: string; active: number; sold_out: number; sort_order: number;
    fulfillment_location_id: number; location_name: string; max_quantity_per_order: number | null; daily_limit: number | null;
  }>(db, `SELECT i.id, i.name, i.active, i.sold_out, i.sort_order, i.fulfillment_location_id,
                  i.max_quantity_per_order, i.daily_limit, l.name AS location_name
           FROM items i JOIN fulfillment_locations l ON l.id = i.fulfillment_location_id
           ORDER BY i.sort_order ASC, i.id ASC`) : [];

  const orders = activeSection === "orders" ? getAll<{
    id: string; display_number: number; status: string; created_at: string; items: string | null; token: string;
  }>(db, `SELECT o.id, o.display_number, o.status, o.created_at, o.token,
           (SELECT GROUP_CONCAT(l.name || ' [' ||
              CASE f.status WHEN 'preparing' THEN '準備中' WHEN 'ready' THEN '提供可能' WHEN 'handed_over' THEN '受渡済' ELSE 'キャンセル' END ||
              '] ' || oi.item_name || ' x' || oi.quantity, ', ')
            FROM order_items oi
            LEFT JOIN order_fulfillments f ON f.id = oi.fulfillment_id
            LEFT JOIN fulfillment_locations l ON l.id = f.location_id
            WHERE oi.order_id = o.id) AS items
           FROM orders o ${orderWhere} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, PAGE_SIZE, (orderPagination.page - 1) * PAGE_SIZE)
    .map(order => ({ ...order, items: order.items ?? "" })) : [];

  const users = activeSection === "users" ? getAll<{
    id: string; username: string; role: string; staff_type: string; fulfillment_location_id: number | null; location_name: string | null; created_at: string;
  }>(db, `SELECT u.id, u.username, u.role, u.staff_type, u.fulfillment_location_id,
                  l.name AS location_name, u.created_at
           FROM users u LEFT JOIN fulfillment_locations l ON l.id = u.fulfillment_location_id
           ORDER BY u.role ASC, u.username ASC`) : [];

  const locations = ["items", "users", "settings", "locations"].includes(activeSection) ? getAll<{
    id: number; name: string; slug: string; active: number; sort_order: number; max_preparing_orders: number | null; max_preparing_units: number | null;
  }>(db, "SELECT id, name, slug, active, sort_order, max_preparing_orders, max_preparing_units FROM fulfillment_locations ORDER BY sort_order ASC, id ASC") : [];

  const settings = getOne<{
    ordering_enabled: number; order_open_time: string | null; order_close_time: string | null; daily_order_limit: number | null;
    max_items_per_order: number; max_total_quantity: number; completed_order_retention_days: number;
  }>(db, "SELECT ordering_enabled, order_open_time, order_close_time, daily_order_limit, max_items_per_order, max_total_quantity, completed_order_retention_days FROM app_settings WHERE id = 1")!;

  const historyTotal = activeSection === "history" ? getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM audit_events")?.count ?? 0 : 0;
  const historyPagination = pagination(requestedPage, historyTotal, page => `/admin/settings/history?page=${page}`);
  const events = activeSection === "history" ? getAll<{
    display_number: number; location_name: string | null; event_type: string; from_status: string | null; to_status: string | null;
    username: string | null; details: string | null; created_at: string;
  }>(db, `SELECT display_number, location_name, event_type, from_status, to_status,
                  actor_username AS username, details, created_at
           FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, PAGE_SIZE, (historyPagination.page - 1) * PAGE_SIZE) : [];

  const currentNum = activeSection === "advanced" ? getCurrentDisplayNumber() : null;
  const orderCounts = getOne<{ preparing: number; available: number }>(db, `SELECT
      COALESCE(SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END), 0) AS preparing,
      COALESCE(SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END), 0) AS available
    FROM orders`) ?? { preparing: 0, available: 0 };

  const pageState = activeSection === "orders" ? { orderFilter, pagination: orderPagination }
    : activeSection === "history" ? { pagination: historyPagination } : {};
  return new Response(adminPage(items, orders, users, currentNum, context.securityNonce ?? "", locations, settings, events, consumeFlash(), activeSection, orderCounts, pageState), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const adminPageRoutes = new Elysia()
  .use(authMiddleware)
  .get("/admin", () => new Response(null, { status: 302, headers: { Location: "/admin/items" } }))
  .get("/admin/items", context => renderAdminPage(context as AdminPageContext, "items"))
  .get("/admin/orders", context => renderAdminPage(context as AdminPageContext, "orders"))
  .get("/admin/users", context => renderAdminPage(context as AdminPageContext, "users"))
  .get("/admin/settings", context => renderAdminPage(context as AdminPageContext, "settings"))
  .get("/admin/settings/locations", context => renderAdminPage(context as AdminPageContext, "locations"))
  .get("/admin/settings/history", context => renderAdminPage(context as AdminPageContext, "history"))
  .get("/admin/settings/advanced", context => renderAdminPage(context as AdminPageContext, "advanced"));
