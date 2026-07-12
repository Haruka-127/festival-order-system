import { Elysia } from "elysia";
import { getAll, getDb, getOne, runSql } from "../db/database";
import { authMiddleware } from "../middleware/auth";
import type { UserInfo } from "../middleware/auth";
import { wsManager } from "../services/websocket";
import { staffPage } from "../views/staff";
import { config } from "../config";
import { reserveDisplayNumber, todayDate } from "../services/numbering";

function getUserOrRedirect(user: UserInfo | null, roles: ("admin" | "staff")[]): UserInfo | Response {
  if (!user) return new Response(null, { status: 302, headers: { Location: "/login" } });
  if (!roles.includes(user.role)) return new Response("アクセス権限がありません", { status: 403 });
  return user;
}

function generateToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const staffRoutes = new Elysia()
  .use(authMiddleware)
  .get("/staff", (context) => {
    const { getUser } = context;
    const { securityNonce } = context as typeof context & { securityNonce: string };
    const result = getUserOrRedirect(getUser(), ["admin", "staff"]);
    if (result instanceof Response) return result;
    const db = getDb();

    const items = getAll<{ id: number; name: string; sold_out: number; sort_order: number }>(
      db,
      "SELECT id, name, sold_out, sort_order FROM items WHERE active = 1 ORDER BY sort_order ASC, id ASC"
    );

    const orders = getAll<{ id: string; display_number: number; status: string; created_at: string }>(
      db,
      `SELECT o.id, o.display_number, o.status, o.created_at
       FROM orders o WHERE o.status IN ('preparing', 'available')
       ORDER BY o.created_at DESC`
    );

    const orderItems = getAll<{ order_id: string; item_name: string; quantity: number }>(
      db,
      "SELECT order_id, item_name, quantity FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status IN ('preparing', 'available'))"
    );

    const orderMap = new Map<string, { name: string; quantity: number }[]>();
    for (const oi of orderItems) {
      if (!orderMap.has(oi.order_id)) orderMap.set(oi.order_id, []);
      orderMap.get(oi.order_id)!.push({ name: oi.item_name, quantity: oi.quantity });
    }

    const ordersWithItems = orders.map(o => ({
      ...o,
      items: orderMap.get(o.id) || [],
    }));

    return new Response(staffPage(items, ordersWithItems, securityNonce), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })

  .post("/api/staff/orders", async ({ body, set, getUser }) => {
    const result = getUserOrRedirect(getUser(), ["admin", "staff"]);
    if (result instanceof Response) return result;
    const { items } = (body ?? {}) as { items?: { item_id: number; quantity: number }[] };

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      set.status = 400;
      return { error: "商品を選択してください" };
    }

    const itemIds = new Set<number>();
    let totalQuantity = 0;
    for (const item of items) {
      if (!item || !Number.isInteger(item.item_id) || item.item_id < 1 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || itemIds.has(item.item_id)) {
        set.status = 400;
        return { error: "不正なデータです" };
      }
      itemIds.add(item.item_id);
      totalQuantity += item.quantity;
    }
    if (totalQuantity > 500) { set.status = 400; return { error: "一度に注文できる数量を超えています" }; }

    const db = getDb();

    const orderId = crypto.randomUUID();
    const token = generateToken();
    const date = todayDate();
    const now = new Date().toISOString();

    const createOrder = db.transaction(() => {
      const itemRows = new Map<number, { name: string }>();
      for (const item of items) {
        const row = getOne<{ id: number; name: string; active: number; sold_out: number }>(
          db,
          "SELECT id, name, active, sold_out FROM items WHERE id = ?",
          item.item_id
        );
        if (!row) throw new Error(`商品ID ${item.item_id} が見つかりません`);
        if (!row.active || row.sold_out) throw new Error(`「${row.name}」は現在注文できません`);
        itemRows.set(item.item_id, { name: row.name });
      }

      const displayNumber = reserveDisplayNumber(db, date);

      runSql(
        db,
        "INSERT INTO orders (id, display_number, display_number_date, status, token, created_at, updated_at) VALUES (?, ?, ?, 'preparing', ?, ?, ?)",
        orderId, displayNumber, date, token, now, now
      );

      for (const item of items) {
        const itemRow = itemRows.get(item.item_id)!;
        runSql(
          db,
          "INSERT INTO order_items (order_id, item_id, quantity, item_name) VALUES (?, ?, ?, ?)",
          orderId, item.item_id, item.quantity, itemRow.name
        );
      }

      return displayNumber;
    });

    let displayNumber: number;
    try {
      displayNumber = createOrder();
    } catch (error) {
      set.status = 400;
      return { error: error instanceof Error ? error.message : "注文を作成できませんでした" };
    }

    wsManager.broadcastToMonitor({
      numbers: getAvailableNumbers(),
    });

    set.status = 201;
    return {
      id: orderId,
      display_number: displayNumber,
      display_number_padded: config.displayNumberPad(displayNumber),
      token,
    };
  })

  .patch("/api/staff/orders/:id/status", async ({ params: { id }, body, set, getUser }) => {
    const result = getUserOrRedirect(getUser(), ["admin", "staff"]);
    if (result instanceof Response) return result;
    const { status } = (body ?? {}) as { status?: string };

    if (typeof status !== "string" || !["preparing", "available", "delivered", "cancelled"].includes(status)) {
      set.status = 400;
      return { error: "不正な状態です" };
    }

    const db = getDb();
    const order = getOne<{ id: string; status: string; token: string }>(
      db,
      "SELECT id, status, token FROM orders WHERE id = ?",
      id
    );

    if (!order) { set.status = 404; return { error: "注文が見つかりません" }; }

    const allowedTransitions: Record<string, string[]> = {
      preparing: ["available", "cancelled"],
      available: ["preparing", "delivered"],
      delivered: ["available"],
      cancelled: ["preparing"],
    };
    if (!allowedTransitions[order.status]?.includes(status)) {
      set.status = 409;
      return { error: "許可されていない状態変更です" };
    }

    runSql(db, "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = ?", status, id, order.status);

    wsManager.broadcastToMonitor({
      numbers: getAvailableNumbers(),
    });

    wsManager.broadcastToOrder(order.token, { status });

    return { status };
  })

  .get("/api/staff/orders", ({ getUser }) => {
    const result = getUserOrRedirect(getUser(), ["admin", "staff"]);
    if (result instanceof Response) return result;
    const db = getDb();

    const orders = getAll<{ id: string; display_number: number; status: string; created_at: string }>(
      db,
      `SELECT o.id, o.display_number, o.status, o.created_at
       FROM orders o WHERE o.status IN ('preparing', 'available')
       ORDER BY o.created_at DESC`
    );

    const orderItems = getAll<{ order_id: string; item_name: string; quantity: number }>(
      db,
      "SELECT order_id, item_name, quantity FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status IN ('preparing', 'available'))"
    );

    const orderMap = new Map<string, { name: string; quantity: number }[]>();
    for (const oi of orderItems) {
      if (!orderMap.has(oi.order_id)) orderMap.set(oi.order_id, []);
      orderMap.get(oi.order_id)!.push({ name: oi.item_name, quantity: oi.quantity });
    }

    return orders.map(o => ({
      id: o.id,
      display_number: o.display_number,
      status: o.status,
      created_at: o.created_at,
      items: orderMap.get(o.id) || [],
    }));
  });

function getAvailableNumbers(): number[] {
  const db = getDb();
  const rows = getAll<{ display_number: number }>(
    db,
    "SELECT display_number FROM orders WHERE status = 'available' ORDER BY display_number ASC"
  );
  return rows.map(r => r.display_number);
}
