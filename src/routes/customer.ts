import { Elysia } from "elysia";
import { customerPage } from "../views/customer";
import { notFoundPage } from "../views/components";
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
  });
