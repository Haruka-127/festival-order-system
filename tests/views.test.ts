import { describe, expect, test } from "bun:test";
import { adminPage } from "../src/views/admin";
import { customerPage } from "../src/views/customer";
import { monitorPage } from "../src/views/monitor";
import { providerPage } from "../src/views/provider";
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

function expectStrictScriptMarkup(html: string) {
  expect(html).toContain('<script nonce="testnonce">');
  expect(html).not.toMatch(/\son(?:click|change|submit|input|keydown)=/i);
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
      ],
      "testnonce",
    );

    expectInlineScriptsToParse(html);
    expectStrictScriptMarkup(html);
    expect(html).toContain('class="topbar"');
    expect(html).toContain("--green:#166534");
    expect(html).toContain('id="cart-items" aria-live="polite"');
    expect(html).toContain('id="submit-order"');
    expect(html).toContain('id="menu-grid"');
    expect(html).toContain('id="order-list"');
    expect(html).toContain("sessionStorage.getItem('staff-order-draft')");
    expect(html).toContain("fetch('/api/staff/items')");
    expect(html).toContain("キャンセル理由を入力してください");
    expect(html).toContain(".cart-qty button{width:44px;height:44px;border-radius:2px;border:1px solid #9ca3af;background:#fff;color:var(--ink)");
    expect(html).toContain(".search-box input{width:100%;min-height:46px;padding:10px 14px;border:1px solid #9ca3af;border-radius:2px;font-size:15px;background:#fff;color:var(--ink)");
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
      [
        { id: "admin-id", username: "admin", role: "admin", created_at: "2026-06-25T00:00:00.000Z" },
        { id: "staff-id", username: "staff", role: "staff", staff_type: "cashier", created_at: "2026-06-25T00:00:00.000Z" },
      ],
      { number: 1, date: "2026-06-25" },
      "testnonce",
    );

    expectInlineScriptsToParse(html);
    expectStrictScriptMarkup(html);
    expect(html).toContain("管理画面");
    expect(html).toContain('class="overview"');
    expect(html).toContain(".overview-item:first-child{border-left:0;background:var(--panel)}");
    expect(html).not.toContain(".overview-item:first-child .overview-value{color:var(--green)}");
    expect(html).toContain("--green:#166534");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('class="workspace"');
    expect(html).toContain('class="editor"');
    expect(html).toContain('/api/admin/items/1/rename');
    expect(html).toContain('/api/admin/items/1/settings');
    expect(html).toContain('/api/admin/items/1/sort');
    expect(html).toContain('data-open-dialog="item-editor-1"');
    expect(html).toContain('id="item-editor-1" class="editor-dialog"');
    expect(html).toContain('data-open-dialog="user-editor-staff-id"');
    expect(html).toContain('id="user-editor-staff-id" class="editor-dialog"');
    expect(html).toContain('data-open-dialog="location-editor-1"');
    expect(html).toContain('id="location-editor-1" class="editor-dialog"');
    expect(html).toContain("showModal()");
    expect(html).toContain(".dialog-close{width:38px;height:38px;padding:0;border:1px solid var(--line);background:#fff;color:var(--ink)");
    expect(html).toContain('data-action="show-add-item" aria-controls="add-item-form" aria-expanded="false"');
    expect(html).toContain('id="add-item-form" class="add-panel" hidden');
    expect(html).toContain('data-action="show-add-user" aria-controls="add-user-form" aria-expanded="false"');
    expect(html).toContain('id="add-user-form" class="add-panel" hidden');
    expect(html).toContain("const shouldOpen = panel.hidden");
    expect(html).not.toContain("style.display === 'none'");
  });

  test("admin flash messages are embedded without URL query parameters", () => {
    const html = adminPage(
      [], [], [], null, "testnonce", undefined, undefined, undefined,
      [{ kind: "success", message: "注文設定を更新しました", targetTab: "settings" }],
    );
    expectInlineScriptsToParse(html);
    expect(html).toContain('"message":"注文設定を更新しました"');
    expect(html).toContain('"targetTab":"settings"');
    expect(html).not.toContain("URLSearchParams(window.location.search)");
    expect(html).not.toContain("?success=");
    expect(html).not.toContain("?error=");
  });

  test("customer page inline scripts are valid JavaScript", () => {
    const html = customerPage(
      {
        display_number: 1,
        status: "preparing",
        created_at: "2026-06-25T00:00:00.000Z",
        items: [{ name: "ラーメン", quantity: 1 }],
      },
      "token-1",
      "testnonce",
    );

    expectInlineScriptsToParse(html);
    expectStrictScriptMarkup(html);
    expect(html).toContain("setInterval(load, 15000)");
    expect(html).toContain("リアルタイム接続済み");
  });

  test("monitor page inline scripts are valid JavaScript", () => {
    const html = monitorPage("testnonce");
    expectInlineScriptsToParse(html);
    expectStrictScriptMarkup(html);
    expect(html).toContain("@media(max-width:640px){html,body{height:auto;min-height:100%;overflow:auto}");
    expect(html).toContain(".board{grid-template-columns:1fr}");
    expect(html).toContain("setInterval(load, 15000)");
    expect(html).toContain('id="connection"');
  });

  test("provider page logout button has an explicit visible text color", () => {
    const html = providerPage("焼き場", [], "testnonce");
    expectInlineScriptsToParse(html);
    expectStrictScriptMarkup(html);
    expect(html).toContain(".logout,.action{border:1px solid #d1d5db;background:#fff;color:#111827");
    expect(html).toContain("grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))");
    expect(html).toContain("受渡完了を取り消す");
    expect(html).toContain("setInterval(loadTasks, 5000)");
  });
});
