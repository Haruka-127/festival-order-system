import { describe, expect, test } from "bun:test";
import { LoginRateLimiter, applySecurityHeaders, isPositiveInteger, isValidSameOriginRequest, isValidWebSocketOrigin } from "../src/security";
import { staffPage } from "../src/views/staff";
import { config } from "../src/config";

describe("request origin protection", () => {
  test("allows safe requests without an Origin header", () => {
    expect(isValidSameOriginRequest(new Request("http://localhost:3000/monitor"))).toBe(true);
  });

  test("allows same-origin state-changing requests", () => {
    const request = new Request("http://localhost:3000/api/staff/orders", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Sec-Fetch-Site": "same-origin" },
    });
    expect(isValidSameOriginRequest(request)).toBe(true);
  });

  test("rejects missing and cross-site origins", () => {
    expect(isValidSameOriginRequest(new Request("http://localhost:3000/logout", { method: "POST" }))).toBe(false);
    const crossSite = new Request("http://localhost:3000/logout", {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" },
    });
    expect(isValidSameOriginRequest(crossSite)).toBe(false);
    expect(isValidWebSocketOrigin(new Request("http://localhost:3000/ws/monitor", { headers: { Origin: "https://attacker.example" } }))).toBe(false);
  });
});

describe("security primitives", () => {
  test("binds to all network interfaces by default", () => {
    expect(config.host).toBe("0.0.0.0");
  });

  test("rate limiter blocks within a rolling window and can be cleared", () => {
    const limiter = new LoginRateLimiter(2, 1000);
    limiter.recordFailure("client", 100);
    expect(limiter.isBlocked("client", 200)).toBe(false);
    limiter.recordFailure("client", 300);
    expect(limiter.isBlocked("client", 400)).toBe(true);
    expect(limiter.isBlocked("client", 1500)).toBe(false);
    limiter.recordFailure("client", 1600);
    limiter.clear("client");
    expect(limiter.isBlocked("client", 1700)).toBe(false);
  });

  test("strictly validates positive integer path parameters", () => {
    expect(isPositiveInteger("1", 10)).toBe(true);
    expect(isPositiveInteger("0", 10)).toBe(false);
    expect(isPositiveInteger("1x", 10)).toBe(false);
    expect(isPositiveInteger("11", 10)).toBe(false);
  });

  test("adds browser hardening headers", () => {
    const headers: Record<string, string | number> = {};
    applySecurityHeaders(headers, "/admin", "testnonce");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("script-src 'nonce-testnonce'");
    expect(headers["Content-Security-Policy"]).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(headers["Cache-Control"]).toBe("no-store");
  });
});

test("stored item names are encoded again before insertion into an HTML sink", () => {
  const payload = '<img src=x onerror="globalThis.pwned=true">';
  const html = staffPage(
    [{ id: 1, name: payload, sold_out: 0, sort_order: 1 }],
    [],
  );
  expect(html).toContain("escapeHtml(name)");
  expect(html).not.toContain(`<span>${payload}</span>`);
});
