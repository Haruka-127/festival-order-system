import { Elysia } from "elysia";
import { getAll, getDb } from "../db/database";
import { monitorPage } from "../views/monitor";

function getAvailableNumbers(): number[] {
  const db = getDb();
  const rows = getAll<{ display_number: number }>(
    db,
    "SELECT display_number FROM orders WHERE status = 'available' ORDER BY display_number ASC"
  );
  return rows.map(r => r.display_number);
}

export const monitorRoutes = new Elysia()
  .get("/monitor", () => {
    return new Response(monitorPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })
  .get("/api/monitor/numbers", () => {
    return { numbers: getAvailableNumbers() };
  });
