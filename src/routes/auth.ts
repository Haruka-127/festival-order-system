import { Elysia } from "elysia";
import { getDb, getOne, runSql } from "../db/database";
import { config } from "../config";
import { loginPage } from "../views/components";
import { authMiddleware } from "../middleware/auth";
import { LoginRateLimiter } from "../security";
import { isIP } from "node:net";

const loginIpLimiter = new LoginRateLimiter(50);
const loginAccountLimiter = new LoginRateLimiter(10);
const loginUsernameLimiter = new LoginRateLimiter(20);
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=2,p=1$oYqXuWeZfV6iBuu8r7w8JmLbbzDuAtjPIataUBNhvjs$9Ep/Em/QRnNBTNTG9/5V7zD2u9vU2gYsM8S6X9mMJbU";

function homeForRole(role: string): string {
  if (role === "admin") return "/admin/status";
  if (role === "provider") return "/provider";
  return "/staff";
}

function generateId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function toSqliteDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function getClientKey(request: Request, server: { requestIP(request: Request): { address: string } | null } | null): string {
  if (config.trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (forwarded && isIP(forwarded)) return forwarded;
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp && isIP(realIp)) return realIp;
  }
  return server?.requestIP(request)?.address ?? "unknown";
}

export const authRoutes = new Elysia()
  .use(authMiddleware)
  .get("/login", ({ getUser }) => {
    const user = getUser();
    if (user) return new Response(null, { status: 302, headers: { Location: homeForRole(user.role) } });
    return new Response(loginPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })
  .post("/login", async ({ body, set, cookie: { session_id }, getUser, request, server }) => {
    const user = getUser();
    if (user) {
      set.status = 302;
      set.headers = { Location: homeForRole(user.role) };
      return;
    }

    const { username, password } = (body ?? {}) as { username?: string; password?: string };
    if (typeof username !== "string" || typeof password !== "string" || !username || !password || username.length > 64 || password.length > 256) {
      return new Response(loginPage("ユーザー名とパスワードを入力してください"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const clientKey = getClientKey(request, server);
    const accountKey = `${clientKey}\0${username}`;
    const normalizedUsername = username.trim().toLocaleLowerCase("en-US");
    const tooManyAttempts = () => {
      set.status = 429;
      set.headers["Retry-After"] = "900";
      return new Response(loginPage("ログイン試行が多すぎます。しばらく待ってから再試行してください"), { status: 429, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "900" } });
    };
    if (loginIpLimiter.isBlocked(clientKey)) return tooManyAttempts();

    const db = getDb();
    const row = getOne<{ id: string; password_hash: string; role: string; staff_type: string }>(
      db,
      "SELECT id, password_hash, role, staff_type FROM users WHERE username = ?",
      username
    );

    const valid = await Bun.password.verify(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!row || !valid) {
      loginIpLimiter.recordFailure(clientKey);
      loginAccountLimiter.recordFailure(accountKey);
      loginUsernameLimiter.recordFailure(normalizedUsername);
      if (loginAccountLimiter.isBlocked(accountKey) || loginUsernameLimiter.isBlocked(normalizedUsername)) return tooManyAttempts();
      return new Response(loginPage("ユーザー名またはパスワードが正しくありません"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    loginAccountLimiter.clear(accountKey);
    loginUsernameLimiter.clear(normalizedUsername);

    const sessionId = generateId();
    const expiresAt = toSqliteDateTime(new Date(Date.now() + config.sessionMaxAge));

    const createSession = db.transaction(() => {
      runSql(db, "DELETE FROM sessions WHERE julianday(expires_at) <= julianday('now')");
      runSql(
        db,
        `DELETE FROM sessions WHERE id IN (
           SELECT id FROM sessions WHERE user_id = ?
           ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 9
         )`,
        row.id,
      );
      runSql(db, "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", sessionId, row.id, expiresAt);
    });
    createSession();

    session_id?.set({
      ...config.cookieOptions,
      value: sessionId,
    });

    set.status = 302;
    set.headers = { Location: homeForRole(row.role === "admin" ? "admin" : row.staff_type) };
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
