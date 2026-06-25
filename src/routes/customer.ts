import { Elysia } from "elysia";
import { getAll, getDb, getOne } from "../db/database";
import { customerPage } from "../views/customer";
import { notFoundPage } from "../views/components";
import QRCode from "qrcode";
import { config } from "../config";

export const customerRoutes = new Elysia()
  .get("/order/:token", ({ params: { token } }) => {
    const db = getDb();
    const order = getOne<{ id: string; display_number: number; status: string; created_at: string; token: string }>(
      db,
      "SELECT id, display_number, status, created_at, token FROM orders WHERE token = ?",
      token
    );

    if (!order) {
      return new Response(notFoundPage(), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const items = getAll<{ name: string; quantity: number }>(
      db,
      "SELECT item_name as name, quantity FROM order_items WHERE order_id = ?",
      order.id
    );

    return new Response(customerPage(
      { display_number: order.display_number, status: order.status, created_at: order.created_at, items },
      token
    ), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })

  .get("/api/order/:token", ({ params: { token } }) => {
    const db = getDb();
    const order = getOne<{ id: string; display_number: number; status: string; created_at: string; token: string }>(
      db,
      "SELECT id, display_number, status, created_at, token FROM orders WHERE token = ?",
      token
    );

    if (!order) return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    const items = getAll<{ name: string; quantity: number }>(
      db,
      "SELECT item_name as name, quantity FROM order_items WHERE order_id = ?",
      order.id
    );

    return { display_number: order.display_number, status: order.status, created_at: order.created_at, items };
  })

  .get("/api/qr/:token", async ({ params: { token }, set }) => {
    const db = getDb();
    const order = getOne<{ id: string }>(db, "SELECT id FROM orders WHERE token = ?", token);

    if (!order) {
      set.status = 404;
      return { error: "not_found" };
    }

    const url = `${config.baseUrl}/order/${token}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 });

    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    const imageBuffer = Buffer.from(base64, "base64");

    return new Response(imageBuffer, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  });
