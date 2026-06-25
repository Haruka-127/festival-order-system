import { Elysia } from "elysia";
import { getAll, getDb, getOne, runSql } from "../db/database";
import { authMiddleware } from "../middleware/auth";
import type { UserInfo } from "../middleware/auth";
import { adminPage } from "../views/admin";
import { getCurrentDisplayNumber, resetDisplayNumbersForToday } from "../services/numbering";
import { wsManager } from "../services/websocket";

function requireAdmin(user: UserInfo | null): UserInfo | Response {
  if (!user) return new Response(null, { status: 302, headers: { Location: "/login" } });
  if (user.role !== "admin") return new Response("アクセス権限がありません", { status: 403 });
  return user;
}

function getAvailableNumbers(): number[] {
  const db = getDb();
  const rows = getAll<{ display_number: number }>(
    db,
    "SELECT display_number FROM orders WHERE status = 'available' ORDER BY display_number ASC"
  );
  return rows.map(r => r.display_number);
}

export const adminRoutes = new Elysia()
  .use(authMiddleware)
  .get("/admin", ({ getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();

    const items = getAll<{ id: number; name: string; active: number; sold_out: number; sort_order: number }>(
      db,
      "SELECT id, name, active, sold_out, sort_order FROM items ORDER BY sort_order ASC, id ASC"
    );

    const orders = getAll<{ id: string; display_number: number; status: string; created_at: string; items: string | null; token: string }>(
      db,
      `SELECT o.id, o.display_number, o.status, o.created_at, o.token,
       (SELECT GROUP_CONCAT(oi.item_name || ' x' || oi.quantity, ', ') FROM order_items oi WHERE oi.order_id = o.id) as items
       FROM orders o ORDER BY o.created_at DESC LIMIT 200`
    ).map(order => ({ ...order, items: order.items ?? "" }));

    const users = getAll<{ id: string; username: string; role: string; created_at: string }>(
      db,
      "SELECT id, username, role, created_at FROM users ORDER BY role ASC, username ASC"
    );

    const currentNum = getCurrentDisplayNumber();

    return new Response(adminPage(items, orders, users, currentNum), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  })

  .post("/api/admin/items", async ({ body, set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { name, sort_order } = body as { name?: string; sort_order?: string };

    if (!name || name.trim().length === 0) {
      set.status = 302;
      set.headers = { Location: "/admin?error=" + encodeURIComponent("商品名を入力してください") };
      return;
    }

    const db = getDb();
    runSql(db, "INSERT INTO items (name, sort_order) VALUES (?, ?)", name.trim(), parseInt(sort_order || "0"));

    set.status = 302;
    set.headers = { Location: "/admin?success=" + encodeURIComponent("商品を追加しました") };
  })

  .post("/api/admin/items/:id/rename", async ({ params: { id }, body, set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { name } = body as { name?: string };
    if (!name || name.trim().length === 0) {
      set.status = 302;
      set.headers = { Location: "/admin?error=" + encodeURIComponent("商品名を入力してください") };
      return;
    }
    const db = getDb();
    runSql(db, "UPDATE items SET name = ? WHERE id = ?", name.trim(), parseInt(id));
    set.status = 302;
    set.headers = { Location: "/admin?success=" + encodeURIComponent("商品名を更新しました") };
  })

  .post("/api/admin/items/:id/sort", async ({ params: { id }, body, set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { sort_order } = body as { sort_order?: string };
    const db = getDb();
    runSql(db, "UPDATE items SET sort_order = ? WHERE id = ?", parseInt(sort_order || "0"), parseInt(id));
    set.status = 302;
    set.headers = { Location: "/admin?success=" + encodeURIComponent("表示順を更新しました") };
  })

  .post("/api/admin/items/:id/toggle-active", async ({ params: { id }, set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const item = getOne<{ active: number }>(db, "SELECT active FROM items WHERE id = ?", parseInt(id));
    if (item) {
      runSql(db, "UPDATE items SET active = ? WHERE id = ?", item.active ? 0 : 1, parseInt(id));
    }
    set.status = 302;
    set.headers = { Location: "/admin" };
  })

  .post("/api/admin/items/:id/toggle-soldout", async ({ params: { id }, set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const item = getOne<{ sold_out: number }>(db, "SELECT sold_out FROM items WHERE id = ?", parseInt(id));
    if (item) {
      runSql(db, "UPDATE items SET sold_out = ? WHERE id = ?", item.sold_out ? 0 : 1, parseInt(id));
    }
    wsManager.broadcastToMonitor({ numbers: getAvailableNumbers() });
    set.status = 302;
    set.headers = { Location: "/admin" };
  })

  .post("/api/admin/items/:id/delete", async ({ params: { id }, set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const itemId = parseInt(id);

    const usageCount = getOne<{ cnt: number }>(db, "SELECT COUNT(*) as cnt FROM order_items WHERE item_id = ?", itemId);
    if (usageCount && usageCount.cnt > 0) {
      runSql(db, "UPDATE items SET active = 0 WHERE id = ?", itemId);
      set.status = 302;
      set.headers = { Location: "/admin?success=" + encodeURIComponent("使用実績があるため、販売停止にしました") };
      return;
    }

    runSql(db, "DELETE FROM items WHERE id = ?", itemId);
    set.status = 302;
    set.headers = { Location: "/admin?success=" + encodeURIComponent("商品を削除しました") };
  })

  .post("/api/admin/users", async ({ body, set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password || username.trim().length === 0 || password.length < 4) {
      set.status = 302;
      set.headers = { Location: "/admin?error=" + encodeURIComponent("ユーザー名とパスワード(4文字以上)を入力してください") };
      return;
    }

    const db = getDb();
    const existing = getOne<{ id: string }>(db, "SELECT id FROM users WHERE username = ?", username.trim());
    if (existing) {
      set.status = 302;
      set.headers = { Location: "/admin?error=" + encodeURIComponent("このユーザー名は既に使用されています") };
      return;
    }

    const id = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(password);
    runSql(db, "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'staff')", id, username.trim(), passwordHash);

    set.status = 302;
    set.headers = { Location: "/admin?success=" + encodeURIComponent("スタッフを追加しました") };
  })

  .post("/api/admin/users/:id/delete", async ({ params: { id }, set, getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const target = getOne<{ role: string }>(db, "SELECT role FROM users WHERE id = ?", id);

    if (!target) {
      set.status = 302;
      set.headers = { Location: "/admin?error=" + encodeURIComponent("ユーザーが見つかりません") };
      return;
    }

    if (target.role === "admin") {
      set.status = 302;
      set.headers = { Location: "/admin?error=" + encodeURIComponent("管理者は削除できません") };
      return;
    }

    runSql(db, "DELETE FROM sessions WHERE user_id = ?", id);
    runSql(db, "DELETE FROM users WHERE id = ?", id);

    set.status = 302;
    set.headers = { Location: "/admin?success=" + encodeURIComponent("ユーザーを削除しました") };
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

  .post("/api/admin/cleanup", async ({ getUser }) => {
    const result = requireAdmin(getUser());
    if (result instanceof Response) return result;
    const db = getDb();
    const deleteOldOrders = db.transaction(() => {
      runSql(
        db,
        "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status IN ('delivered', 'cancelled'))"
      );
      return runSql(
        db,
        "DELETE FROM orders WHERE status IN ('delivered', 'cancelled')"
      ).changes;
    });
    const deleted = deleteOldOrders();
    return { deleted };
  });
