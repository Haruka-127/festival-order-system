import { Elysia } from "elysia";
import { getAll, getDb, getOne, runSql } from "../db/database";
import { authMiddleware } from "../middleware/auth";
import type { UserInfo } from "../middleware/auth";
import { adminPage } from "../views/admin";
import type { AdminSection } from "../views/admin";
import { getCurrentDisplayNumber, resetDisplayNumbersForToday } from "../services/numbering";
import { wsManager } from "../services/websocket";
import { isPositiveInteger } from "../security";
import { getMonitorBoard } from "../services/fulfillment";
import type { FlashKind, FlashMessage, FlashTargetTab } from "../services/flash";
import { recordAuditEvent } from "../services/audit";
import { createDatabaseBackup } from "../services/backup";

const MAX_NAME_LENGTH = 100;
const MAX_USERNAME_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 10;
type AddFlash = (kind: FlashKind, message: string, targetTab?: FlashTargetTab | null) => void;
type AdminPageContext = { getUser: () => UserInfo | null; consumeFlash: () => FlashMessage[]; securityNonce?: string };

const adminPaths: Record<FlashTargetTab, string> = {
  items: "/admin/items",
  orders: "/admin/orders",
  users: "/admin/users",
  settings: "/admin/settings",
  locations: "/admin/settings/locations",
  history: "/admin/settings/history",
};

function redirectAdmin(addFlash?: AddFlash, kind?: FlashKind, message?: string, targetTab?: FlashTargetTab, redirectPath?: string): Response {
  if (addFlash && kind && message) addFlash(kind, message, targetTab ?? null);
  return new Response(null, { status: 303, headers: { Location: redirectPath ?? adminPaths[targetTab ?? "items"] } });
}

function parseItemId(value: string): number | null {
  return isPositiveInteger(value, 2_147_483_647) ? Number(value) : null;
}

function parseSortOrder(value: unknown): number | null {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && Math.abs(parsed) <= 1_000_000 ? parsed : null;
}

function requireAdmin(user: UserInfo | null, api = true): UserInfo | Response {
  if (!user) return api
    ? new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : new Response(null, { status: 302, headers: { Location: "/login" } });
  if (user.role !== "admin") return api
    ? new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : new Response("アクセス権限がありません", { status: 403 });
  return user;
}

