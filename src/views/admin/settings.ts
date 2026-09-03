import { config } from "../../config";
import { formatDateTime } from "../../services/time";
import { escapeHtml, eventDescription, renderPagination } from "./helpers";
import type { AdminEvent, AdminLocation, AdminOrderSettings, AdminPagination } from "./types";

export function renderSettingsSection(settings: AdminOrderSettings, locations: AdminLocation[]): string {
  return `<div id="tab-settings" class="section active">
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
  </div>`;
}

export function renderLocationsSection(locations: AdminLocation[]): string {
  return `<div id="tab-locations" class="section active">
    <div class="subpage-heading"><a class="back-button" href="/admin/settings">← 設定へ戻る</a><h2>提供場所の設定</h2></div>
    <div class="card"><div class="section-tools"><h2>提供場所</h2><details class="editor"><summary>＋ 新規提供場所</summary><div class="editor-panel">
      <form method="POST" action="/api/admin/locations">
        <label>名称</label><input name="name" required placeholder="焼き物ブース">
        <label>識別子</label><input name="slug" required pattern="[a-z0-9-]+" placeholder="grill">
        <label>表示順</label><input name="sort_order" type="number" value="0">
        <button type="submit" class="btn btn-primary">追加</button>
      </form>
    </div></details></div></div>
    ${locations.map(location => `<div class="card"><div class="location-card-head">
      <div><h2>${escapeHtml(location.name)}</h2><div class="muted">${escapeHtml(location.slug)} ・ 表示順 ${location.sort_order} ・ 注文上限 ${location.max_preparing_orders ?? "なし"} ・ 商品数上限 ${location.max_preparing_units ?? "なし"}</div></div>
      <div class="row-actions">
        <span class="badge ${location.active ? "badge-green" : "badge-gray"}">${location.active ? "稼働中" : "停止中"}</span>
        <form method="POST" action="/api/admin/locations/${location.id}/toggle-active" class="inline-form"><button type="submit" class="btn btn-sm ${location.active ? "btn-warning" : "btn-success"}">${location.active ? "停止" : "再開"}</button></form>
        <button type="button" class="btn btn-sm" data-open-dialog="location-editor-${location.id}">編集</button>
        <dialog id="location-editor-${location.id}" class="editor-dialog">
          <div class="dialog-head"><h3>${escapeHtml(location.name)}を編集</h3><button type="button" class="dialog-close" data-close-dialog aria-label="閉じる">×</button></div>
          <div class="editor-panel"><form method="POST" action="/api/admin/locations/${location.id}/settings">
            <label>名称</label><input name="name" value="${escapeHtml(location.name)}" required>
            <label>識別子（変更不可）</label><input value="${escapeHtml(location.slug)}" disabled>
            <label>表示順</label><input type="number" name="sort_order" value="${location.sort_order}">
            <label>準備中注文数上限</label><input type="number" min="1" name="max_preparing_orders" value="${location.max_preparing_orders ?? ""}" placeholder="未設定なら上限なし">
            <label>準備中商品数上限</label><input type="number" min="1" name="max_preparing_units" value="${location.max_preparing_units ?? ""}" placeholder="未設定なら上限なし">
            <button type="submit" class="btn btn-primary">設定を更新</button>
          </form><div class="dialog-footer"><button type="button" class="btn btn-sm" data-close-dialog>閉じる</button></div></div>
        </dialog>
      </div>
    </div></div>`).join("")}
  </div>`;
}

export function renderHistorySection(events: AdminEvent[], pagination?: AdminPagination): string {
  return `<div id="tab-history" class="section active">
    <div class="subpage-heading"><a class="back-button" href="/admin/settings">← 設定へ戻る</a><h2>操作履歴</h2></div>
    <div class="card">
      <p class="section-description history-description">注文・提供状態・管理設定の変更を新しい順に表示しています</p>
      <div class="table-wrap"><table class="history-table">
        <thead><tr><th>日時</th><th>受付番号</th><th>提供場所</th><th>変更</th><th>担当者</th></tr></thead>
        <tbody>${events.map(event => `<tr>
          <td class="history-date">${formatDateTime(event.created_at)}</td>
          <td class="history-number">${event.display_number == null ? "---" : config.displayNumberPad(event.display_number)}</td>
          <td>${escapeHtml(event.location_name ?? "---")}</td>
          <td>${escapeHtml(eventDescription(event))}</td>
          <td>${escapeHtml(event.username ?? "システム")}</td>
        </tr>`).join("")}</tbody>
      </table></div>${renderPagination(pagination)}
    </div>
  </div>`;
}

export function renderAdvancedSection(settings: AdminOrderSettings, currentNum: { number: number; date: string } | null): string {
  return `<div id="tab-advanced" class="section active">
    <div class="subpage-heading"><a class="back-button" href="/admin/settings">← 設定へ戻る</a><h2>詳細設定・データ管理</h2></div>
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
    <div class="card compact-card"><h3>管理者パスワード</h3>
      <form method="POST" action="/api/admin/password" class="form-row">
        <div class="form-group"><label>現在のパスワード</label><input type="password" name="current_password" autocomplete="current-password" required></div>
        <div class="form-group"><label>新しいパスワード</label><input type="password" name="new_password" autocomplete="new-password" minlength="10" maxlength="128" required></div>
        <div><button type="submit" class="btn btn-primary">パスワードを変更</button></div>
      </form>
    </div>
    <div class="card compact-card"><h3>受付番号</h3>
      <div class="number-summary"><div><span>日付</span><strong>${currentNum ? currentNum.date : "---"}</strong></div><div><span>現在の番号</span><strong>${currentNum ? config.displayNumberPad(currentNum.number) : "---"}</strong></div></div>
      <div class="danger-action"><button class="btn btn-warning" data-action="reset-numbers">番号をリセット</button><span class="muted">未処理の注文がない場合のみ、新しい注文を1番から採番します</span></div>
    </div>
    <div class="card compact-card"><h3>データ管理</h3>
      <div class="data-actions"><button type="button" class="btn" data-action="backup">今すぐバックアップ</button><button type="button" class="btn btn-danger" data-action="cleanup">古い注文を削除</button></div>
      <p class="setting-help">${settings.completed_order_retention_days}日より古い受渡済み・キャンセル注文だけを削除します。監査履歴は保持されます。</p>
    </div>
  </div>`;
}
