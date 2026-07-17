import { Elysia } from "elysia";
import { getMonitorBoard } from "../services/fulfillment";
import { monitorPage } from "../views/monitor";

export const monitorRoutes = new Elysia()
  .get("/monitor", (context) => {
    const { securityNonce } = context as typeof context & { securityNonce: string };
    return new Response(monitorPage(securityNonce), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })
  .get("/api/monitor/board", () => getMonitorBoard())
  .get("/api/monitor/numbers", () => getMonitorBoard());
