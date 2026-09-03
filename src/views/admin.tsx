import type { FlashMessage } from "../services/flash";
import { pageDocument } from "./layout";
import { renderItemsSection } from "./admin/items";
import { renderOrdersSection } from "./admin/orders";
import { renderAdvancedSection, renderHistorySection, renderLocationsSection, renderSettingsSection } from "./admin/settings";
import { renderStatusSection } from "./admin/status";
import { renderUsersSection } from "./admin/users";
import type { AdminEvent, AdminItem, AdminItemSales, AdminLocation, AdminOrder, AdminOrderSettings, AdminPageState, AdminSection, AdminStatusSummary, AdminUser } from "./admin/types";

export type { AdminSection } from "./admin/types";

const defaultLocations: AdminLocation[] = [{ id: 1, name: "既定提供場所", slug: "default", active: 1, sort_order: 0, max_preparing_orders: null, max_preparing_units: null }];
const defaultSettings: AdminOrderSettings = { ordering_enabled: 1, order_open_time: null, order_close_time: null, daily_order_limit: null, max_items_per_order: 50, max_total_quantity: 500, completed_order_retention_days: 7 };

function renderActiveSection(
  section: AdminSection,
  items: AdminItem[],
  orders: AdminOrder[],
  users: AdminUser[],
  locations: AdminLocation[],
  settings: AdminOrderSettings,
  events: AdminEvent[],
  currentNum: { number: number; date: string } | null,
  pageState: AdminPageState,
  statusSummary: AdminStatusSummary,
  itemSales: AdminItemSales[],
): string {
  if (section === "status") return renderStatusSection(settings, statusSummary, itemSales);
  if (section === "items") return renderItemsSection(items, locations);
  if (section === "orders") return renderOrdersSection(orders, pageState);
  if (section === "users") return renderUsersSection(users, locations);
  if (section === "locations") return renderLocationsSection(locations);
  if (section === "history") return renderHistorySection(events, pageState.pagination);
  if (section === "advanced") return renderAdvancedSection(settings, currentNum);
  return renderSettingsSection(settings, locations);
}

export function adminPage(
  items: AdminItem[],
  orders: AdminOrder[],
  users: AdminUser[],
  currentNum: { number: number; date: string } | null,
  _securityNonce = "",
  locations: AdminLocation[] = defaultLocations,
  settings: AdminOrderSettings = defaultSettings,
  events: AdminEvent[] = [],
  flashMessages: FlashMessage[] = [],
  activeSection: AdminSection = "items",
  statusSummary?: AdminStatusSummary,
  pageState: AdminPageState = {},
  itemSales: AdminItemSales[] = [],
): string {
  const serializedFlashMessages = JSON.stringify(flashMessages).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const summary = statusSummary ?? {
    preparing: orders.filter(order => order.status === "preparing").length,
    available: orders.filter(order => order.status === "available").length,
    today_delivered_orders: orders.filter(order => order.status === "delivered").length,
    today_units: 0,
    total_delivered_orders: orders.filter(order => order.status === "delivered").length,
    total_units: 0,
  };
  const activeMainSection = ["locations", "history", "advanced"].includes(activeSection) ? "settings" : activeSection;
  const tabClass = (section: string) => `tab${activeMainSection === section ? " active" : ""}`;

  return pageDocument({
    title: "管理画面 - 文化祭飲食システム",
    viewport: "width=device-width, initial-scale=1.0",
    stylesheet: "admin",
    script: "admin",
    bodyAttributes: { "data-flash-messages": serializedFlashMessages },
    content: `<a class="skip-link" href="#main-content">本文へ移動</a>
    <header class="header">
      <div class="header-inner">
        <div class="header-brand"><h1>管理画面</h1></div>
        <div class="header-actions"><a href="/staff" class="btn btn-sm">店員画面</a><form method="POST" action="/logout" class="inline-form"><button type="submit" class="btn btn-sm">ログアウト</button></form></div>
      </div>
    </header>
    <div class="app">
      <div class="workspace">
        <nav class="tabs" aria-label="管理メニュー">
          <a class="${tabClass("status")}" href="/admin/status" ${activeMainSection === "status" ? 'aria-current="page"' : ""}>ステータス</a>
          <a class="${tabClass("items")}" href="/admin/items" ${activeMainSection === "items" ? 'aria-current="page"' : ""}>商品</a>
          <a class="${tabClass("orders")}" href="/admin/orders" ${activeMainSection === "orders" ? 'aria-current="page"' : ""}>注文</a>
          <a class="${tabClass("users")}" href="/admin/users" ${activeMainSection === "users" ? 'aria-current="page"' : ""}>スタッフ</a>
          <a class="${tabClass("settings")}" href="/admin/settings" ${activeMainSection === "settings" ? 'aria-current="page"' : ""}>設定</a>
        </nav>
        <main id="main-content" class="content-area">${renderActiveSection(activeSection, items, orders, users, locations, settings, events, currentNum, pageState, summary, itemSales)}</main>
      </div>
    </div>
    <div id="toast-container"></div>`,
  });
}
