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
): string {
  const statusLabels: Record<string, string> = { preparing: "準備中", available: "提供可能", delivered: "受渡済", cancelled: "キャンセル" };
  const statusColors: Record<string, string> = { preparing: "badge-blue", available: "badge-green", delivered: "badge-gray", cancelled: "badge-red" };
  const serializedFlashMessages = JSON.stringify(flashMessages).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

return pageDocument({
    title: "管理画面 - 文化祭飲食システム",
    viewport: "width=device-width, initial-scale=1.0",
    stylesheet: "admin",
    script: "admin",
    bodyAttributes: { "data-flash-messages": serializedFlashMessages },
    content: `
<div class="app">
    <div class="header">
      <div class="header-title">
        <h1>管理画面</h1>
        <div class="header-subtitle">商品・注文・スタッフ・提供場所の管理</div>
      </div>
      <div class="flex">
        <a href="/staff" class="btn btn-primary btn-sm">店員画面</a>
        <form method="POST" action="/logout" class="inline-form">
          <button type="submit" class="btn btn-secondary btn-sm">ログアウト</button>
        </form>
      </div>
    </div>

    <section class="overview" aria-label="現在の注文状況">
      <div class="overview-item"><span class="overview-label">注文受付</span><strong class="overview-value">${settings.ordering_enabled ? "受付中" : "停止中"}</strong></div>
      <div class="overview-item"><span class="overview-label">お待ち</span><strong class="overview-value">${orders.filter(o => o.status === "preparing").length}<small> 件</small></strong></div>
      <div class="overview-item"><span class="overview-label">お呼び出し中</span><strong class="overview-value">${orders.filter(o => o.status === "available").length}<small> 件</small></strong></div>
      <div class="overview-item"><span class="overview-label">現在の受付番号</span><strong class="overview-value">${currentNum ? config.displayNumberPad(currentNum.number) : "---"}</strong></div>
    </section>

    <div class="workspace">
      <div class="tabs" role="tablist" aria-label="管理メニュー">
        <button class="tab active" data-tab="items" role="tab" aria-selected="true" aria-controls="tab-items">商品</button>
        <button class="tab" data-tab="orders" role="tab" aria-selected="false" aria-controls="tab-orders">注文</button>
        <button class="tab" data-tab="users" role="tab" aria-selected="false" aria-controls="tab-users">スタッフ</button>
        <button class="tab" data-tab="locations" role="tab" aria-selected="false" aria-controls="tab-locations">提供場所</button>
        <button class="tab" data-tab="history" role="tab" aria-selected="false" aria-controls="tab-history">操作履歴</button>
        <button class="tab" data-tab="settings" role="tab" aria-selected="false" aria-controls="tab-settings">システム設定</button>
      </div>
      <main class="content-area">

    <!-- Items Tab -->
    <div id="tab-items" class="section active">
      <div class="card">
        <div class="section-tools">
          <h2>商品</h2>
          <button type="button" class="btn btn-success btn-sm" data-action="show-add-item" aria-controls="add-item-form" aria-expanded="false">＋ 新規商品</button>
        </div>
        <div id="add-item-form" class="add-panel" hidden>
          <h3 style="font-size:15px;margin-bottom:8px">新規商品を追加</h3>
          <form method="POST" action="/api/admin/items" class="form-row">
            <div class="form-group"><input type="text" name="name" placeholder="商品名" required></div>
            <div class="form-group"><select name="fulfillment_location_id" required><option value="">提供場所を選択</option>${locations.filter(location => location.active).map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`).join("")}</select></div>
            <div class="form-group"><input type="number" name="sort_order" placeholder="表示順" value="0" style="max-width:100px"></div>
            <div><button type="submit" class="btn btn-primary">追加</button></div>
          </form>
        </div>
        <table>
          <thead><tr><th>商品</th><th>提供場所・上限</th><th>状態</th><th>操作</th></tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>
                  <div class="item-name">${escapeHtml(item.name)}</div>
                  <div class="muted">表示順 ${item.sort_order}</div>
                </td>
                <td>
                  <div>${escapeHtml(item.location_name ?? locations.find(location => location.id === item.fulfillment_location_id)?.name ?? "未設定")}</div>
                  <div class="muted">1注文 ${item.max_quantity_per_order ?? "上限なし"} ／ 1日 ${item.daily_limit ?? "上限なし"}</div>
                </td>
                <td>
                  ${item.active ? "" : '<span class="badge badge-gray">停止中</span> '}
                  ${item.sold_out ? '<span class="badge badge-red">売り切れ</span>' : '<span class="badge badge-green">販売中</span>'}
                </td>
                <td>
                  <div class="row-actions">
                    <form method="POST" action="/api/admin/items/${item.id}/toggle-active" class="inline-form">
                      <button type="submit" class="btn btn-sm ${item.active ? "btn-warning" : "btn-success"}">
                        ${item.active ? "販売停止" : "販売再開"}
                      </button>
                    </form>
                    <form method="POST" action="/api/admin/items/${item.id}/toggle-soldout" class="inline-form">
                      <button type="submit" class="btn btn-sm ${item.sold_out ? "btn-success" : "btn-warning"}">
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

    <!-- Orders Tab -->
    <div id="tab-orders" class="section">
      <div class="card">
        <h2>注文</h2>
        <table>
          <thead><tr><th>受付番号</th><th>商品</th><th>状態</th><th>日時</th><th>詳細</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td style="font-weight:700">${config.displayNumberPad(o.display_number)}</td>
                <td style="font-size:13px">${escapeHtml(o.items)}</td>
                <td><span class="badge ${statusColors[o.status] || "badge-gray"}">${escapeHtml(statusLabels[o.status] || o.status)}</span></td>
                <td style="font-size:12px;color:#6b7280">${formatDateTime(o.created_at)}</td>
                <td><a href="/order/${encodeURIComponent(o.token)}" target="_blank" rel="noopener noreferrer" style="font-size:12px">開く</a></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Users Tab -->
    <div id="tab-users" class="section">
      <div class="card">
        <div class="section-tools">
          <h2>スタッフ</h2>
          <button type="button" class="btn btn-success btn-sm" data-action="show-add-user" aria-controls="add-user-form" aria-expanded="false">＋ 新規スタッフ</button>
        </div>
        <div id="add-user-form" class="add-panel" hidden>
          <h3 style="font-size:15px;margin-bottom:8px">スタッフを追加</h3>
          <form method="POST" action="/api/admin/users" class="form-row">
            <div class="form-group"><input type="text" name="username" placeholder="ユーザー名" required></div>
            <div class="form-group"><input type="password" name="password" minlength="10" placeholder="パスワード（10文字以上）" required></div>
            <div class="form-group"><select name="staff_type"><option value="cashier">注文受付担当</option><option value="provider">提供担当</option></select></div>
            <div class="form-group"><select name="fulfillment_location_id"><option value="">提供担当の場合に選択</option>${locations.filter(location => location.active).map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`).join("")}</select></div>
            <div><button type="submit" class="btn btn-primary">追加</button></div>
          </form>
        </div>
        <table>
          <thead><tr><th>ユーザー名</th><th>権限</th><th>作成日</th><th>操作</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${escapeHtml(u.username)}</td>
                <td><span class="badge ${u.role === "admin" ? "badge-blue" : "badge-gray"}">${u.role === "admin" ? "管理者" : u.staff_type === "provider" ? "提供担当" : "注文受付担当"}</span>${u.location_name ? `<br><small>${escapeHtml(u.location_name)}</small>` : ""}</td>
                <td style="font-size:12px;color:#6b7280">${formatDateTime(u.created_at)}</td>
                <td>
                  ${u.role !== "admin" ? `<button type="button" class="btn btn-sm" data-open-dialog="user-editor-${escapeHtml(u.id)}">編集</button>
                  <dialog id="user-editor-${escapeHtml(u.id)}" class="editor-dialog">
                    <div class="dialog-head"><h3>${escapeHtml(u.username)}を編集</h3><button type="button" class="dialog-close" data-close-dialog aria-label="閉じる">×</button></div>
                    <div class="editor-panel">
                      <form method="POST" action="/api/admin/users/${encodeURIComponent(u.id)}/settings">
                        <label>担当</label><select name="staff_type"><option value="cashier" ${u.staff_type !== "provider" ? "selected" : ""}>注文受付担当</option><option value="provider" ${u.staff_type === "provider" ? "selected" : ""}>提供担当</option></select>
                        <label>提供場所</label><select name="fulfillment_location_id"><option value="">提供担当の場合に選択</option>${locations.filter(location => location.active).map(location => `<option value="${location.id}" ${u.fulfillment_location_id === location.id ? "selected" : ""}>${escapeHtml(location.name)}</option>`).join("")}</select>
                        <button type="submit" class="btn btn-sm btn-primary">設定を更新</button>
                      </form>
                      <form method="POST" action="/api/admin/users/${encodeURIComponent(u.id)}/password">
                        <label>新しいパスワード</label><input type="password" name="password" minlength="10" required placeholder="10文字以上">
                        <button type="submit" class="btn btn-sm">パスワードをリセット</button>
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

    <!-- Locations Tab -->
    <div id="tab-locations" class="section">
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

    <!-- History Tab -->
    <div id="tab-history" class="section">
      <div class="card">
        <h2>注文・提供状態の操作履歴</h2>
        <table>
          <thead><tr><th>日時</th><th>受付番号</th><th>提供場所</th><th>変更</th><th>担当者</th></tr></thead>
          <tbody>${events.map(event => `<tr>
            <td style="font-size:12px">${formatDateTime(event.created_at)}</td>
            <td style="font-weight:700">${event.display_number == null ? "---" : config.displayNumberPad(event.display_number)}</td>
            <td>${escapeHtml(event.location_name ?? "---")}</td>
            <td>${escapeHtml(eventDescription(event))}</td>
            <td>${escapeHtml(event.username ?? "システム")}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>
    </div>

    <!-- Settings Tab -->
    <div id="tab-settings" class="section">
      <div class="card">
        <h2>注文受付設定</h2>
        <form method="POST" action="/api/admin/settings/orders">
          <div class="form-row">
            <div class="form-group"><label>受付状態</label><select name="ordering_enabled"><option value="1" ${settings.ordering_enabled ? "selected" : ""}>受付中</option><option value="0" ${!settings.ordering_enabled ? "selected" : ""}>停止中</option></select></div>
            <div class="form-group"><label>開始時刻</label><input type="time" name="order_open_time" value="${settings.order_open_time ?? ""}"></div>
            <div class="form-group"><label>終了時刻</label><input type="time" name="order_close_time" value="${settings.order_close_time ?? ""}"></div>
            <div class="form-group"><label>1日注文数上限</label><input type="number" min="1" name="daily_order_limit" value="${settings.daily_order_limit ?? ""}"></div>
            <div class="form-group"><label>1注文の商品種類上限</label><input type="number" min="1" max="100" name="max_items_per_order" value="${settings.max_items_per_order}" required></div>
            <div class="form-group"><label>1注文の合計数量上限</label><input type="number" min="1" max="10000" name="max_total_quantity" value="${settings.max_total_quantity}" required></div>
            <div class="form-group"><label>完了注文の保持日数</label><input type="number" min="1" max="3650" name="completed_order_retention_days" value="${settings.completed_order_retention_days}" required></div>
          </div>
          <button type="submit" class="btn btn-primary">注文設定を更新</button>
        </form>
      </div>

      <div class="card">
        <h2>管理者パスワード</h2>
        <form method="POST" action="/api/admin/password" class="form-row">
          <div class="form-group"><label>現在のパスワード</label><input type="password" name="current_password" required></div>
          <div class="form-group"><label>新しいパスワード</label><input type="password" name="new_password" minlength="10" required></div>
          <div><button type="submit" class="btn btn-primary">パスワードを変更</button></div>
        </form>
      </div>
      <div class="card">
        <h2>番号設定</h2>
        <div class="flex" style="align-items:center;gap:16px">
          <div>
            <div style="font-size:13px;color:#6b7280">現在の日付</div>
            <div style="font-size:18px;font-weight:700">${currentNum ? currentNum.date : "---"}</div>
          </div>
          <div>
            <div style="font-size:13px;color:#6b7280">現在の番号</div>
            <div style="font-size:24px;font-weight:700;color:#111827">${currentNum ? config.displayNumberPad(currentNum.number) : "---"}</div>
          </div>
        </div>
        <div class="mt-2">
          <button class="btn btn-warning" data-action="reset-numbers">番号をリセット</button>
          <span style="font-size:12px;color:#6b7280;margin-left:8px">※ 未処理の注文がない場合のみ、新しい注文を1番から採番します</span>
        </div>
      </div>

      <div class="card">
        <h2>データ管理</h2>
        <button type="button" class="btn" data-action="backup">今すぐバックアップ</button>
        <button type="button" class="btn btn-danger" data-action="cleanup">古い注文を削除</button>
        <span style="font-size:12px;color:#6b7280;margin-left:8px">${settings.completed_order_retention_days}日より古い受け渡し済み・キャンセル注文だけを削除します（監査履歴は保持）</span>
      </div>
    </div>
      </main>
    </div>
  </div>

  <div id="toast-container"></div>
  <div id="confirm-modal" style="display:none"></div>
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
