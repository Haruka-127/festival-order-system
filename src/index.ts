import { Elysia } from "elysia";
import { config, validateRuntimeConfig } from "./config";
import { getDb, closeDb, getAll, getOne, runSql } from "./db/database";
import { wsManager } from "./services/websocket";
import { authRoutes } from "./routes/auth";
import { staffRoutes } from "./routes/staff";
import { adminRoutes } from "./routes/admin";
import { monitorRoutes } from "./routes/monitor";
import { customerRoutes } from "./routes/customer";
import { notFoundPage } from "./views/components";
import { applySecurityHeaders, isValidSameOriginRequest, isValidWebSocketOrigin } from "./security";

validateRuntimeConfig();

const app = new Elysia({ serve: { maxRequestBodySize: 64 * 1024 } })
  .derive({ as: "global" }, () => ({ securityNonce: crypto.randomUUID().replaceAll("-", "") }))
  .onRequest(({ request }) => {
    const reject = (message: string, status: number) => {
      const headers: Record<string, string | number> = {};
      applySecurityHeaders(headers, new URL(request.url).pathname);
      return new Response(message, { status, headers: headers as HeadersInit });
    };
    if (request.headers.has("transfer-encoding")) return reject("Chunked request bodies are not accepted", 411);
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader && (!/^\d+$/.test(contentLengthHeader) || Number(contentLengthHeader) > 64 * 1024)) {
      return reject("Request body too large", 413);
    }
    if (!isValidSameOriginRequest(request)) return reject("Invalid request origin", 403);
  })
  .onAfterHandle(({ request, set, securityNonce }) => {
    applySecurityHeaders(set.headers as Record<string, string | number>, new URL(request.url).pathname, securityNonce);
  })
  .get("/", () => new Response(null, { status: 302, headers: { Location: "/login" } }))
  .use(authRoutes)
  .use(staffRoutes)
  .use(adminRoutes)
  .use(monitorRoutes)
  .use(customerRoutes)
  .ws("/ws/monitor", {
    beforeHandle({ request, set }) {
      if (!isValidWebSocketOrigin(request)) { set.status = 403; return "Invalid WebSocket origin"; }
    },
    open(ws) {
      wsManager.addMonitor(ws as any);
      const db = getDb();
      const numbers = getAll<{ display_number: number }>(
        db,
        "SELECT display_number FROM orders WHERE status = 'available' ORDER BY display_number ASC"
      ).map(r => r.display_number);
      ws.send(JSON.stringify({ type: "monitor_update", numbers }));
    },
    close(ws) {
      wsManager.remove(ws as any);
    },
  })
  .ws("/ws/order/:token", {
    beforeHandle({ request, params, set }) {
      if (!isValidWebSocketOrigin(request) || !/^[a-f0-9]{64}$/.test(params.token)) {
        set.status = 403;
        return "Invalid WebSocket request";
      }
      if (!getOne<{ id: string }>(getDb(), "SELECT id FROM orders WHERE token = ?", params.token)) {
        set.status = 404;
        return "Order not found";
      }
    },
    open(ws) {
      const token = ws.data.params?.token;
      if (token) {
        wsManager.addOrderClient(token, ws as any);
        const db = getDb();
        const order = getOne<{ status: string }>(db, "SELECT status FROM orders WHERE token = ?", token);
        if (order) {
          ws.send(JSON.stringify({ type: "order_update", status: order.status }));
        }
      }
    },
    close(ws) {
      wsManager.remove(ws as any);
    },
  })
  .onError(({ code }) => {
    if (code === "NOT_FOUND") {
      return new Response(notFoundPage(), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    console.error(`[ERROR] code=${code}`);
    return new Response("サーバーエラーが発生しました", { status: 500 });
  });

async function seedInitialData() {
  const db = getDb();
  const admin = getOne<{ id: string; password_hash: string }>(db, "SELECT id, password_hash FROM users WHERE username = ?", config.adminUsername);
  if (!admin) {
    if (process.env.NODE_ENV === "production" && (config.adminPassword.length < 12 || ["admin123", "your-admin-password"].includes(config.adminPassword))) {
      throw new Error("Refusing to create an administrator with a weak or default password. Set ADMIN_PASSWORD to at least 12 characters.");
    }
    const id = crypto.randomUUID();
    const passwordHash = await Bun.password.hash(config.adminPassword);
    runSql(db, "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'admin')", id, config.adminUsername, passwordHash);
    console.log(`[INIT] Created admin user: ${config.adminUsername}`);
  } else if (process.env.NODE_ENV === "production") {
    for (const knownWeakPassword of ["admin123", "your-admin-password"]) {
      if (await Bun.password.verify(knownWeakPassword, admin.password_hash)) {
        throw new Error("The existing administrator still uses a known default password. Change it before starting in production.");
      }
    }
  }
}

await seedInitialData();

app.listen({
  port: config.port,
  hostname: config.host,
});

process.on("SIGINT", () => {
  console.log("\n[SHUTDOWN] Closing database...");
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[SHUTDOWN] Closing database...");
  closeDb();
  process.exit(0);
});

console.log(`🚀 Server running at http://${config.host}:${config.port}`);
if (process.env.NODE_ENV === "production") {
  console.log(`   Admin user: ${config.adminUsername}`);
} else {
  console.log(`   Admin user: ${config.adminUsername}`);
}
console.log(`   Monitor: http://${config.host}:${config.port}/monitor`);
