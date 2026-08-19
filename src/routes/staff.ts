import { Elysia } from "elysia";
import { getAll, getDb, getOne, runSql } from "../db/database";
import { authMiddleware, type UserInfo } from "../middleware/auth";
import { config } from "../config";
import { reserveDisplayNumber, todayDate } from "../services/numbering";
import { getCustomerOrderByToken, getMonitorBoard } from "../services/fulfillment";
import { wsManager } from "../services/websocket";
import { getProviderTasks } from "./provider";
import { staffPage } from "../views/staff";
import type { CashierOrder, FulfillmentStatus, OrderStatus } from "../contracts/view-models";
import { recordAuditEvent } from "../services/audit";
import { utcNowIso } from "../services/time";

type RequestedItem = { item_id: number; quantity: number };
type ItemRow = {
  id: number;
  name: string;
  active: number;
  sold_out: number;
  fulfillment_location_id: number;
  location_name: string;
  location_active: number;
  max_quantity_per_order: number | null;
  daily_limit: number | null;
};

function requireCashier(user: UserInfo | null, api = false): UserInfo | Response {
  if (!user) return api
    ? new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : new Response(null, { status: 302, headers: { Location: "/login" } });
  if (user.role !== "admin" && user.role !== "cashier") return api
    ? new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : new Response("アクセス権限がありません", { status: 403 });
  return user;
}

function generateToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, byte => byte.toString(16).padStart(2, "0")).join("");
}

function isWithinOrderingHours(openTime: string | null, closeTime: string | null): boolean {
  if (!openTime && !closeTime) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = parts.find(part => part.type === "hour")?.value ?? "00";
  const minute = parts.find(part => part.type === "minute")?.value ?? "00";
  const current = `${hour}:${minute}`;
  if (openTime && current < openTime) return false;
  if (closeTime && current > closeTime) return false;
  return true;
}

export function getCashierOrders(): CashierOrder[] {
  const db = getDb();
  const orders = getAll<{ id: string; display_number: number; display_number_date: string; status: OrderStatus; created_at: string }>(
    db,
    `SELECT id, display_number, display_number_date, status, created_at FROM orders
     WHERE status IN ('preparing', 'available') ORDER BY created_at DESC`,
  );
  const fulfillments = getAll<{ id: string; order_id: string; location_name: string; status: FulfillmentStatus }>(
    db,
    `SELECT f.id, f.order_id, l.name AS location_name, f.status
     FROM order_fulfillments f JOIN fulfillment_locations l ON l.id = f.location_id
     WHERE f.order_id IN (SELECT id FROM orders WHERE status IN ('preparing', 'available'))
     ORDER BY l.sort_order ASC, l.id ASC`,
  );
  const items = getAll<{ fulfillment_id: string; name: string; quantity: number }>(
    db,
    `SELECT fulfillment_id, item_name AS name, quantity FROM order_items
     WHERE order_id IN (SELECT id FROM orders WHERE status IN ('preparing', 'available'))
     ORDER BY id ASC`,
  );
  const itemMap = new Map<string, { name: string; quantity: number }[]>();
  for (const item of items) {
    const group = itemMap.get(item.fulfillment_id) ?? [];
    group.push({ name: item.name, quantity: item.quantity });
    itemMap.set(item.fulfillment_id, group);
  }
  const fulfillmentMap = new Map<string, CashierOrder["fulfillments"]>();
  for (const fulfillment of fulfillments) {
    const group = fulfillmentMap.get(fulfillment.order_id) ?? [];
    group.push({
      id: fulfillment.id,
      location_name: fulfillment.location_name,
      status: fulfillment.status,
      items: itemMap.get(fulfillment.id) ?? [],
    });
    fulfillmentMap.set(fulfillment.order_id, group);
  }
  return orders.map(order => ({ ...order, fulfillments: fulfillmentMap.get(order.id) ?? [] }));
}

export function getStaffItems() {
  return getAll<{ id: number; name: string; sold_out: number; sort_order: number; location_name: string; max_quantity_per_order: number | null }>(
    getDb(),
    `SELECT i.id, i.name, i.sold_out, i.sort_order, l.name AS location_name, i.max_quantity_per_order
     FROM items i JOIN fulfillment_locations l ON l.id = i.fulfillment_location_id
     WHERE i.active = 1 AND l.active = 1 ORDER BY i.sort_order ASC, i.id ASC`,
  );
}

