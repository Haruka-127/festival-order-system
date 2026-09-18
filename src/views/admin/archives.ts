import { formatDateTime } from "../../services/time";
import { escapeHtml, eventDescription, renderPagination } from "./helpers";
import type { AdminEvent, AdminPageState } from "./types";
import type { OrderArchive } from "../../services/order-archives";

const archiveRoot = "/admin/settings/archives";
const statusLabels: Record<string, string> = {
  preparing: "準備中", available: "提供可能", delivered: "受渡済み", cancelled: "キャンセル",
  ready: "提供可能", handed_over: "受渡済み",
};
const date = (value: string | null) => value ? formatDateTime(value) : "---";
const number = (value: number, archive: OrderArchive) => String(value).padStart(archive.display_digits, "0");

function metadata(archive: OrderArchive): string {
  return `<div class="card compact-card"><h3>${date(archive.created_at)} のバックアップ</h3>
    <p>実行者：${escapeHtml(archive.actor_username)} ／ 注文：${archive.order_count}件（対応中 ${archive.active_count}件）</p>
    <p class="muted">注文期間：${date(archive.oldest_order_at)} ～ ${date(archive.newest_order_at)} ／ ${(archive.bytes / 1024 / 1024).toFixed(2)} MB</p>
    <p class="setting-help">保存時点の履歴を表示しています。現在の注文や設定には影響しません。</p>
    <div class="row-actions"><a class="btn btn-sm" href="${archiveRoot}/${archive.id}">注文一覧・販売集計</a><a class="btn btn-sm" href="${archiveRoot}/${archive.id}/history">保存時点の操作履歴</a></div>
  </div>`;
}

function eventsTable(events: AdminEvent[], archive: OrderArchive): string {
  return `<div class="table-wrap"><table class="history-table"><thead><tr><th>日時</th><th>受付番号</th><th>提供場所</th><th>変更</th><th>担当者</th></tr></thead>
    <tbody>${events.map(event => `<tr><td>${date(event.created_at)}</td><td>${event.display_number === null ? "---" : number(event.display_number, archive)}</td>
      <td>${escapeHtml(event.location_name ?? "---")}</td><td>${escapeHtml(eventDescription(event))}</td><td>${escapeHtml(event.username ?? "システム")}</td></tr>`).join("")}</tbody></table></div>
    ${events.length ? "" : '<p class="empty-state">操作履歴はありません</p>'}`;
}