function renderAdminPage(context: AdminPageContext, activeSection: AdminSection): Response {
    const { getUser, consumeFlash } = context;
    const securityNonce = context.securityNonce ?? "";
    const result = requireAdmin(getUser(), false);
    if (result instanceof Response) return result;
    const db = getDb();

    const items = getAll<{ id: number; name: string; active: number; sold_out: number; sort_order: number; fulfillment_location_id: number; location_name: string; max_quantity_per_order: number | null; daily_limit: number | null }>(
      db,
      `SELECT i.id, i.name, i.active, i.sold_out, i.sort_order, i.fulfillment_location_id,
              i.max_quantity_per_order, i.daily_limit, l.name AS location_name
       FROM items i JOIN fulfillment_locations l ON l.id = i.fulfillment_location_id
       ORDER BY i.sort_order ASC, i.id ASC`
    );

    const orders = getAll<{ id: string; display_number: number; status: string; created_at: string; items: string | null; token: string }>(
      db,
      `SELECT o.id, o.display_number, o.status, o.created_at, o.token,
       (SELECT GROUP_CONCAT(l.name || ' [' ||
          CASE f.status WHEN 'preparing' THEN '準備中' WHEN 'ready' THEN '提供可能' WHEN 'handed_over' THEN '受渡済' ELSE 'キャンセル' END ||
          '] ' || oi.item_name || ' x' || oi.quantity, ', ')
        FROM order_items oi
        LEFT JOIN order_fulfillments f ON f.id = oi.fulfillment_id
        LEFT JOIN fulfillment_locations l ON l.id = f.location_id
        WHERE oi.order_id = o.id) as items
       FROM orders o ORDER BY o.created_at DESC LIMIT 200`
    ).map(order => ({ ...order, items: order.items ?? "" }));

    const users = getAll<{ id: string; username: string; role: string; staff_type: string; fulfillment_location_id: number | null; location_name: string | null; created_at: string }>(
      db,
      `SELECT u.id, u.username, u.role, u.staff_type, u.fulfillment_location_id,
              l.name AS location_name, u.created_at
       FROM users u LEFT JOIN fulfillment_locations l ON l.id = u.fulfillment_location_id
       ORDER BY u.role ASC, u.username ASC`
    );

    const locations = getAll<{ id: number; name: string; slug: string; active: number; sort_order: number; max_preparing_orders: number | null; max_preparing_units: number | null }>(
      db,
      "SELECT id, name, slug, active, sort_order, max_preparing_orders, max_preparing_units FROM fulfillment_locations ORDER BY sort_order ASC, id ASC",
    );
    const settings = getOne<{ ordering_enabled: number; order_open_time: string | null; order_close_time: string | null; daily_order_limit: number | null; max_items_per_order: number; max_total_quantity: number; completed_order_retention_days: number }>(
      db,
      "SELECT ordering_enabled, order_open_time, order_close_time, daily_order_limit, max_items_per_order, max_total_quantity, completed_order_retention_days FROM app_settings WHERE id = 1",
    )!;
    const events = getAll<{ display_number: number; location_name: string | null; event_type: string; from_status: string | null; to_status: string | null; username: string | null; details: string | null; created_at: string }>(
      db,
      `SELECT display_number, location_name, event_type, from_status, to_status,
              actor_username AS username, details, created_at
       FROM audit_events
       ORDER BY created_at DESC, id DESC LIMIT 200`,
    );

    const currentNum = getCurrentDisplayNumber();
    const flashMessages = consumeFlash();

    return new Response(adminPage(items, orders, users, currentNum, securityNonce, locations, settings, events, flashMessages, activeSection), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

export const adminRoutes = new Elysia()
  .use(authMiddleware)
  .get("/admin", () => new Response(null, { status: 302, headers: { Location: "/admin/items" } }))
  .get("/admin/items", context => renderAdminPage(context as AdminPageContext, "items"))
  .get("/admin/orders", context => renderAdminPage(context as AdminPageContext, "orders"))
  .get("/admin/users", context => renderAdminPage(context as AdminPageContext, "users"))
  .get("/admin/settings", context => renderAdminPage(context as AdminPageContext, "settings"))
  .get("/admin/settings/locations", context => renderAdminPage(context as AdminPageContext, "locations"))
  .get("/admin/settings/history", context => renderAdminPage(context as AdminPageContext, "history"))
  .get("/admin/settings/advanced", context => renderAdminPage(context as AdminPageContext, "advanced"))

  .post("/api/admin/items", async ({ body, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { name, sort_order, fulfillment_location_id } = (body ?? {}) as { name?: string; sort_order?: string; fulfillment_location_id?: string };

    const trimmedName = typeof name === "string" ? name.trim() : "";
    const parsedSortOrder = parseSortOrder(sort_order ?? "0");
    const locationId = typeof fulfillment_location_id === "string" && isPositiveInteger(fulfillment_location_id, 2_147_483_647) ? Number(fulfillment_location_id) : null;
    const db = getDb();
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH || parsedSortOrder === null || !locationId || !getOne(db, "SELECT id FROM fulfillment_locations WHERE id = ? AND active = 1", locationId)) {
      return redirectAdmin(addFlash, "error", "商品名と有効な提供場所を入力してください", "items");
    }

    runSql(db, "INSERT INTO items (name, sort_order, fulfillment_location_id) VALUES (?, ?, ?)", trimmedName, parsedSortOrder, locationId);

    return redirectAdmin(addFlash, "success", "商品を追加しました", "items");
  })

  .post("/api/admin/items/:id/rename", async ({ params: { id }, body, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { name } = (body ?? {}) as { name?: string };
    const itemId = parseItemId(id);
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!itemId || !trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
      return redirectAdmin(addFlash, "error", "商品名を入力してください", "items");
    }
    const db = getDb();
    runSql(db, "UPDATE items SET name = ? WHERE id = ?", trimmedName, itemId);
    return redirectAdmin(addFlash, "success", "商品名を更新しました", "items");
  })

  .post("/api/admin/items/:id/sort", async ({ params: { id }, body, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { sort_order } = (body ?? {}) as { sort_order?: string };
    const itemId = parseItemId(id);
    const parsedSortOrder = parseSortOrder(sort_order ?? "0");
    if (!itemId || parsedSortOrder === null) { set.status = 400; return { error: "不正なデータです" }; }
    const db = getDb();
    runSql(db, "UPDATE items SET sort_order = ? WHERE id = ?", parsedSortOrder, itemId);
    return redirectAdmin(addFlash, "success", "表示順を更新しました", "items");
  })

  .post("/api/admin/items/:id/toggle-active", async ({ params: { id }, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const itemId = parseItemId(id);
    if (!itemId) { set.status = 400; return { error: "不正な商品IDです" }; }
    const db = getDb();
    const item = getOne<{ active: number }>(db, "SELECT active FROM items WHERE id = ?", itemId);
    if (item) {
      runSql(db, "UPDATE items SET active = ? WHERE id = ?", item.active ? 0 : 1, itemId);
    }
    return redirectAdmin(addFlash, "success", item?.active ? "商品の販売を停止しました" : "商品の販売を再開しました", "items");
  })

  .post("/api/admin/items/:id/toggle-soldout", async ({ params: { id }, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const itemId = parseItemId(id);
    if (!itemId) { set.status = 400; return { error: "不正な商品IDです" }; }
    const db = getDb();
    const item = getOne<{ sold_out: number }>(db, "SELECT sold_out FROM items WHERE id = ?", itemId);
    if (item) {
      runSql(db, "UPDATE items SET sold_out = ? WHERE id = ?", item.sold_out ? 0 : 1, itemId);
    }
    wsManager.broadcastToMonitor(getMonitorBoard());
    return redirectAdmin(addFlash, "success", item?.sold_out ? "売り切れを解除しました" : "商品を売り切れにしました", "items");
  })

  .post("/api/admin/items/:id/delete", async ({ params: { id }, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const itemId = parseItemId(id);
    if (!itemId) { set.status = 400; return { error: "不正な商品IDです" }; }

    const usageCount = getOne<{ cnt: number }>(db, `SELECT
      (SELECT COUNT(*) FROM order_items WHERE item_id = ?) +
      (SELECT COUNT(*) FROM daily_item_usage WHERE item_id = ?) AS cnt`, itemId, itemId);
    if (usageCount && usageCount.cnt > 0) {
      runSql(db, "UPDATE items SET active = 0 WHERE id = ?", itemId);
      return redirectAdmin(addFlash, "success", "使用実績があるため、販売停止にしました", "items");
    }

    runSql(db, "DELETE FROM items WHERE id = ?", itemId);
    return redirectAdmin(addFlash, "success", "商品を削除しました", "items");
  })

  .post("/api/admin/users", async ({ body, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { username, password, staff_type, fulfillment_location_id } = (body ?? {}) as { username?: string; password?: string; staff_type?: string; fulfillment_location_id?: string };

    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    if (!trimmedUsername || trimmedUsername.length > MAX_USERNAME_LENGTH || typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
      return redirectAdmin(addFlash, "error", `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`, "users");
    }

    const type = staff_type === "provider" ? "provider" : "cashier";
    const locationId = type === "provider" && typeof fulfillment_location_id === "string" && isPositiveInteger(fulfillment_location_id, 2_147_483_647)
      ? Number(fulfillment_location_id) : null;
    const db = getDb();
    if (type === "provider" && (!locationId || !getOne(db, "SELECT id FROM fulfillment_locations WHERE id = ? AND active = 1", locationId))) {
      return redirectAdmin(addFlash, "error", "提供担当には有効な提供場所を指定してください", "users");
    }
    const existing = getOne<{ id: string }>(db, "SELECT id FROM users WHERE username = ?", trimmedUsername);
    if (existing) {
      return redirectAdmin(addFlash, "error", "このユーザー名は既に使用されています", "users");
    }

    const id = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(password);
    runSql(db, "INSERT INTO users (id, username, password_hash, role, staff_type, fulfillment_location_id) VALUES (?, ?, ?, 'staff', ?, ?)", id, trimmedUsername, passwordHash, type, locationId);

    return redirectAdmin(addFlash, "success", "スタッフを追加しました", "users");
  })

  .post("/api/admin/password", async ({ body, getUser, addFlash, cookie: { session_id } }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { current_password, new_password } = (body ?? {}) as { current_password?: string; new_password?: string };
    if (typeof current_password !== "string" || typeof new_password !== "string" || new_password.length < MIN_PASSWORD_LENGTH || new_password.length > 128) {
      return redirectAdmin(addFlash, "error", `新しいパスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`, "settings", "/admin/settings/advanced");
    }
    const db = getDb();
    const account = getOne<{ password_hash: string }>(db, "SELECT password_hash FROM users WHERE id = ?", result.id);
    if (!account || !await Bun.password.verify(current_password, account.password_hash)) {
      return redirectAdmin(addFlash, "error", "現在のパスワードが正しくありません", "settings", "/admin/settings/advanced");
    }
    const passwordHash = await Bun.password.hash(new_password);
    db.transaction(() => {
      runSql(db, "UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, result.id);
      if (session_id?.value) runSql(db, "DELETE FROM sessions WHERE user_id = ? AND id != ?", result.id, String(session_id.value));
      else runSql(db, "DELETE FROM sessions WHERE user_id = ?", result.id);
    })();
    return redirectAdmin(addFlash, "success", "管理者パスワードを更新しました", "settings", "/admin/settings/advanced");
  })

  .post("/api/admin/users/:id/delete", async ({ params: { id }, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const target = getOne<{ role: string }>(db, "SELECT role FROM users WHERE id = ?", id);

    if (!target) {
      return redirectAdmin(addFlash, "error", "ユーザーが見つかりません", "users");
    }

    if (target.role === "admin") {
      return redirectAdmin(addFlash, "error", "管理者は削除できません", "users");
    }

    runSql(db, "DELETE FROM sessions WHERE user_id = ?", id);
    runSql(db, "DELETE FROM users WHERE id = ?", id);

    return redirectAdmin(addFlash, "success", "ユーザーを削除しました", "users");
  })

  .post("/api/admin/users/:id/settings", ({ params: { id }, body, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const data = (body ?? {}) as { staff_type?: string; fulfillment_location_id?: string };
    const type = data.staff_type === "provider" ? "provider" : "cashier";
    const locationId = type === "provider" && data.fulfillment_location_id && isPositiveInteger(data.fulfillment_location_id, 2_147_483_647)
      ? Number(data.fulfillment_location_id) : null;
    const db = getDb();
    const target = getOne<{ role: string }>(db, "SELECT role FROM users WHERE id = ?", id);
    if (!target || target.role === "admin") { set.status = 400; return { error: "変更できないユーザーです" }; }
    if (type === "provider" && (!locationId || !getOne(db, "SELECT id FROM fulfillment_locations WHERE id = ? AND active = 1", locationId))) {
      set.status = 400; return { error: "有効な提供場所を指定してください" };
    }
    db.transaction(() => {
      runSql(db, "UPDATE users SET staff_type = ?, fulfillment_location_id = ? WHERE id = ?", type, locationId, id);
      runSql(db, "DELETE FROM sessions WHERE user_id = ?", id);
    })();
    return redirectAdmin(addFlash, "success", "スタッフ設定を更新しました。対象ユーザーは再ログインしてください", "users");
  })

  .post("/api/admin/users/:id/password", async ({ params: { id }, body, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { password } = (body ?? {}) as { password?: string };
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
      set.status = 400;
      return { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` };
    }
    const db = getDb();
    const target = getOne<{ id: string; role: string }>(db, "SELECT id, role FROM users WHERE id = ?", id);
    if (!target || target.role === "admin") { set.status = 400; return { error: "変更できないユーザーです" }; }
    const passwordHash = await Bun.password.hash(password);
    db.transaction(() => {
      runSql(db, "UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, id);
      runSql(db, "DELETE FROM sessions WHERE user_id = ?", id);
    })();
    return redirectAdmin(addFlash, "success", "パスワードを更新しました。対象ユーザーは再ログインしてください", "users");
  })

  .post("/api/admin/reset-numbers", async ({ set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const active = getOne<{ cnt: number }>(
      db,
      "SELECT COUNT(*) as cnt FROM orders WHERE status IN ('preparing', 'available')"
    );
    if ((active?.cnt ?? 0) > 0) {
      set.status = 409;
      return { error: "準備中または提供可能の注文が残っているため、番号をリセットできません" };
    }
    resetDisplayNumbersForToday(db);
    return { success: true };
  })

  .post("/api/admin/locations", ({ body, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { name, slug, sort_order } = (body ?? {}) as { name?: string; slug?: string; sort_order?: string };
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedSlug = typeof slug === "string" ? slug.trim().toLowerCase() : "";
    const parsedSortOrder = parseSortOrder(sort_order ?? "0");
    if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH || !/^[a-z0-9-]{1,50}$/.test(trimmedSlug) || parsedSortOrder === null) {
      return redirectAdmin(addFlash, "error", "提供場所名と英数字の識別子を入力してください", "locations");
    }
    try { runSql(getDb(), "INSERT INTO fulfillment_locations (name, slug, sort_order) VALUES (?, ?, ?)", trimmedName, trimmedSlug, parsedSortOrder); }
    catch { return redirectAdmin(addFlash, "error", "その識別子は既に使用されています", "locations"); }
    return redirectAdmin(addFlash, "success", "提供場所を追加しました", "locations");
  })

  .post("/api/admin/locations/:id/settings", ({ params: { id }, body, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const locationId = parseItemId(id);
    const data = (body ?? {}) as Record<string, string | undefined>;
    const name = data.name?.trim() ?? "";
    const sortOrder = parseSortOrder(data.sort_order ?? "0");
    const maxOrders = data.max_preparing_orders ? Number(data.max_preparing_orders) : null;
    const maxUnits = data.max_preparing_units ? Number(data.max_preparing_units) : null;
    if (!locationId || !name || name.length > MAX_NAME_LENGTH || sortOrder === null || (maxOrders !== null && (!Number.isInteger(maxOrders) || maxOrders < 1)) || (maxUnits !== null && (!Number.isInteger(maxUnits) || maxUnits < 1))) {
      set.status = 400; return { error: "不正な提供場所設定です" };
    }
    runSql(getDb(), "UPDATE fulfillment_locations SET name = ?, sort_order = ?, max_preparing_orders = ?, max_preparing_units = ?, updated_at = datetime('now') WHERE id = ?", name, sortOrder, maxOrders, maxUnits, locationId);
    return redirectAdmin(addFlash, "success", "提供場所を更新しました", "locations");
  })

  .post("/api/admin/locations/:id/toggle-active", ({ params: { id }, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const locationId = parseItemId(id);
    if (!locationId) { set.status = 400; return { error: "不正な提供場所IDです" }; }
    const db = getDb();
    const location = getOne<{ active: number }>(db, "SELECT active FROM fulfillment_locations WHERE id = ?", locationId);
    if (!location) { set.status = 404; return { error: "提供場所が見つかりません" }; }
    if (location.active) {
      const activeTasks = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM order_fulfillments WHERE location_id = ? AND status IN ('preparing', 'ready')", locationId)?.count ?? 0;
      if (activeTasks > 0) return redirectAdmin(addFlash, "error", `進行中の提供タスクが${activeTasks}件あるため停止できません`, "locations");
    }
    runSql(db, "UPDATE fulfillment_locations SET active = ?, updated_at = datetime('now') WHERE id = ?", location.active ? 0 : 1, locationId);
    wsManager.broadcastToMonitor(getMonitorBoard());
    return redirectAdmin(addFlash, "success", location.active ? "提供場所を停止しました" : "提供場所を再開しました", "locations");
  })

  .post("/api/admin/items/:id/settings", ({ params: { id }, body, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const itemId = parseItemId(id);
    const data = (body ?? {}) as Record<string, string | undefined>;
    const locationId = data.fulfillment_location_id && isPositiveInteger(data.fulfillment_location_id, 2_147_483_647) ? Number(data.fulfillment_location_id) : null;
    const maxPerOrder = data.max_quantity_per_order ? Number(data.max_quantity_per_order) : null;
    const dailyLimit = data.daily_limit ? Number(data.daily_limit) : null;
    if (!itemId || !locationId || (maxPerOrder !== null && (!Number.isInteger(maxPerOrder) || maxPerOrder < 1)) || (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1))) {
      set.status = 400; return { error: "不正な商品設定です" };
    }
    const db = getDb();
    if (!getOne(db, "SELECT id FROM fulfillment_locations WHERE id = ? AND active = 1", locationId)) {
      set.status = 400; return { error: "有効な提供場所を指定してください" };
    }
    runSql(db, "UPDATE items SET fulfillment_location_id = ?, max_quantity_per_order = ?, daily_limit = ? WHERE id = ?", locationId, maxPerOrder, dailyLimit, itemId);
    return redirectAdmin(addFlash, "success", "商品設定を更新しました", "items");
  })

  .post("/api/admin/settings/orders", ({ body, set, getUser, addFlash }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const data = (body ?? {}) as Record<string, string | undefined>;
    const enabled = data.ordering_enabled === "1" ? 1 : 0;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    const openTime = data.order_open_time?.trim() || null;
    const closeTime = data.order_close_time?.trim() || null;
    const dailyLimit = data.daily_order_limit ? Number(data.daily_order_limit) : null;
    const maxItems = Number(data.max_items_per_order);
    const maxQuantity = Number(data.max_total_quantity);
    const retentionDays = Number(data.completed_order_retention_days);
    if ((openTime && !timePattern.test(openTime)) || (closeTime && !timePattern.test(closeTime)) || (openTime && closeTime && openTime >= closeTime) || (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1)) || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100 || !Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 10000 || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      set.status = 400; return { error: "不正な注文設定です" };
    }
    runSql(getDb(), "UPDATE app_settings SET ordering_enabled = ?, order_open_time = ?, order_close_time = ?, daily_order_limit = ?, max_items_per_order = ?, max_total_quantity = ?, completed_order_retention_days = ?, updated_at = datetime('now') WHERE id = 1", enabled, openTime, closeTime, dailyLimit, maxItems, maxQuantity, retentionDays);
    return redirectAdmin(addFlash, "success", "注文設定を更新しました", "settings", data.return_to === "advanced" ? "/admin/settings/advanced" : undefined);
  })

  .get("/api/admin/cleanup/preview", ({ getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const retentionDays = getOne<{ completed_order_retention_days: number }>(db, "SELECT completed_order_retention_days FROM app_settings WHERE id = 1")?.completed_order_retention_days ?? 7;
    const cutoffModifier = `-${retentionDays} days`;
    const target = getOne<{ count: number; oldest: string | null; newest: string | null }>(
      db,
      "SELECT COUNT(*) AS count, MIN(updated_at) AS oldest, MAX(updated_at) AS newest FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)",
      cutoffModifier,
    );
    return { retention_days: retentionDays, count: target?.count ?? 0, oldest: target?.oldest ?? null, newest: target?.newest ?? null };
  })

  .post("/api/admin/backup", async ({ getUser, set }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    try {
      return { success: true, ...(await createDatabaseBackup()) };
    } catch {
      set.status = 503;
      return { error: "バックアップを作成できませんでした" };
    }
  })

  .post("/api/admin/cleanup", async ({ getUser, set }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const retentionDays = getOne<{ completed_order_retention_days: number }>(db, "SELECT completed_order_retention_days FROM app_settings WHERE id = 1")?.completed_order_retention_days ?? 7;
    const cutoffModifier = `-${retentionDays} days`;
    const pendingCount = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)", cutoffModifier)?.count ?? 0;
    if (pendingCount === 0) return { deleted: 0, retention_days: retentionDays, backup: null };
    let backup;
    try { backup = await createDatabaseBackup(db); }
    catch { set.status = 503; return { error: "削除前バックアップを作成できなかったため、削除を中止しました" }; }
    const deleteOldOrders = db.transaction(() => {
      const targetCount = getOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)", cutoffModifier)?.count ?? 0;
      if (targetCount === 0) return 0;
      runSql(
        db,
        "DELETE FROM fulfillment_events WHERE fulfillment_id IN (SELECT id FROM order_fulfillments WHERE order_id IN (SELECT id FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)))",
        cutoffModifier,
      );
      runSql(
        db,
        "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?))",
        cutoffModifier,
      );
      runSql(
        db,
        "DELETE FROM order_fulfillments WHERE order_id IN (SELECT id FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?))",
        cutoffModifier,
      );
      const deleted = runSql(db, "DELETE FROM orders WHERE status IN ('delivered', 'cancelled') AND julianday(updated_at) < julianday('now', ?)", cutoffModifier).changes;
      recordAuditEvent(db, {
        eventType: "orders_cleaned",
        actorUserId: result.id,
        actorUsername: result.username,
        details: { deleted, retentionDays },
      });
      return deleted;
    });
    const deleted = deleteOldOrders();
    return { deleted, retention_days: retentionDays, backup: backup.filename };
  });
