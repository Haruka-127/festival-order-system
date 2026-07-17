import type { Database } from "bun:sqlite";
import { getAll, getDb, getOne, runSql } from "../db/database";

export type MonitorEntry = {
  fulfillment_id: string;
  display_number: number;
  created_at: string;
  ready_at?: string | null;
};

export type MonitorLocation = {
  id: number;
  name: string;
  sort_order: number;
  waiting: MonitorEntry[];
  calling: MonitorEntry[];
};

export type MonitorBoard = { locations: MonitorLocation[] };

export type CustomerFulfillment = {
  id: string;
  location_name: string;
  status: string;
  items: { name: string; quantity: number }[];
};

export type CustomerOrder = {
  display_number: number;
  status: string;
  created_at: string;
  fulfillments: CustomerFulfillment[];
};

export function getMonitorBoard(db = getDb()): MonitorBoard {
  const locations = getAll<{ id: number; name: string; sort_order: number }>(
    db,
    `SELECT id, name, sort_order
     FROM fulfillment_locations
     WHERE active = 1
     ORDER BY sort_order ASC, id ASC`,
  );
  const rows = getAll<{
    fulfillment_id: string;
    location_id: number;
    status: "preparing" | "ready";
    display_number: number;
    created_at: string;
    ready_at: string | null;
  }>(
    db,
    `SELECT f.id AS fulfillment_id, f.location_id, f.status, o.display_number,
            f.created_at, f.ready_at
     FROM order_fulfillments f
     JOIN orders o ON o.id = f.order_id
     JOIN fulfillment_locations l ON l.id = f.location_id
     WHERE l.active = 1
       AND f.status IN ('preparing', 'ready')
       AND o.status != 'cancelled'
     ORDER BY l.sort_order ASC, l.id ASC,
              CASE f.status WHEN 'preparing' THEN f.created_at ELSE f.ready_at END ASC,
              o.display_number ASC`,
  );

  const boardLocations = locations.map(location => ({ ...location, waiting: [], calling: [] } as MonitorLocation));
  const byId = new Map(boardLocations.map(location => [location.id, location]));
  for (const row of rows) {
    const location = byId.get(row.location_id);
    if (!location) continue;
    const entry: MonitorEntry = {
      fulfillment_id: row.fulfillment_id,
      display_number: row.display_number,
      created_at: row.created_at,
      ready_at: row.ready_at,
    };
    if (row.status === "preparing") location.waiting.push(entry);
    else location.calling.push(entry);
  }
  return { locations: boardLocations };
}

export function getCustomerOrderByToken(token: string, db = getDb()): CustomerOrder | null {
  const order = getOne<{ id: string; display_number: number; status: string; created_at: string }>(
    db,
    "SELECT id, display_number, status, created_at FROM orders WHERE token = ?",
    token,
  );
  if (!order) return null;

  const fulfillments = getAll<{
    id: string;
    location_name: string;
    status: string;
  }>(
    db,
    `SELECT f.id, l.name AS location_name, f.status
     FROM order_fulfillments f
     JOIN fulfillment_locations l ON l.id = f.location_id
     WHERE f.order_id = ?
     ORDER BY l.sort_order ASC, l.id ASC`,
    order.id,
  );
  const items = getAll<{ fulfillment_id: string; name: string; quantity: number }>(
    db,
    `SELECT fulfillment_id, item_name AS name, quantity
     FROM order_items
     WHERE order_id = ?
     ORDER BY id ASC`,
    order.id,
  );
  const itemMap = new Map<string, { name: string; quantity: number }[]>();
  for (const item of items) {
    if (!item.fulfillment_id) continue;
    const group = itemMap.get(item.fulfillment_id) ?? [];
    group.push({ name: item.name, quantity: item.quantity });
    itemMap.set(item.fulfillment_id, group);
  }

  return {
    display_number: order.display_number,
    status: deriveCustomerStatus(order.status, fulfillments.map(item => item.status)),
    created_at: order.created_at,
    fulfillments: fulfillments.map(fulfillment => ({
      ...fulfillment,
      items: itemMap.get(fulfillment.id) ?? [],
    })),
  };
}

export function recomputeOrderStatus(db: Database, orderId: string): string {
  const order = getOne<{ status: string }>(db, "SELECT status FROM orders WHERE id = ?", orderId);
  if (!order) throw new Error("注文が見つかりません");
  if (order.status === "cancelled") return "cancelled";

  const counts = getOne<{ total: number; preparing: number; ready: number; handed_over: number; cancelled: number }>(
    db,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) AS preparing,
            SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
            SUM(CASE WHEN status = 'handed_over' THEN 1 ELSE 0 END) AS handed_over,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
     FROM order_fulfillments WHERE order_id = ?`,
    orderId,
  );
  const total = counts?.total ?? 0;
  let nextStatus = "preparing";
  if (total > 0 && (counts?.handed_over ?? 0) + (counts?.cancelled ?? 0) === total) nextStatus = "delivered";
  else if (total > 0 && (counts?.preparing ?? 0) === 0) nextStatus = "available";
  runSql(db, "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", nextStatus, orderId);
  return nextStatus;
}

function deriveCustomerStatus(orderStatus: string, statuses: string[]): string {
  if (orderStatus === "cancelled") return "cancelled";
  if (statuses.length > 0 && statuses.every(status => status === "handed_over" || status === "cancelled")) return "delivered";
  if (statuses.length > 0 && statuses.every(status => status !== "preparing")) return "available";
  if (statuses.some(status => status === "ready" || status === "handed_over")) return "partially_ready";
  return "preparing";
}
