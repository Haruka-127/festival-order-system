import { describe, expect, test } from "bun:test";
import { adminPage } from "../src/views/admin";
import { customerPage } from "../src/views/customer";
import { monitorPage } from "../src/views/monitor";
import { staffPage } from "../src/views/staff";

function extractInlineScripts(html: string): string[] {
  return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
}

function expectInlineScriptsToParse(html: string) {
  const scripts = extractInlineScripts(html);
  expect(scripts.length).toBeGreaterThan(0);

  for (const script of scripts) {
    expect(() => new Function(script)).not.toThrow();
  }
}

describe("view scripts", () => {
  test("staff page inline scripts are valid JavaScript", () => {
    const html = staffPage(
      [
        { id: 1, name: "ラーメン", sold_out: 0, sort_order: 1 },
        { id: 2, name: "やきそば", sold_out: 0, sort_order: 2 },
      ],
      [
        {
          id: "order-1",
          display_number: 1,
          status: "preparing",
          created_at: "2026-06-25T00:00:00.000Z",
          items: [{ name: "ラーメン", quantity: 1 }],
        },
      ]
    );

    expectInlineScriptsToParse(html);
  });

  test("admin page inline scripts are valid JavaScript", () => {
    const html = adminPage(
      [{ id: 1, name: "ラーメン", active: 1, sold_out: 0, sort_order: 1 }],
      [
        {
          id: "order-1",
          display_number: 1,
          status: "preparing",
          created_at: "2026-06-25T00:00:00.000Z",
          items: "ラーメン x1",
          token: "token-1",
        },
      ],
      [{ id: "admin-id", username: "admin", role: "admin", created_at: "2026-06-25T00:00:00.000Z" }],
      { number: 1, date: "2026-06-25" }
    );

    expectInlineScriptsToParse(html);
  });

  test("customer page inline scripts are valid JavaScript", () => {
    const html = customerPage(
      {
        display_number: 1,
        status: "preparing",
        created_at: "2026-06-25T00:00:00.000Z",
        items: [{ name: "ラーメン", quantity: 1 }],
      },
      "token-1"
    );

    expectInlineScriptsToParse(html);
  });

  test("monitor page inline scripts are valid JavaScript", () => {
    expectInlineScriptsToParse(monitorPage());
  });
});
