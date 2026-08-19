import { Elysia } from "elysia";
import { getAll, getDb, getOne, runSql } from "../db/database";
import { authMiddleware, type UserInfo } from "../middleware/auth";
import { isValidWebSocketOrigin } from "../security";
import { getCustomerOrderByToken, getMonitorBoard, recomputeOrderStatus } from "../services/fulfillment";
import { wsManager } from "../services/websocket";
import { providerPage } from "../views/provider";
import type { FulfillmentStatus, ProviderTask } from "../contracts/view-models";
import { recordAuditEvent } from "../services/audit";
import { utcNowIso } from "../services/time";

function requireProvider(user: UserInfo | null, api = false): UserInfo | Response {
  if (!user) return api
    ? new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : new Response(null, { status: 302, headers: { Location: "/login" } });
  if (user.role !== "provider" || !user.fulfillmentLocationId) return api
    ? new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : new Response("アクセス権限がありません", { status: 403 });
  return user;
}

export function getProviderTasks(locationId: number): ProviderTask[] {
  const db = getDb();
  const tasks = getAll<{ id: string; display_number: number; display_number_date: string; status: FulfillmentStatus; created_at: string; handed_over_at: string | null }>(
    db,
    `SELECT f.id, o.display_number, o.display_number_date, f.status, f.created_at, f.handed_over_at
     FROM order_fulfillments f JOIN orders o ON o.id = f.order_id
     WHERE f.location_id = ?
       AND (f.status IN ('preparing', 'ready') OR (f.status = 'handed_over' AND julianday(f.handed_over_at) >= julianday('now', '-2 minutes')))
       AND o.status != 'cancelled'
     ORDER BY CASE f.status WHEN 'ready' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END,
              COALESCE(f.ready_at, f.created_at) ASC`,
    locationId,
  );
  const items = getAll<{ fulfillment_id: string; name: string; quantity: number }>(
    db,
    `SELECT fulfillment_id, item_name AS name, quantity FROM order_items
     WHERE fulfillment_id IN (
       SELECT id FROM order_fulfillments
       WHERE location_id = ? AND (status IN ('preparing', 'ready') OR (status = 'handed_over' AND julianday(handed_over_at) >= julianday('now', '-2 minutes')))
     )
     ORDER BY id ASC`,
    locationId,
  );
  const itemMap = new Map<string, { name: string; quantity: number }[]>();
  for (const item of items) {
    const group = itemMap.get(item.fulfillment_id) ?? [];
    group.push({ name: item.name, quantity: item.quantity });
    itemMap.set(item.fulfillment_id, group);
  }
  return tasks.map(task => ({ ...task, items: itemMap.get(task.id) ?? [] }));
}

export const providerRoutes = new Elysia()
  .use(authMiddleware)
  .get("/provider", (context) => {
    const user = requireProvider(context.getUser());
    if (user instanceof Response) return user;
    const { securityNonce } = context as typeof context & { securityNonce: string };
    return new Response(providerPage(user.fulfillmentLocationName ?? "提供場所", getProviderTasks(user.fulfillmentLocationId!), securityNonce), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  })
  .get("/api/provider/fulfillments", ({ getUser }) => {
    const user = requireProvider(getUser(), true);
    if (user instanceof Response) return user;
    return getProviderTasks(user.fulfillmentLocationId!);
  })
  .patch("/api/provider/fulfillments/:id/status", ({ params: { id }, body, set, getUser }) => {
    const user = requireProvider(getUser(), true);
    if (user instanceof Response) return user;
    const { status } = (body ?? {}) as { status?: string };
    if (!status || !["preparing", "ready", "handed_over"].includes(status)) {
      set.status = 400;
      return { error: "不正な状態です" };
    }
    const db = getDb();
    const task = getOne<{ order_id: string; status: string; token: string; display_number: number; display_number_date: string; location_name: string }>(
      db,
      `SELECT f.order_id, f.status, o.token, o.display_number, o.display_number_date, l.name AS location_name
       FROM order_fulfillments f JOIN orders o ON o.id = f.order_id
       JOIN fulfillment_locations l ON l.id = f.location_id
       WHERE f.id = ? AND f.location_id = ?`,
      id, user.fulfillmentLocationId!,
    );
    if (!task) { set.status = 404; return { error: "提供タスクが見つかりません" }; }
    const allowed: Record<string, string[]> = {
      preparing: ["ready"],
      ready: ["preparing", "handed_over"],
      handed_over: ["ready"],
    };
    if (!allowed[task.status]?.includes(status)) { set.status = 409; return { error: "許可されていない状態変更です" }; }

    const now = utcNowIso();
    const update = db.transaction(() => {
      const result = runSql(
        db,
        `UPDATE order_fulfillments SET status = ?,
           ready_at = CASE WHEN ? = 'ready' THEN ? WHEN ? = 'preparing' THEN NULL ELSE ready_at END,
           handed_over_at = CASE WHEN ? = 'handed_over' THEN ? ELSE NULL END,
           updated_at = ?
         WHERE id = ? AND location_id = ? AND status = ?`,
        status, status, now, status, status, now, now, id, user.fulfillmentLocationId!, task.status,
      );
      if (result.changes !== 1) throw new Error("状態が別の端末で更新されました");
      runSql(db, "INSERT INTO fulfillment_events (fulfillment_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)", id, task.status, status, user.id);
      recordAuditEvent(db, {
        orderId: task.order_id,
        fulfillmentId: id,
        displayNumber: task.display_number,
        displayNumberDate: task.display_number_date,
        locationName: task.location_name,
        eventType: "fulfillment_status",
        fromStatus: task.status,
        toStatus: status,
        actorUserId: user.id,
        actorUsername: user.username,
      });
      recomputeOrderStatus(db, task.order_id);
    });
    try { update(); } catch (error) { set.status = 409; return { error: error instanceof Error ? error.message : "更新できませんでした" }; }

    wsManager.broadcastToProvider(user.fulfillmentLocationId!, { tasks: getProviderTasks(user.fulfillmentLocationId!) });
    wsManager.broadcastToMonitor(getMonitorBoard());
    const customer = getCustomerOrderByToken(task.token);
    if (customer) wsManager.broadcastToOrder(task.token, customer);
    return { status };
  })
  .ws("/ws/provider", {
    beforeHandle({ request, set, getUser }) {
      const user = getUser();
      if (!isValidWebSocketOrigin(request) || !user || user.role !== "provider" || !user.fulfillmentLocationId) {
        set.status = 403;
        return "Invalid WebSocket request";
      }
    },
    open(ws) {
      const user = (ws.data as unknown as { getUser: () => UserInfo | null }).getUser();
      if (!user?.fulfillmentLocationId) return ws.close();
      wsManager.addProviderClient(user.fulfillmentLocationId, ws as any);
      ws.send(JSON.stringify({ type: "provider_update", tasks: getProviderTasks(user.fulfillmentLocationId) }));
    },
    close(ws) { wsManager.remove(ws as any); },
  });
