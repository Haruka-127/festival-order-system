import { Elysia } from "elysia";
import { getDb, getOne, runSql } from "../../db/database";
import { authMiddleware } from "../../middleware/auth";
import { isPositiveInteger } from "../../security";
import { recordAdminAction } from "../../services/audit";
import { MAX_USERNAME_LENGTH, MIN_PASSWORD_LENGTH, redirectAdmin, requireAdmin } from "./shared";

export const adminUserRoutes = new Elysia()
  .use(authMiddleware)
  .post("/api/admin/users", async ({ body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
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
    if (getOne(db, "SELECT id FROM users WHERE username = ?", trimmedUsername)) return redirectAdmin(addFlash, "error", "このユーザー名は既に使用されています", "users");
    const id = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(password);
    runSql(db, "INSERT INTO users (id, username, password_hash, role, staff_type, fulfillment_location_id) VALUES (?, ?, ?, 'staff', ?, ?)", id, trimmedUsername, passwordHash, type, locationId);
    recordAdminAction(db, actor, "staff_created", { userId: id, username: trimmedUsername, staffType: type, locationId });
    return redirectAdmin(addFlash, "success", "スタッフを追加しました", "users");
  })
  .post("/api/admin/password", async ({ body, getUser, addFlash, cookie: { session_id } }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const { current_password, new_password } = (body ?? {}) as { current_password?: string; new_password?: string };
    if (typeof current_password !== "string" || typeof new_password !== "string" || new_password.length < MIN_PASSWORD_LENGTH || new_password.length > 128) {
      return redirectAdmin(addFlash, "error", `新しいパスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`, "settings", "/admin/settings/advanced");
    }
    const db = getDb();
    const account = getOne<{ password_hash: string }>(db, "SELECT password_hash FROM users WHERE id = ?", actor.id);
    if (!account || !await Bun.password.verify(current_password, account.password_hash)) return redirectAdmin(addFlash, "error", "現在のパスワードが正しくありません", "settings", "/admin/settings/advanced");
    const passwordHash = await Bun.password.hash(new_password);
    db.transaction(() => {
      runSql(db, "UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, actor.id);
      if (session_id?.value) runSql(db, "DELETE FROM sessions WHERE user_id = ? AND id != ?", actor.id, String(session_id.value));
      else runSql(db, "DELETE FROM sessions WHERE user_id = ?", actor.id);
      recordAdminAction(db, actor, "admin_password_changed", { userId: actor.id });
    })();
    return redirectAdmin(addFlash, "success", "管理者パスワードを更新しました", "settings", "/admin/settings/advanced");
  })
  .post("/api/admin/users/:id/delete", ({ params: { id }, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const db = getDb();
    const target = getOne<{ role: string; username: string }>(db, "SELECT role, username FROM users WHERE id = ?", id);
    if (!target) return redirectAdmin(addFlash, "error", "ユーザーが見つかりません", "users");
    if (target.role === "admin") return redirectAdmin(addFlash, "error", "管理者は削除できません", "users");
    db.transaction(() => {
      runSql(db, "DELETE FROM sessions WHERE user_id = ?", id);
      runSql(db, "DELETE FROM users WHERE id = ?", id);
      recordAdminAction(db, actor, "staff_deleted", { userId: id, username: target.username });
    })();
    return redirectAdmin(addFlash, "success", "ユーザーを削除しました", "users");
  })
  .post("/api/admin/users/:id/settings", ({ params: { id }, body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const data = (body ?? {}) as { staff_type?: string; fulfillment_location_id?: string };
    const type = data.staff_type === "provider" ? "provider" : "cashier";
    const locationId = type === "provider" && data.fulfillment_location_id && isPositiveInteger(data.fulfillment_location_id, 2_147_483_647)
      ? Number(data.fulfillment_location_id) : null;
    const db = getDb();
    const target = getOne<{ role: string }>(db, "SELECT role FROM users WHERE id = ?", id);
    if (!target || target.role === "admin") return redirectAdmin(addFlash, "error", "変更できないユーザーです", "users");
    if (type === "provider" && (!locationId || !getOne(db, "SELECT id FROM fulfillment_locations WHERE id = ? AND active = 1", locationId))) return redirectAdmin(addFlash, "error", "有効な提供場所を指定してください", "users");
    db.transaction(() => {
      runSql(db, "UPDATE users SET staff_type = ?, fulfillment_location_id = ? WHERE id = ?", type, locationId, id);
      runSql(db, "DELETE FROM sessions WHERE user_id = ?", id);
      recordAdminAction(db, actor, "staff_settings_changed", { userId: id, staffType: type, locationId });
    })();
    return redirectAdmin(addFlash, "success", "スタッフ設定を更新しました。対象ユーザーは再ログインしてください", "users");
  })
  .post("/api/admin/users/:id/password", async ({ params: { id }, body, getUser, addFlash }) => {
    const actor = requireAdmin(getUser());
    if (actor instanceof Response) return actor;
    const { password } = (body ?? {}) as { password?: string };
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > 128) return redirectAdmin(addFlash, "error", `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`, "users");
    const db = getDb();
    const target = getOne<{ role: string }>(db, "SELECT role FROM users WHERE id = ?", id);
    if (!target || target.role === "admin") return redirectAdmin(addFlash, "error", "変更できないユーザーです", "users");
    const passwordHash = await Bun.password.hash(password);
    db.transaction(() => {
      runSql(db, "UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, id);
      runSql(db, "DELETE FROM sessions WHERE user_id = ?", id);
      recordAdminAction(db, actor, "staff_password_changed", { userId: id });
    })();
    return redirectAdmin(addFlash, "success", "パスワードを更新しました。対象ユーザーは再ログインしてください", "users");
  });