export function renderArchivesSection(state: AdminPageState): string {
  const data = state.archivePage;
  let content = "";
  if (!data || data.kind === "error") {
    content = `<div class="card"><p role="alert">${escapeHtml(data?.message ?? "バックアップが見つかりません")}</p></div>`;
  } else if (data.kind === "index") {
    content = `<div class="card compact-card"><h3>注文履歴の完全リセット</h3>
      <p>全期間・すべての状態の注文をバックアップした後、注文履歴・販売集計・日次受付数量を初期化し、次の受付番号を1番に戻します。</p>
      <p>商品・売り切れ状態・スタッフ・提供場所・受付設定は維持されます。対応中の注文も対象です。</p>
      <p class="setting-help">保存に失敗した場合はリセットしません。リセット後も、この画面から過去の履歴を閲覧できます。</p>
      <button type="button" class="btn btn-danger" data-action="reset-order-history">バックアップして完全リセット</button>
      <p id="order-reset-result" role="status" aria-live="polite"></p>
      <dialog id="order-reset-dialog" class="editor-dialog">
        <div class="dialog-head"><h3>注文履歴を完全リセット</h3><button type="button" class="dialog-close" data-close-dialog aria-label="閉じる">×</button></div>
        <form id="order-reset-form" class="editor-panel">
          <p id="order-reset-preview"></p>
          <p>対応中の注文と利用客の注文ページも終了します。実行する場合は「リセット」と入力してください。</p>
          <label for="order-reset-confirmation">確認文字</label><input id="order-reset-confirmation" name="confirmation" required autocomplete="off" pattern="リセット">
          <div class="dialog-footer"><button type="button" class="btn" data-close-dialog>戻る</button><button type="submit" class="btn btn-danger">保存してリセットする</button></div>
        </form>
      </dialog>
    </div>
    <div class="card"><h3>保存済みの注文履歴</h3>
      <p class="setting-help">リセット時のバックアップは自動削除されません。通常の「今すぐバックアップ」とは別に保存されます。</p>
      <div class="table-wrap"><table><thead><tr><th>保存日時</th><th>注文期間</th><th>件数</th><th>実行者</th><th>履歴</th></tr></thead><tbody>
      ${data.archives.map(archive => `<tr><td>${date(archive.created_at)}</td><td>${date(archive.oldest_order_at)} ～ ${date(archive.newest_order_at)}</td><td>${archive.order_count}件</td><td>${escapeHtml(archive.actor_username)}</td><td><a class="detail-link" href="${archiveRoot}/${archive.id}">閲覧</a></td></tr>`).join("")}
      </tbody></table></div>${data.archives.length ? "" : '<p class="empty-state">保存済みの注文履歴はありません</p>'}${renderPagination(state.pagination)}</div>`;
  } else {
    const { archive } = data;
    content = metadata(archive);
    if (data.kind === "orders") {
      const filter = state.orderFilter ?? "all";
      content += `<div class="card"><h3>保存時点の販売集計</h3><p>受渡済みの商品数：<strong>${data.soldUnits}点</strong></p>
        <details><summary>商品別の販売数量を見る</summary><div class="table-wrap"><table><thead><tr><th>商品</th><th>受渡済み数量</th></tr></thead><tbody>
        ${data.sales.map(sale => `<tr><td>${escapeHtml(sale.name)}</td><td>${sale.quantity}</td></tr>`).join("")}</tbody></table></div></details></div>
        <div class="card"><h3>保存された注文</h3><div class="filter-group" aria-label="注文状態で絞り込み">
        ${([ ["all", "すべて"], ["active", "対応中"], ["completed", "完了"] ] as const).map(([value, label]) => `<a class="filter-button${value === filter ? " active" : ""}" href="${archiveRoot}/${archive.id}?status=${value}" ${value === filter ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</div>
        <div class="table-wrap"><table class="order-table"><thead><tr><th>受付番号</th><th>商品</th><th>状態</th><th>日時</th><th>詳細</th></tr></thead><tbody>
        ${data.orders.map(order => `<tr><td>${number(order.display_number, archive)}</td><td>${escapeHtml(order.items)}</td><td>${escapeHtml(statusLabels[order.status] ?? order.status)}</td><td>${date(order.created_at)}</td><td><a class="detail-link" href="${archiveRoot}/${archive.id}/orders/${encodeURIComponent(order.id)}">詳細</a></td></tr>`).join("")}
        </tbody></table></div>${data.orders.length ? "" : '<p class="empty-state">該当する注文はありません</p>'}${renderPagination(state.pagination)}</div>`;
    } else if (data.kind === "history") {
      content += `<div class="card"><h3>保存時点の操作履歴</h3>${eventsTable(data.events, archive)}${renderPagination(state.pagination)}</div>`;
    } else {
      const order = data.order;
      content += `<div class="card"><h3>受付番号 ${number(order.display_number, archive)} ／ ${escapeHtml(order.display_number_date)}</h3>
        <p>状態：${escapeHtml(statusLabels[order.status] ?? order.status)} ／ 受付担当：${escapeHtml(order.created_by_name ?? "---")}</p>
        <p>受付：${date(order.created_at)} ／ 更新：${date(order.updated_at)}</p>
        ${order.cancellation_reason ? `<p>キャンセル理由：${escapeHtml(order.cancellation_reason)}</p>` : ""}
        ${data.fulfillments.map(task => `<div class="card compact-card"><h3>${escapeHtml(task.location_name)} — ${escapeHtml(statusLabels[task.status] ?? task.status)}</h3>
          <ul>${task.items.map(item => `<li>${escapeHtml(item.name)} × ${item.quantity}</li>`).join("")}</ul>
          <p class="muted">提供可能：${date(task.ready_at)} ／ 受渡：${date(task.handed_over_at)}</p></div>`).join("")}</div>
        <div class="card"><h3>この注文の操作履歴</h3>${eventsTable(data.events, archive)}${renderPagination(state.pagination)}</div>`;
    }
  }
  return `<div id="tab-archives" class="section active"><div class="subpage-heading"><a class="back-button" href="${data?.kind === "index" ? "/admin/settings" : archiveRoot}">← ${data?.kind === "index" ? "設定へ戻る" : "バックアップ一覧へ戻る"}</a><h2>注文履歴・バックアップ</h2></div>${content}</div>`;
}
