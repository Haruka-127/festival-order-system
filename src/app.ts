import { Elysia } from "elysia";
import { staticPlugin } from "@elysia/static";
import { checkDatabaseReady, getDb, getOne } from "./db/database";
import { wsManager } from "./services/websocket";
import { authRoutes } from "./routes/auth";
import { staffRoutes } from "./routes/staff";
import { adminRoutes } from "./routes/admin";
import { monitorRoutes } from "./routes/monitor";
import { customerRoutes } from "./routes/customer";
import { providerRoutes } from "./routes/provider";
import { notFoundPage } from "./views/components";
import { applySecurityHeaders, isValidSameOriginRequest, isValidWebSocketOrigin } from "./security";
import { getCustomerOrderByToken, getMonitorBoard } from "./services/fulfillment";

const requestIds = new WeakMap<Request, string>();
const requestStartedAt = new WeakMap<Request, number>();
const staticAssets = await staticPlugin({
  assets: process.env.ASSETS_DIR ?? "./dist/public/assets",
  prefix: "/assets",
  indexHTML: false,
  maxAge: process.env.NODE_ENV === "production" ? 86400 : 0,
  silent: true,
});

function requestIdFor(request: Request): string {
  let requestId = requestIds.get(request);
  if (!requestId) {
    requestId = crypto.randomUUID();
    requestIds.set(request, requestId);
  }
  return requestId;
}

function logPath(request: Request): string {
  return new URL(request.url).pathname.replace(/\b[a-f0-9]{64}\b/g, ":token");
}

export function createApp() {
  return new Elysia({ serve: { maxRequestBodySize: 64 * 1024 } })
    .use(staticAssets)
    .derive({ as: "global" }, () => ({ securityNonce: crypto.randomUUID().replaceAll("-", "") }))
    .onRequest(({ request, set }) => {
      const requestId = requestIdFor(request);
      requestStartedAt.set(request, performance.now());
      set.headers["X-Request-ID"] = requestId;
      const reject = (message: string, status: number) => {
        const headers: Record<string, string | number> = { "X-Request-ID": requestId };
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
    .onAfterHandle(({ request, set, securityNonce, response }) => {
      const requestId = requestIdFor(request);
      set.headers["X-Request-ID"] = requestId;
      applySecurityHeaders(set.headers as Record<string, string | number>, new URL(request.url).pathname, securityNonce);
      const path = logPath(request);
      if (!path.startsWith("/health/")) {
        console.info(JSON.stringify({
          level: "info",
          requestId,
          method: request.method,
          path,
          status: response instanceof Response ? response.status : typeof set.status === "number" ? set.status : 200,
          durationMs: Math.round((performance.now() - (requestStartedAt.get(request) ?? performance.now())) * 10) / 10,
        }));
      }
    })
    .get("/health/live", () => ({ status: "ok" }))
    .get("/health/ready", ({ set }) => {
      try {
        if (checkDatabaseReady()) return { status: "ready" };
      } catch {}
      set.status = 503;
      return { status: "not_ready" };
    })
    .get("/", () => new Response(null, { status: 302, headers: { Location: "/login" } }))
    .use(authRoutes)
    .use(staffRoutes)
    .use(providerRoutes)
    .use(adminRoutes)
    .use(monitorRoutes)
    .use(customerRoutes)
    .ws("/ws/monitor", {
      beforeHandle({ request, set }) {
        if (!isValidWebSocketOrigin(request)) { set.status = 403; return "Invalid WebSocket origin"; }
      },
      open(ws) {
        wsManager.addMonitor(ws as any);
        ws.send(JSON.stringify({ type: "monitor_update", ...getMonitorBoard() }));
      },
      close(ws) { wsManager.remove(ws as any); },
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
          const order = getCustomerOrderByToken(token);
          if (order) ws.send(JSON.stringify({ type: "order_update", ...order }));
        }
      },
      close(ws) { wsManager.remove(ws as any); },
    })
    .onError(({ code, error, request }) => {
      const requestId = requestIdFor(request);
      const pathname = new URL(request.url).pathname;
      if (code === "NOT_FOUND") {
        const headers: Record<string, string | number> = { "Content-Type": "text/html; charset=utf-8", "X-Request-ID": requestId };
        applySecurityHeaders(headers, pathname);
        return new Response(notFoundPage(), { status: 404, headers: headers as HeadersInit });
      }
      console.error(JSON.stringify({
        level: "error",
        requestId,
        method: request.method,
        path: logPath(request),
        code,
        error: error instanceof Error ? error.message : String(error),
      }));
      const headers: Record<string, string | number> = { "X-Request-ID": requestId };
      applySecurityHeaders(headers, pathname);
      return new Response("サーバーエラーが発生しました", { status: 500, headers: headers as HeadersInit });
    });
}

export type FestivalOrderApp = ReturnType<typeof createApp>;
