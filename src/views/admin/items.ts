import { escapeHtml } from "./helpers";
import type { AdminItem, AdminLocation } from "./types";

export function renderItemsSection(items: AdminItem[], locations: AdminLocation[]): string {
  return `<div id="tab-items" class="section active">
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
      <div class="table-wrap"><table class="item-table">
        <thead><tr><th>商品</th><th>状態</th><th><span class="sr-only">操作</span></th></tr></thead>
        <tbody>${items.map(item => `<tr>
          <td><div class="item-name">${escapeHtml(item.name)}</div><div class="muted">${escapeHtml(item.location_name ?? locations.find(location => location.id === item.fulfillment_location_id)?.name ?? "未設定")}</div></td>
          <td><span class="badge ${!item.active ? "badge-gray" : item.sold_out ? "badge-red" : "badge-green"}">${!item.active ? "停止中" : item.sold_out ? "売り切れ" : "販売中"}</span></td>
          <td class="actions-cell"><div class="row-actions">
            <form method="POST" action="/api/admin/items/${item.id}/toggle-soldout" class="inline-form"><button type="submit" class="btn btn-sm ${item.sold_out ? "btn-success" : ""}" ${item.active ? "" : "disabled"}>${item.sold_out ? "売切解除" : "売り切れ"}</button></form>
            <button type="button" class="btn btn-sm" data-open-dialog="item-editor-${item.id}">編集</button>
            <dialog id="item-editor-${item.id}" class="editor-dialog">
              <div class="dialog-head"><h3>${escapeHtml(item.name)}を編集</h3><button type="button" class="dialog-close" data-close-dialog aria-label="閉じる">×</button></div>
              <div class="editor-panel">
                <form method="POST" action="/api/admin/items/${item.id}/rename"><label>商品名</label><input type="text" name="name" value="${escapeHtml(item.name)}" required><button type="submit" class="btn btn-sm btn-primary">商品名を更新</button></form>
                <form method="POST" action="/api/admin/items/${item.id}/settings">
                  <label>提供場所</label><select name="fulfillment_location_id" required>${locations.filter(location => location.active || item.fulfillment_location_id === location.id).map(location => `<option value="${location.id}" ${item.fulfillment_location_id === location.id ? "selected" : ""}>${escapeHtml(location.name)}${location.active ? "" : "（停止中）"}</option>`).join("")}</select>
                  <label>1注文の数量上限</label><input type="number" min="1" name="max_quantity_per_order" value="${item.max_quantity_per_order ?? ""}" placeholder="未設定なら上限なし">
                  <label>1日の数量上限</label><input type="number" min="1" name="daily_limit" value="${item.daily_limit ?? ""}" placeholder="未設定なら上限なし">
                  <button type="submit" class="btn btn-sm btn-primary">提供設定を更新</button>
                </form>
                <form method="POST" action="/api/admin/items/${item.id}/sort"><label>表示順</label><input type="number" name="sort_order" value="${item.sort_order}" required><button type="submit" class="btn btn-sm">表示順を更新</button></form>
                <div class="dialog-section"><span class="dialog-label">販売状態</span><form method="POST" action="/api/admin/items/${item.id}/toggle-active"><button type="submit" class="btn btn-sm ${item.active ? "btn-danger" : "btn-success"}">${item.active ? "商品の販売を停止" : "商品の販売を再開"}</button></form></div>
                <button type="button" class="btn btn-sm btn-danger" data-delete-item-id="${item.id}" data-delete-item-name="${escapeHtml(item.name)}">商品を削除</button>
                <div class="dialog-footer"><button type="button" class="btn btn-sm" data-close-dialog>閉じる</button></div>
              </div>
            </dialog>
          </div></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}
