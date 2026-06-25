import { Elysia } from "elysia";
import { getDb, getOne, runSql } from "../db/database";
import { config } from "../config";
import { loginPage } from "../views/components";
import { authMiddleware } from "../middleware/auth";

function generateId(): string {
  return crypto.randomUUID();
}

function toSqliteDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export const authRoutes = new Elysia()
  .use(authMiddleware)
  .get("/login", ({ getUser }) => {
    const user = getUser();
    if (user) return new Response(null, { status: 302, headers: { Location: user.role === "admin" ? "/admin" : "/staff" } });
    return new Response(loginPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })
  .post("/login", async ({ body, set, cookie: { session_id }, getUser }) => {
    const user = getUser();
    if (user) {
      set.status = 302;
      set.headers = { Location: user.role === "admin" ? "/admin" : "/staff" };
      return;
    }

    const { username, password } = body as { username?: string; password?: string };
    if (!username || !password) {
      return new Response(loginPage("ユーザー名とパスワードを入力してください"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const db = getDb();
    const row = getOne<{ id: string; password_hash: string; role: string }>(
      db,
      "SELECT id, password_hash, role FROM users WHERE username = ?",
      username
    );

    if (!row) {
      return new Response(loginPage("ユーザー名またはパスワードが正しくありません"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const valid = await Bun.password.verify(password, row.password_hash);
    if (!valid) {
      return new Response(loginPage("ユーザー名またはパスワードが正しくありません"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const sessionId = generateId();
    const expiresAt = toSqliteDateTime(new Date(Date.now() + config.sessionMaxAge));

    runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", sessionId, row.id, expiresAt);

    session_id?.set({
      ...config.cookieOptions,
      value: sessionId,
    });

    set.status = 302;
    set.headers = { Location: row.role === "admin" ? "/admin" : "/staff" };
  })
  .post("/logout", ({ set, cookie: { session_id } }) => {
    const sid = session_id?.value;
    if (sid) {
      try {
        const db = getDb();
        runSql(db, "DELETE FROM sessions WHERE id = ?", String(sid));
      } catch {}
    }
    session_id?.remove();
    set.status = 302;
    set.headers = { Location: "/login" };
  });