export const staffRoutes = new Elysia()
  .use(authMiddleware)
  .get("/staff", (context) => {
    const user = requireCashier(context.getUser());
    if (user instanceof Response) return user;
    const { securityNonce } = context as typeof context & { securityNonce: string };
    return new Response(staffPage(getStaffItems(), getCashierOrders(), securityNonce), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })
  .post("/api/staff/orders", ({ body, set, getUser }) => {
    const user = requireCashier(getUser(), true);
    if (user instanceof Response) return user;
    const payload = (body ?? {}) as { items?: RequestedItem[]; client_request_id?: string };
    const items = payload.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) { set.status = 400; return { error: "商品を選択してください" }; }
    if (payload.client_request_id !== undefined && (typeof payload.client_request_id !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(payload.client_request_id))) {
      set.status = 400; return { error: "不正なリクエストIDです" };
    }

    const ids = new Set<number>();
    for (const item of items) {
      if (!item || !Number.isInteger(item.item_id) || item.item_id < 1 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 || ids.has(item.item_id)) {
        set.status = 400; return { error: "不正な注文データです" };
      }
      ids.add(item.item_id);
    }

    const db = getDb();
    if (payload.client_request_id) {
      const existing = getOne<{ id: string; display_number: number; token: string }>(db, "SELECT id, display_number, token FROM orders WHERE created_by = ? AND client_request_id = ?", user.id, payload.client_request_id);
      if (existing) return { ...existing, display_number_padded: config.displayNumberPad(existing.display_number), duplicated: true };
    }

    const orderId = crypto.randomUUID();
    const token = generateToken();
    const date = todayDate();
    const now = utcNowIso();
    const affectedLocations = new Set<number>();

    const createOrder = db.transaction(() => {
      const settings = getOne<{
        ordering_enabled: number;
        order_open_time: string | null;
        order_close_time: string | null;
        daily_order_limit: number | null;
        max_items_per_order: number;
        max_total_quantity: number;
      }>(db, "SELECT ordering_enabled, order_open_time, order_close_time, daily_order_limit, max_items_per_order, max_total_quantity FROM app_settings WHERE id = 1");
      if (!settings?.ordering_enabled) throw new Error("現在、注文受付を停止しています");
      if (!isWithinOrderingHours(settings.order_open_time, settings.order_close_time)) throw new Error("現在は注文受付時間外です");
      if (items.length > settings.max_items_per_order) throw new Error("1回に注文できる商品種類数を超えています");
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      if (totalQuantity > settings.max_total_quantity) throw new Error("1回に注文できる数量を超えています");
      if (settings.daily_order_limit) {
        const count = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM orders WHERE display_number_date = ? AND status != 'cancelled'", date)?.count ?? 0;
        if (count >= settings.daily_order_limit) throw new Error("本日の注文受付上限に達しました");
      }

      const itemRows = new Map<number, ItemRow>();
      const locationQuantities = new Map<number, number>();
      for (const requested of items) {
        const row = getOne<ItemRow>(
          db,
          `SELECT i.id, i.name, i.active, i.sold_out, i.fulfillment_location_id,
                  i.max_quantity_per_order, i.daily_limit,
                  l.name AS location_name, l.active AS location_active
           FROM items i JOIN fulfillment_locations l ON l.id = i.fulfillment_location_id
           WHERE i.id = ?`,
          requested.item_id,
        );
        if (!row) throw new Error(`商品ID ${requested.item_id} が見つかりません`);
        if (!row.active || row.sold_out || !row.location_active) throw new Error(`「${row.name}」は現在注文できません`);
        if (row.max_quantity_per_order && requested.quantity > row.max_quantity_per_order) throw new Error(`「${row.name}」は1注文${row.max_quantity_per_order}個までです`);
        const used = getOne<{ reserved_quantity: number }>(db, "SELECT reserved_quantity FROM daily_item_usage WHERE usage_date = ? AND item_id = ?", date, row.id)?.reserved_quantity ?? 0;
        if (row.daily_limit && used + requested.quantity > row.daily_limit) throw new Error(`「${row.name}」は本日の受付上限に達しました`);
        itemRows.set(row.id, row);
        locationQuantities.set(row.fulfillment_location_id, (locationQuantities.get(row.fulfillment_location_id) ?? 0) + requested.quantity);
      }

      for (const [locationId, newUnits] of locationQuantities) {
        const location = getOne<{ name: string; max_preparing_orders: number | null; max_preparing_units: number | null }>(
          db,
          "SELECT name, max_preparing_orders, max_preparing_units FROM fulfillment_locations WHERE id = ? AND active = 1",
          locationId,
        );
        if (!location) throw new Error("提供場所が利用できません");
        const pending = getOne<{ orders: number; units: number }>(
          db,
          `SELECT COUNT(DISTINCT f.id) AS orders, COALESCE(SUM(oi.quantity), 0) AS units
           FROM order_fulfillments f LEFT JOIN order_items oi ON oi.fulfillment_id = f.id
           WHERE f.location_id = ? AND f.status = 'preparing'`,
          locationId,
        );
        if (location.max_preparing_orders && (pending?.orders ?? 0) + 1 > location.max_preparing_orders) throw new Error(`「${location.name}」の受付上限に達しました`);
        if (location.max_preparing_units && (pending?.units ?? 0) + newUnits > location.max_preparing_units) throw new Error(`「${location.name}」の準備可能数を超えています`);
      }

      const displayNumber = reserveDisplayNumber(db, date);
      runSql(db, "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at, client_request_id, created_by) VALUES (?, ?, ?, 'preparing', ?, ?, ?, ?, ?)", orderId, displayNumber, date, token, now, now, payload.client_request_id ?? null, user.id);

      const fulfillmentIds = new Map<number, string>();
      for (const locationId of locationQuantities.keys()) {
        const fulfillmentId = crypto.randomUUID();
        fulfillmentIds.set(locationId, fulfillmentId);
        affectedLocations.add(locationId);
        runSql(db, "INSERT INTO order_fulfillments (id, order_id, location_id, status, created_at, updated_at) VALUES (?, ?, ?, 'preparing', ?, ?)", fulfillmentId, orderId, locationId, now, now);
        runSql(db, "INSERT INTO fulfillment_events (fulfillment_id, from_status, to_status, changed_by) VALUES (?, NULL, 'preparing', ?)", fulfillmentId, user.id);
      }
      for (const requested of items) {
        const row = itemRows.get(requested.item_id)!;
        runSql(db, "INSERT INTO order_items (order_id, item_id, quantity, item_name, fulfillment_id) VALUES (?, ?, ?, ?, ?)", orderId, row.id, requested.quantity, row.name, fulfillmentIds.get(row.fulfillment_location_id)!);
        runSql(db, `INSERT INTO daily_item_usage (usage_date, item_id, reserved_quantity, updated_at) VALUES (?, ?, ?, datetime('now'))
                    ON CONFLICT(usage_date, item_id) DO UPDATE SET reserved_quantity = reserved_quantity + excluded.reserved_quantity, updated_at = datetime('now')`, date, row.id, requested.quantity);
      }
      recordAuditEvent(db, {
        orderId,
        displayNumber,
        displayNumberDate: date,
        eventType: "order_created",
        toStatus: "preparing",
        actorUserId: user.id,
        actorUsername: user.username,
        details: { itemKinds: items.length, totalQuantity },
      });
      return displayNumber;
    });

    let displayNumber: number;
    try { displayNumber = createOrder(); }
    catch (error) {
      if (payload.client_request_id) {
        const existing = getOne<{ id: string; display_number: number; token: string }>(db, "SELECT id, display_number, token FROM orders WHERE created_by = ? AND client_request_id = ?", user.id, payload.client_request_id);
        if (existing) return { ...existing, display_number_padded: config.displayNumberPad(existing.display_number), duplicated: true };
      }
      set.status = 409;
      return { error: error instanceof Error ? error.message : "注文を作成できませんでした" };
    }

    for (const locationId of affectedLocations) wsManager.broadcastToProvider(locationId, { tasks: getProviderTasks(locationId) });
    wsManager.broadcastToMonitor(getMonitorBoard());
    set.status = 201;
    return { id: orderId, display_number: displayNumber, display_number_padded: config.displayNumberPad(displayNumber), token };
  })
  .patch("/api/staff/orders/:id/status", ({ params: { id }, body, set, getUser }) => {
    const user = requireCashier(getUser(), true);
    if (user instanceof Response) return user;
    const { status, reason } = (body ?? {}) as { status?: string; reason?: string };
    if (status !== "cancelled") { set.status = 400; return { error: "受付画面から変更できるのはキャンセルだけです" }; }
    const cancellationReason = typeof reason === "string" ? reason.trim() : "";
    if (!cancellationReason || cancellationReason.length > 200) { set.status = 400; return { error: "200文字以内のキャンセル理由を入力してください" }; }
    const db = getDb();
    const order = getOne<{ status: string; display_number: number; display_number_date: string; token: string }>(db, "SELECT status, display_number, display_number_date, token FROM orders WHERE id = ?", id);
    if (!order) { set.status = 404; return { error: "注文が見つかりません" }; }
    if (!["preparing", "available"].includes(order.status)) { set.status = 409; return { error: "この注文はキャンセルできません" }; }
    const locations = getAll<{ location_id: number }>(db, "SELECT DISTINCT location_id FROM order_fulfillments WHERE order_id = ?", id);
    const cancelOrder = db.transaction(() => {
      const changed = runSql(db, "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = ?", id, order.status);
      const tasks = getAll<{ id: string; status: string }>(db, "SELECT id, status FROM order_fulfillments WHERE order_id = ? AND status != 'cancelled'", id);
      if (tasks.some(task => task.status === "handed_over")) throw new Error("受け渡し済みの商品があるため、注文全体はキャンセルできません");
      if (changed.changes !== 1) throw new Error("注文が別の端末で更新されました");
      runSql(db, "UPDATE orders SET cancelled_by = ?, cancellation_reason = ?, cancelled_at = ?, updated_at = ? WHERE id = ?", user.id, cancellationReason, utcNowIso(), utcNowIso(), id);
      const refundableFulfillments = new Set(tasks.map(task => task.id));
      for (const task of tasks) {
        runSql(db, "UPDATE order_fulfillments SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", task.id);
        runSql(db, "INSERT INTO fulfillment_events (fulfillment_id, from_status, to_status, changed_by) VALUES (?, ?, 'cancelled', ?)", task.id, task.status, user.id);
      }
      const orderedItems = getAll<{ fulfillment_id: string; item_id: number; quantity: number }>(
        db,
        "SELECT fulfillment_id, item_id, quantity FROM order_items WHERE order_id = ?",
        id,
      );
      for (const item of orderedItems) {
        if (refundableFulfillments.has(item.fulfillment_id)) runSql(db, "UPDATE daily_item_usage SET reserved_quantity = MAX(0, reserved_quantity - ?), updated_at = datetime('now') WHERE usage_date = ? AND item_id = ?", item.quantity, order.display_number_date, item.item_id);
      }
      recordAuditEvent(db, {
        orderId: id,
        displayNumber: order.display_number,
        displayNumberDate: order.display_number_date,
        eventType: "order_cancelled",
        fromStatus: order.status,
        toStatus: "cancelled",
        actorUserId: user.id,
        actorUsername: user.username,
        details: { reason: cancellationReason },
      });
    });
    try { cancelOrder(); }
    catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : "注文をキャンセルできませんでした" }; }
    for (const location of locations) wsManager.broadcastToProvider(location.location_id, { tasks: getProviderTasks(location.location_id) });
    wsManager.broadcastToMonitor(getMonitorBoard());
    const customer = getCustomerOrderByToken(order.token);
    if (customer) wsManager.broadcastToOrder(order.token, customer);
    return { status: "cancelled" };
  })
  .get("/api/staff/orders", ({ getUser }) => {
    const user = requireCashier(getUser(), true);
    if (user instanceof Response) return user;
    return getCashierOrders();
  })
  .get("/api/staff/items", ({ getUser }) => {
    const user = requireCashier(getUser(), true);
    if (user instanceof Response) return user;
    return getStaffItems();
  });
