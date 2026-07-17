import { Elysia } from "elysia";
import { getDb, getOne } from "../db/database";
import { customerPage } from "../views/customer";
import { notFoundPage } from "../views/components";
import QRCode from "qrcode";
import { config } from "../config";
import { getCustomerOrderByToken } from "../services/fulfillment";

function validToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token);
}

export const customerRoutes = new Elysia()
  .get("/order/:token", (context) => {
    const { token } = context.params;
    const { securityNonce } = context as typeof context & { securityNonce: string };
    if (!validToken(token)) return new Response(notFoundPage(), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
    const order = getCustomerOrderByToken(token);

    if (!order) {
      return new Response(notFoundPage(), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    return new Response(customerPage(order, token, securityNonce), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  })

  .get("/api/order/:token", ({ params: { token } }) => {
    if (!validToken(token)) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json; charset=utf-8" } });
    const order = getCustomerOrderByToken(token);

    if (!order) return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

    return order;
  })

  .get("/api/qr/:token", async ({ params: { token }, set }) => {
    if (!validToken(token)) { set.status = 404; return { error: "not_found" }; }
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
