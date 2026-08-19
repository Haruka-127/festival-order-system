import { config } from "../config";
import { pageDocument } from "./layout";
import type { FlashMessage } from "../services/flash";
import { formatDateTime } from "../services/time";

type Item = { id: number; name: string; active: number; sold_out: number; sort_order: number; fulfillment_location_id?: number; location_name?: string; max_quantity_per_order?: number | null; daily_limit?: number | null };
type OrderSummary = { id: string; display_number: number; status: string; created_at: string; items: string; token: string };
type UserSummary = { id: string; username: string; role: string; staff_type?: string; fulfillment_location_id?: number | null; location_name?: string | null; created_at: string };
type LocationSummary = { id: number; name: string; slug: string; active: number; sort_order: number; max_preparing_orders: number | null; max_preparing_units: number | null };
type OrderSettings = { ordering_enabled: number; order_open_time: string | null; order_close_time: string | null; daily_order_limit: number | null; max_items_per_order: number; max_total_quantity: number; completed_order_retention_days: number };
type EventSummary = { display_number: number | null; location_name: string | null; event_type: string; from_status: string | null; to_status: string | null; username: string | null; details: string | null; created_at: string };
export type AdminSection = "items" | "orders" | "users" | "settings" | "locations" | "history" | "advanced";

export function adminPage(
  items: Item[],
  orders: OrderSummary[],
  users: UserSummary[],
  currentNum: { number: number; date: string } | null,
  _securityNonce = "",
  locations: LocationSummary[] = [{ id: 1, name: "既定提供場所", slug: "default", active: 1, sort_order: 0, max_preparing_orders: null, max_preparing_units: null }],
  settings: OrderSettings = { ordering_enabled: 1, order_open_time: null, order_close_time: null, daily_order_limit: null, max_items_per_order: 50, max_total_quantity: 500, completed_order_retention_days: 7 },
  events: EventSummary[] = [],
  flashMessages: FlashMessage[] = [],
  activeSection: AdminSection = "items",
  orderCounts?: { preparing: number; available: number },
): string {
  const statusLabels: Record<string, string> = { preparing: "準備中", available: "提供可能", delivered: "受渡済", cancelled: "キャンセル" };
  const statusColors: Record<string, string> = { preparing: "badge-blue", available: "badge-green", delivered: "badge-gray", cancelled: "badge-red" };
  const serializedFlashMessages = JSON.stringify(flashMessages).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const overviewCounts = orderCounts ?? {
    preparing: orders.filter(order => order.status === "preparing").length,
    available: orders.filter(order => order.status === "available").length,
  };
  const activeMainSection = ["locations", "history", "advanced"].includes(activeSection) ? "settings" : activeSection;
  const sectionClass = (section: AdminSection) => `section${activeSection === section ? " active" : ""}`;
  const tabClass = (section: AdminSection) => `tab${activeMainSection === section ? " active" : ""}`;

return pageDocument({
    title: "管理画面 - 文化祭飲食システム",
    viewport: "width=device-width, initial-scale=1.0",
    stylesheet: "admin",
    script: "admin",
    bodyAttributes: { "data-flash-messages": serializedFlashMessages },
    content: `
    <header class="header">
      <div class="header-inner">
        <div class="header-brand">
          <div class="header-mark" aria-hidden="true">管</div>
          <div><div class="header-kicker">FESTIVAL ORDER SYSTEM</div><h1>管理画面</h1></div>
        </div>
        <div class="header-actions">
          <a href="/staff" class="btn btn-sm">店員画面</a>
          <form method="POST" action="/logout" class="inline-form">
            <button type="submit" class="btn btn-sm">ログアウト</button>
          </form>
        </div>
      </div>
    </header>
<div class="app">

    <section class="overview" aria-label="現在の注文状況">
      <div class="overview-item"><span class="status-dot ${settings.ordering_enabled ? "is-open" : "is-closed"}" aria-hidden="true"></span><span class="overview-label">注文</span><strong class="overview-value">${settings.ordering_enabled ? "受付中" : "停止中"}</strong></div>
      <div class="overview-item"><span class="overview-label">お待ち</span><strong class="overview-value">${overviewCounts.preparing}<small> 件</small></strong></div>
      <div class="overview-item"><span class="overview-label">呼び出し中</span><strong class="overview-value">${overviewCounts.available}<small> 件</small></strong></div>
    </section>

    <div class="workspace">
      <nav class="tabs" aria-label="管理メニュー">
        <a class="${tabClass("items")}" href="/admin/items" ${activeMainSection === "items" ? 'aria-current="page"' : ""}>商品</a>
        <a class="${tabClass("orders")}" href="/admin/orders" ${activeMainSection === "orders" ? 'aria-current="page"' : ""}>注文</a>
        <a class="${tabClass("users")}" href="/admin/users" ${activeMainSection === "users" ? 'aria-current="page"' : ""}>スタッフ</a>
        <a class="${tabClass("settings")}" href="/admin/settings" ${activeMainSection === "settings" ? 'aria-current="page"' : ""}>設定</a>
      </nav>
      <main class="content-area">

    ${activeSection === "items" ? `
    <!-- Items Page -->
    <div id="tab-items" class="${sectionClass("items")}">
      <div class="card">
        <div class="section-tools">
          <h2>商品</h2>
          <button type="button" class="btn btn-success btn-sm" data-action="show-add-item" aria-controls="add-item-form" aria-expanded="false">＋ 新規商品</button>
        </div>
        <div id="add-item-form" class="add-panel" hidden>
          <h3>新規商品を追加</h3>
          <form method="POST" action="/api/admin/items" class="form-row">
            <div class="form-group"><input type="text" name="name" placeholder="商品名" required></div>
            <div class="form-group"><select name="fulfillment_location_id" required><option value="">提供場所を選択</option>${locations.filter(location => location.active).map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`).join("")}</select></div>
            <div class="form-group sort-order-input"><input type="number" name="sort_order" placeholder="表示順" value="0"></div>
            <div><button type="submit" class="btn btn-primary">追加</button></div>
          </form>
        </div>
        <div class="table-wrap">
        <table class="item-table">
          <thead><tr><th>商品</th><th>状態</th><th><span class="sr-only">操作</span></th></tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>
                  <div class="item-name">${escapeHtml(item.name)}</div>
                  <div class="muted">${escapeHtml(item.location_name ?? locations.find(location => location.id === item.fulfillment_location_id)?.name ?? "未設定")}</div>
                </td>
                <td>
                  <span class="badge ${!item.active ? "badge-gray" : item.sold_out ? "badge-red" : "badge-green"}">${!item.active ? "停止中" : item.sold_out ? "売り切れ" : "販売中"}</span>
                </td>
                <td class="actions-cell">
                  <div class="row-actions">
                    <form method="POST" action="/api/admin/items/${item.id}/toggle-soldout" class="inline-form">
                      <button type="submit" class="btn btn-sm ${item.sold_out ? "btn-success" : ""}" ${item.active ? "" : "disabled"}>
                        ${item.sold_out ? "売切解除" : "売り切れ"}
                      </button>
                    </form>
                    <button type="button" class="btn btn-sm" data-open-dialog="item-editor-${item.id}">編集</button>
                    <dialog id="item-editor-${item.id}" class="editor-dialog">
                      <div class="dialog-head"><h3>${escapeHtml(item.name)}を編集</h3><button type="button" class="dialog-close" data-close-dialog aria-label="閉じる">×</button></div>
                      <div class="editor-panel">
                        <form method="POST" action="/api/admin/items/${item.id}/rename">
                          <label>商品名</label><input type="text" name="name" value="${escapeHtml(item.name)}" required>
                          <button type="submit" class="btn btn-sm btn-primary">商品名を更新</button>
                        </form>
                        <form method="POST" action="/api/admin/items/${item.id}/settings">
                          <label>提供場所</label><select name="fulfillment_location_id" required>${locations.filter(location => location.active || item.fulfillment_location_id === location.id).map(location => `<option value="${location.id}" ${item.fulfillment_location_id === location.id ? "selected" : ""}>${escapeHtml(location.name)}${location.active ? "" : "（停止中）"}</option>`).join("")}</select>
                          <label>1注文の数量上限</label><input type="number" min="1" name="max_quantity_per_order" value="${item.max_quantity_per_order ?? ""}" placeholder="未設定なら上限なし">
                          <label>1日の数量上限</label><input type="number" min="1" name="daily_limit" value="${item.daily_limit ?? ""}" placeholder="未設定なら上限なし">
                          <button type="submit" class="btn btn-sm btn-primary">提供設定を更新</button>
                        </form>
                        <form method="POST" action="/api/admin/items/${item.id}/sort">
                          <label>表示順</label><input type="number" name="sort_order" value="${item.sort_order}" required>
                          <button type="submit" class="btn btn-sm">表示順を更新</button>
                        </form>
                        <div class="dialog-section">
                          <span class="dialog-label">販売状態</span>
                          <form method="POST" action="/api/admin/items/${item.id}/toggle-active">
                            <button type="submit" class="btn btn-sm ${item.active ? "btn-danger" : "btn-success"}">${item.active ? "商品の販売を停止" : "商品の販売を再開"}</button>
                          </form>
                        </div>
                        <button type="button" class="btn btn-sm btn-danger" data-delete-item-id="${item.id}" data-delete-item-name="${escapeHtml(item.name)}">商品を削除</button>
                        <div class="dialog-footer"><button type="button" class="btn btn-sm" data-close-dialog>閉じる</button></div>
                      </div>
                    </dialog>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        </div>
      </div>
    </div>
    ` : ""}

    ${activeSection === "orders" ? `
    <!-- Orders Page -->
    <div id="tab-orders" class="${sectionClass("orders")}">
      <div class="card">
        <div class="section-tools section-tools-wrap">
          <div><h2>注文</h2><p class="section-description">最近の注文を確認できます</p></div>
          <div class="filter-group" role="group" aria-label="注文状態で絞り込み">
            <button type="button" class="filter-button active" data-order-filter="active" aria-pressed="true">対応中</button>
            <button type="button" class="filter-button" data-order-filter="completed" aria-pressed="false">完了</button>
            <button type="button" class="filter-button" data-order-filter="all" aria-pressed="false">すべて</button>
          </div>
        </div>
        <div class="table-wrap">
        <table class="order-table">
          <thead><tr><th>受付番号</th><th>商品</th><th>状態</th><th>日時</th><th>詳細</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr data-order-status="${escapeHtml(o.status)}" ${["preparing", "available"].includes(o.status) ? "" : "hidden"}>
                <td class="order-number">${config.displayNumberPad(o.display_number)}</td>
                <td class="order-items">${escapeHtml(o.items)}</td>
                <td><span class="badge ${statusColors[o.status] || "badge-gray"}">${escapeHtml(statusLabels[o.status] || o.status)}</span></td>
                <td class="muted">${formatDateTime(o.created_at)}</td>
                <td><a href="/order/${encodeURIComponent(o.token)}" target="_blank" rel="noopener noreferrer" class="detail-link">詳細</a></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p class="empty-state" data-order-empty hidden>該当する注文はありません</p>
        </div>
      </div>
    </div>
    ` : ""}

    ${activeSection === "users" ? `
    <!-- Users Page -->
    <div id="tab-users" class="${sectionClass("users")}">
      <div class="card">
        <div class="section-tools">
          <h2>スタッフ</h2>
          <button type="button" class="btn btn-success btn-sm" data-action="show-add-user" aria-controls="add-user-form" aria-expanded="false">＋ 新規スタッフ</button>
        </div>
        <div id="add-user-form" class="add-panel" hidden>
          <h3>スタッフを追加</h3>
          <form method="POST" action="/api/admin/users" class="form-row">
            <div class="form-group"><input type="text" name="username" placeholder="ユーザー名" required></div>
            <div class="form-group"><input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="パスワード（10文字以上）" required></div>
            <div class="form-group"><select name="staff_type"><option value="cashier">注文受付担当</option><option value="provider">提供担当</option></select></div>
            <div class="form-group"><select name="fulfillment_location_id"><option value="">提供担当の場合に選択</option>${locations.filter(location => location.active).map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`).join("")}</select></div>
            <div><button type="submit" class="btn btn-primary">追加</button></div>
          </form>
        </div>
        <div class="table-wrap">
        <table class="user-table">
          <thead><tr><th>ユーザー名</th><th>担当</th><th><span class="sr-only">操作</span></th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${escapeHtml(u.username)}</td>
                <td><span class="role-label">${u.role === "admin" ? "管理者" : u.staff_type === "provider" ? "提供担当" : "注文受付担当"}</span>${u.location_name ? `<span class="muted role-location">${escapeHtml(u.location_name)}</span>` : ""}</td>
                <td class="actions-cell">
                  ${u.role !== "admin" ? `<button type="button" class="btn btn-sm" data-open-dialog="user-editor-${escapeHtml(u.id)}">編集</button>
                  <dialog id="user-editor-${escapeHtml(u.id)}" class="editor-dialog">
                    <div class="dialog-head"><h3>${escapeHtml(u.username)}を編集</h3><button type="button" class="dialog-close" data-close-dialog aria-label="閉じる">×</button></div>
                    <div class="editor-panel">
                      <form method="POST" action="/api/admin/users/${encodeURIComponent(u.id)}/settings">
                        <label>担当</label><select name="staff_type"><option value="cashier" ${u.staff_type !== "provider" ? "selected" : ""}>注文受付担当</option><option value="provider" ${u.staff_type === "provider" ? "selected" : ""}>提供担当</option></select>
                        <label>提供場所</label><select name="fulfillment_location_id"><option value="">提供担当の場合に選択</option>${locations.filter(location => location.active).map(location => `<option value="${location.id}" ${u.fulfillment_location_id === location.id ? "selected" : ""}>${escapeHtml(location.name)}</option>`).join("")}</select>
                        <button type="submit" class="btn btn-sm btn-primary">設定を更新</button>
                      </form>
                      <form method="POST" action="/api/admin/users/${encodeURIComponent(u.id)}/password" data-confirm-password-change data-username="${escapeHtml(u.username)}">
                        <label>新しいパスワード</label><input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="128" required placeholder="10文字以上">
                        <p class="form-note">変更後、このスタッフはすべての端末で再ログインが必要です。</p>
                        <button type="submit" class="btn btn-sm">パスワードを変更</button>
                      </form>
                      <form method="POST" action="/api/admin/users/${encodeURIComponent(u.id)}/delete" data-confirm-delete-user><button type="submit" class="btn btn-sm btn-danger">スタッフを削除</button></form>
                      <div class="dialog-footer"><button type="button" class="btn btn-sm" data-close-dialog>閉じる</button></div>
                    </div>
                  </dialog>` : '<span class="muted">編集不可</span>'}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        </div>
      </div>
    </div>
    ` : ""}

    ${activeSection === "locations" ? `
    <!-- Locations Page -->
    <div id="tab-locations" class="${sectionClass("locations")}">
      <div class="subpage-heading">
        <a class="back-button" href="/admin/settings">← 設定へ戻る</a>
        <h2>提供場所の設定</h2>
      </div>
      <div class="card">
        <div class="section-tools"><h2>提供場所</h2><details class="editor"><summary>＋ 新規提供場所</summary><div class="editor-panel">
          <form method="POST" action="/api/admin/locations">
            <label>名称</label><input name="name" required placeholder="焼き物ブース">
            <label>識別子</label><input name="slug" required pattern="[a-z0-9-]+" placeholder="grill">
            <label>表示順</label><input name="sort_order" type="number" value="0">
            <button type="submit" class="btn btn-primary">追加</button>
          </form>
        </div></details></div>
      </div>
      ${locations.map(location => `<div class="card">
        <div class="location-card-head">
          <div><h2>${escapeHtml(location.name)}</h2><div class="muted">${escapeHtml(location.slug)} ・ 表示順 ${location.sort_order} ・ 注文上限 ${location.max_preparing_orders ?? "なし"} ・ 商品数上限 ${location.max_preparing_units ?? "なし"}</div></div>
          <div class="row-actions">
            <span class="badge ${location.active ? "badge-green" : "badge-gray"}">${location.active ? "稼働中" : "停止中"}</span>
            <form method="POST" action="/api/admin/locations/${location.id}/toggle-active" class="inline-form"><button type="submit" class="btn btn-sm ${location.active ? "btn-warning" : "btn-success"}">${location.active ? "停止" : "再開"}</button></form>
            <button type="button" class="btn btn-sm" data-open-dialog="location-editor-${location.id}">編集</button>
            <dialog id="location-editor-${location.id}" class="editor-dialog">
              <div class="dialog-head"><h3>${escapeHtml(location.name)}を編集</h3><button type="button" class="dialog-close" data-close-dialog aria-label="閉じる">×</button></div>
              <div class="editor-panel">
                <form method="POST" action="/api/admin/locations/${location.id}/settings">
                  <label>名称</label><input name="name" value="${escapeHtml(location.name)}" required>
                  <label>識別子（変更不可）</label><input value="${escapeHtml(location.slug)}" disabled>
                  <label>表示順</label><input type="number" name="sort_order" value="${location.sort_order}">
                  <label>準備中注文数上限</label><input type="number" min="1" name="max_preparing_orders" value="${location.max_preparing_orders ?? ""}" placeholder="未設定なら上限なし">
                  <label>準備中商品数上限</label><input type="number" min="1" name="max_preparing_units" value="${location.max_preparing_units ?? ""}" placeholder="未設定なら上限なし">
                  <button type="submit" class="btn btn-primary">設定を更新</button>
                </form>
                <div class="dialog-footer"><button type="button" class="btn btn-sm" data-close-dialog>閉じる</button></div>
              </div>
            </dialog>
          </div>
        </div>
      </div>`).join("")}
    </div>
    ` : ""}

    ${activeSection === "history" ? `
    <!-- History Page -->
    <div id="tab-history" class="${sectionClass("history")}">
      <div class="subpage-heading">
        <a class="back-button" href="/admin/settings">← 設定へ戻る</a>
        <h2>操作履歴</h2>
      </div>
      <div class="card">
        <p class="section-description history-description">直近200件の注文・提供状態の変更を表示しています</p>
        <div class="table-wrap"><table class="history-table">
          <thead><tr><th>日時</th><th>受付番号</th><th>提供場所</th><th>変更</th><th>担当者</th></tr></thead>
          <tbody>${events.map(event => `<tr>
            <td class="history-date">${formatDateTime(event.created_at)}</td>
            <td class="history-number">${event.display_number == null ? "---" : config.displayNumberPad(event.display_number)}</td>
            <td>${escapeHtml(event.location_name ?? "---")}</td>
            <td>${escapeHtml(eventDescription(event))}</td>
            <td>${escapeHtml(event.username ?? "システム")}</td>
          </tr>`).join("")}</tbody>
        </table></div>
      </div>
    </div>
    ` : ""}

    ${activeSection === "settings" ? `
    <!-- Settings Page -->
    <div id="tab-settings" class="${sectionClass("settings")}">
      <div class="page-heading"><h2>設定</h2><p>営業中によく変更する項目だけを表示しています</p></div>
      <div class="card settings-card">
        <h3>注文受付</h3>
        <form method="POST" action="/api/admin/settings/orders">
          <div class="setting-row">
            <div><div class="setting-label">受付状態</div><p class="setting-help">注文の受付をすぐに開始・停止します</p></div>
            <div class="segmented-control">
              <label><input type="radio" name="ordering_enabled" value="1" ${settings.ordering_enabled ? "checked" : ""}><span>受付中</span></label>
              <label><input type="radio" name="ordering_enabled" value="0" ${!settings.ordering_enabled ? "checked" : ""}><span>停止中</span></label>
            </div>
          </div>
          <div class="setting-row">
            <div><div class="setting-label">受付時間</div><p class="setting-help">未入力の場合は時刻による制限を行いません</p></div>
            <div class="time-range"><label><span>開始</span><input type="time" name="order_open_time" value="${settings.order_open_time ?? ""}"></label><span aria-hidden="true">–</span><label><span>終了</span><input type="time" name="order_close_time" value="${settings.order_close_time ?? ""}"></label></div>
          </div>
          <input type="hidden" name="daily_order_limit" value="${settings.daily_order_limit ?? ""}">
          <input type="hidden" name="max_items_per_order" value="${settings.max_items_per_order}">
          <input type="hidden" name="max_total_quantity" value="${settings.max_total_quantity}">
          <input type="hidden" name="completed_order_retention_days" value="${settings.completed_order_retention_days}">
          <div class="settings-actions"><button type="submit" class="btn btn-primary">保存</button></div>
        </form>
      </div>

      <div class="settings-links" aria-label="その他の設定">
        <a class="settings-link" href="/admin/settings/locations"><span><strong>提供場所の設定</strong><small>${locations.length}か所の提供場所を管理</small></span><span aria-hidden="true">›</span></a>
        <a class="settings-link" href="/admin/settings/history"><span><strong>操作履歴</strong><small>注文や提供状態の変更を確認</small></span><span aria-hidden="true">›</span></a>
        <a class="settings-link" href="/admin/settings/advanced"><span><strong>詳細設定・データ管理</strong><small>注文上限、番号、バックアップなど</small></span><span aria-hidden="true">›</span></a>
      </div>
    </div>
    ` : ""}

    ${activeSection === "advanced" ? `
    <!-- Advanced Settings Page -->
    <div id="tab-advanced" class="${sectionClass("advanced")}">
      <div class="subpage-heading">
        <a class="back-button" href="/admin/settings">← 設定へ戻る</a>
        <h2>詳細設定・データ管理</h2>
      </div>
      <div class="card compact-card">
        <h3>注文上限とデータ保持</h3>
        <form method="POST" action="/api/admin/settings/orders">
          <input type="hidden" name="return_to" value="advanced">
          <input type="hidden" name="ordering_enabled" value="${settings.ordering_enabled ? "1" : "0"}">
          <input type="hidden" name="order_open_time" value="${settings.order_open_time ?? ""}">
          <input type="hidden" name="order_close_time" value="${settings.order_close_time ?? ""}">
          <div class="form-grid">
            <div class="form-group"><label>1日注文数上限</label><input type="number" min="1" name="daily_order_limit" value="${settings.daily_order_limit ?? ""}" placeholder="上限なし"></div>
            <div class="form-group"><label>1注文の商品種類上限</label><input type="number" min="1" max="100" name="max_items_per_order" value="${settings.max_items_per_order}" required></div>
            <div class="form-group"><label>1注文の合計数量上限</label><input type="number" min="1" max="10000" name="max_total_quantity" value="${settings.max_total_quantity}" required></div>
            <div class="form-group"><label>完了注文の保持日数</label><input type="number" min="1" max="3650" name="completed_order_retention_days" value="${settings.completed_order_retention_days}" required></div>
          </div>
          <button type="submit" class="btn btn-primary">詳細設定を保存</button>
        </form>
      </div>

      <div class="card compact-card">
        <h3>管理者パスワード</h3>
        <form method="POST" action="/api/admin/password" class="form-row">
          <div class="form-group"><label>現在のパスワード</label><input type="password" name="current_password" autocomplete="current-password" required></div>
          <div class="form-group"><label>新しいパスワード</label><input type="password" name="new_password" autocomplete="new-password" minlength="10" maxlength="128" required></div>
          <div><button type="submit" class="btn btn-primary">パスワードを変更</button></div>
        </form>
      </div>
      <div class="card compact-card">
        <h3>受付番号</h3>
        <div class="number-summary">
          <div><span>日付</span><strong>${currentNum ? currentNum.date : "---"}</strong></div>
          <div><span>現在の番号</span><strong>${currentNum ? config.displayNumberPad(currentNum.number) : "---"}</strong></div>
        </div>
        <div class="danger-action">
          <button class="btn btn-warning" data-action="reset-numbers">番号をリセット</button>
          <span class="muted">未処理の注文がない場合のみ、新しい注文を1番から採番します</span>
        </div>
      </div>

      <div class="card compact-card">
        <h3>データ管理</h3>
        <div class="data-actions">
          <button type="button" class="btn" data-action="backup">今すぐバックアップ</button>
          <button type="button" class="btn btn-danger" data-action="cleanup">古い注文を削除</button>
        </div>
        <p class="setting-help">${settings.completed_order_retention_days}日より古い受渡済み・キャンセル注文だけを削除します。監査履歴は保持されます。</p>
      </div>
    </div>
    ` : ""}
      </main>
    </div>
  </div>

  <div id="toast-container"></div>
    `,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function statusName(status: string | null): string {
  if (!status) return "新規";
  return { preparing: "準備中", ready: "提供可能", handed_over: "受渡済", cancelled: "キャンセル" }[status] ?? status;
}

function eventDescription(event: EventSummary): string {
  if (event.event_type === "order_created") return "注文作成";
  if (event.event_type === "order_cancelled") {
    try {
      const reason = event.details ? JSON.parse(event.details).reason : null;
      return reason ? `注文キャンセル（${reason}）` : "注文キャンセル";
    } catch { return "注文キャンセル"; }
  }
  if (event.event_type === "orders_cleaned") {
    try {
      const details = event.details ? JSON.parse(event.details) : null;
      return details ? `完了注文を${details.deleted ?? 0}件削除` : "完了注文を削除";
    } catch { return "完了注文を削除"; }
  }
  return `${statusName(event.from_status)} → ${statusName(event.to_status)}`;
}
