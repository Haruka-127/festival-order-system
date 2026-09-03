import { describe, expect, test } from "bun:test";
import { adminPage } from "../src/views/admin";
import { customerPage } from "../src/views/customer";
import { monitorPage } from "../src/views/monitor";
import { providerPage } from "../src/views/provider";
import { staffPage } from "../src/views/staff";

async function source(path: string): Promise<string> {
  return Bun.file(new URL(path, import.meta.url)).text();
}

function expectExternalAssets(html: string, page: string): void {
  expect(html).toContain(`<link rel="stylesheet" href="/assets/${page}.css"/>`);
  expect(html).toContain(`<script type="module" src="/assets/${page}.js"></script>`);
  expect(html).not.toContain("<style>");
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  expect(html).not.toMatch(/\son(?:click|change|submit|input|keydown)=/i);
}

describe("server-rendered views", () => {
  test("staff page references typed client and external styles", async () => {
    const html = staffPage(
      [{ id: 1, name: "ラーメン", sold_out: 0, sort_order: 1 }, { id: 2, name: "やきそば", sold_out: 0, sort_order: 2 }],
      [{ id: "order-1", display_number: 1, status: "preparing", created_at: "2026-06-25T00:00:00.000Z", items: [{ name: "ラーメン", quantity: 1 }] }],
    );
    expectExternalAssets(html, "staff");
    expect(html).toContain('class="topbar"');
    expect(html).toContain('id="cart-items" aria-live="polite"');
    expect(html).toContain('id="menu-grid"');
    expect(html).toContain('id="order-list"');
    expect(html).not.toContain('class="brand-dot"');
    expect(html).not.toContain('href="/account/password"');
    expect(html).not.toContain('style=');
    const client = await source("../src/client/staff.ts");
    expect(client).toContain('sessionStorage.getItem("staff-order-draft")');
    expect(client).toContain('fetch("/api/staff/items")');
    expect(client).toContain("キャンセル理由を入力してください");
    expect(client).not.toContain("innerHTML");
    expect(client).not.toContain(".style.");
    const css = await source("../src/styles/staff.css");
    expect(css).toContain("--green:#166534");
    expect(css).toContain("--content-max: 1440px");
    expect(css).toContain(".cart-qty button{width:44px;height:44px");
  });

  test("admin page references external behavior and preserves controls", async () => {
    const html = adminPage(
      [{ id: 1, name: "ラーメン", active: 1, sold_out: 0, sort_order: 1 }],
      [{ id: "order-1", display_number: 1, status: "preparing", created_at: "2026-06-25T00:00:00.000Z", items: "ラーメン x1", token: "token-1" }],
      [{ id: "admin-id", username: "admin", role: "admin", created_at: "2026-06-25T00:00:00.000Z" }, { id: "staff-id", username: "staff", role: "staff", staff_type: "cashier", created_at: "2026-06-25T00:00:00.000Z" }],
      { number: 1, date: "2026-06-25" },
    );
    expectExternalAssets(html, "admin");
    expect(html).toContain('class="header-inner"');
    expect(html).not.toContain('class="header-dot"');
    expect(html).toContain('class="skip-link" href="#main-content"');
    expect(html).not.toContain('aria-label="現在の注文状況"');
    expect(html).not.toContain('class="status-dot"');
    expect(html).toContain('<a href="/staff" class="btn btn-sm">店員画面</a>');
    expect(html).toContain('<nav class="tabs" aria-label="管理メニュー">');
    expect(html.match(/class="tab(?: active)?" href="\/admin\//g)).toHaveLength(5);
    expect(html).toContain('class="tab active" href="/admin/items"');
    expect(html).toContain('data-open-dialog="item-editor-1"');
    expect(html).not.toContain('id="tab-orders"');
    expect(html).not.toContain('id="tab-users"');
    expect(html).not.toContain('style=');
    const client = await source("../src/client/admin.ts");
    expect(client).toContain("showModal()");
    expect(client).toContain("const shouldOpen = panel.hidden");
    expect(client).not.toContain("function filterOrders");
    expect(client).toContain("data-confirm-password-change");
    expect(client).not.toContain("function showTab");
    const css = await source("../src/styles/admin.css");
    expect(css).toContain("--green:#166534");
    expect(css).toContain("--content-max:1440px");
    expect(css).toContain(".header{width:100%;background:#fff;color:var(--ink);border-bottom:1px solid var(--line)}");
    expect(css).toContain(".dialog-close{width:38px;height:38px");
    expect(css).toContain("gap:4px;margin:16px 0;padding:4px");
    expect(css).toContain(".tabs{display:grid;grid-template-columns:repeat(5,1fr)");
    expect(css).not.toContain(".overview-reception.is-open{border-color:");
    expect(css).not.toContain(".overview-reception.is-closed{border-color:");
    expect(css).not.toContain(".overview-ready .overview-value{color:");
  });

  test("admin sections render as addressable pages", () => {
    const orders = adminPage([], [{ id: "order-1", display_number: 1, status: "preparing", created_at: "2026-06-25T00:00:00.000Z", items: "ラーメン x1", token: "token-1" }], [], null, "", undefined, undefined, undefined, [], "orders");
    expect(orders).toContain('class="tab active" href="/admin/orders"');
    expect(orders).toContain('id="tab-orders" class="section active"');
    expect(orders).toContain('data-order-filter="active"');
    expect(orders).toContain('data-order-status="preparing"');
    expect(orders).not.toContain('id="tab-items"');

    const users = adminPage([], [], [{ id: "staff-id", username: "staff", role: "staff", staff_type: "cashier", created_at: "2026-06-25T00:00:00.000Z" }], null, "", undefined, undefined, undefined, [], "users");
    expect(users).toContain('id="user-editor-staff-id" class="editor-dialog"');
    expect(users).toContain('action="/api/admin/users/staff-id/password"');
    expect(users).toContain('data-confirm-password-change');
    expect(users).toContain('すべての端末で再ログインが必要です');

    const settings = adminPage([], [], [], null, "", undefined, undefined, undefined, [], "settings");
    expect(settings).toContain('href="/admin/settings/locations"');
    expect(settings).toContain('href="/admin/settings/advanced"');
    expect(settings).not.toContain('aria-label="現在の注文状況"');
    expect(settings).not.toContain("営業中によく変更する項目だけを表示しています");
    expect(settings).not.toContain('class="page-heading"');

    const status = adminPage([], [], [], null, "", undefined, undefined, undefined, [], "status", {
      preparing: 2,
      available: 1,
      today_delivered_orders: 3,
      today_units: 7,
      total_delivered_orders: 9,
      total_units: 24,
    }, {}, [{ item_id: 1, name: "ラーメン", today_quantity: 4, total_quantity: 12 }]);
    expect(status).toContain('class="tab active" href="/admin/status"');
    expect(status).toContain('id="tab-status" class="section active"');
    expect(status).toContain('<span class="overview-label">注文受付</span>');
    expect(status).toContain('<span class="overview-label">準備中</span>');
    expect(status).toContain('<span class="overview-label">お渡し待ち</span>');
    expect(status).toContain("販売実績");
    expect(status).toContain("ラーメン");
    expect(status).toContain("24<small>点</small>");

    const locations = adminPage([], [], [], null, "", undefined, undefined, undefined, [], "locations");
    expect(locations).toContain('id="location-editor-1" class="editor-dialog"');

    const advanced = adminPage([], [], [], null, "", undefined, undefined, undefined, [], "advanced");
    expect(advanced).toContain('class="tab active" href="/admin/settings"');
    expect(advanced).toContain('id="tab-advanced" class="section active"');
    expect(advanced).toContain('href="/admin/settings"');
  });

  test("admin flash messages are passed as escaped body data", () => {
    const html = adminPage([], [], [], null, "", undefined, undefined, undefined, [{ kind: "success", message: "注文設定を更新しました", targetTab: "settings" }]);
    expect(html).toContain("data-flash-messages=");
    expect(html).toContain("&#34;message&#34;:&#34;注文設定を更新しました&#34;");
    expect(html).not.toContain("?success=");
    expect(html).not.toContain("?error=");
  });

  test("customer page has external realtime client", async () => {
    const html = customerPage({ display_number: 1, status: "preparing", created_at: "2026-06-25T00:00:00.000Z", items: [{ name: "ラーメン", quantity: 1 }] }, "token-1");
    expectExternalAssets(html, "customer");
    expect(html).toContain('data-order-token="token-1"');
    expect(await source("../src/client/customer.ts")).toContain("socket?.readyState === WebSocket.OPEN ? 60_000 : 15_000");
  });

  test("monitor page has external board assets", async () => {
    const html = monitorPage();
    expectExternalAssets(html, "monitor");
    expect(html).toContain('id="connection"');
    expect(await source("../src/styles/monitor.css")).toContain(".board{grid-template-columns:1fr}");
    const client = await source("../src/client/monitor.ts");
    expect(client).toContain("CONNECTED_SYNC_INTERVAL = 60_000");
    expect(client).not.toContain("innerHTML");
  });

  test("provider page has external task assets", async () => {
    const html = providerPage("焼き場", []);
    expectExternalAssets(html, "provider");
    expect(html).toContain('class="kanban-board"');
    expect(html).toContain('class="kanban-lane lane-preparing"');
    expect(html).toContain('class="kanban-lane lane-ready"');
    expect(html).toContain('class="kanban-lane lane-handed_over"');
    expect(html).not.toContain('class="brand-dot"');
    expect(html).not.toContain('href="/account/password"');
    expect(html).not.toContain('style=');
    const client = await source("../src/client/provider.ts");
    expect(client).toContain("受渡完了を取り消す");
    expect(client).not.toContain("confirm(");
    const css = await source("../src/styles/provider.css");
    expect(css).toContain("--content-max: 1440px");
    expect(css).toContain(".kanban-board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(css).toContain(".card-actions { display: grid; min-height: 104px;");
    expect(client).toContain("socket?.readyState === WebSocket.OPEN ? 30_000 : 5_000");
  });
});
