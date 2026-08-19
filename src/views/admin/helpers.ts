import type { AdminEvent, AdminPagination } from "./types";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderPagination(pagination?: AdminPagination): string {
  if (!pagination || pagination.totalPages <= 1) return "";
  return `<nav class="pagination" aria-label="ページ移動">
    ${pagination.previousHref ? `<a class="btn btn-sm" href="${escapeHtml(pagination.previousHref)}">← 前へ</a>` : '<span class="btn btn-sm is-disabled" aria-disabled="true">← 前へ</span>'}
    <span>${pagination.page} / ${pagination.totalPages}ページ</span>
    ${pagination.nextHref ? `<a class="btn btn-sm" href="${escapeHtml(pagination.nextHref)}">次へ →</a>` : '<span class="btn btn-sm is-disabled" aria-disabled="true">次へ →</span>'}
  </nav>`;
}

function statusName(status: string | null): string {
  if (!status) return "新規";
  return { preparing: "準備中", ready: "提供可能", handed_over: "受渡済", cancelled: "キャンセル" }[status] ?? status;
}

export function eventDescription(event: AdminEvent): string {
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
  if (event.event_type === "admin_action") {
    try {
      const details = event.details ? JSON.parse(event.details) as Record<string, unknown> : {};
      const action = typeof details.action === "string" ? details.action : "";
      const labels: Record<string, string> = {
        item_created: "商品を追加", item_renamed: "商品名を変更", item_sort_changed: "商品の表示順を変更",
        item_availability_changed: "商品の販売状態を変更", item_sold_out_changed: "商品の売り切れ状態を変更",
        item_disabled: "商品を販売停止", item_deleted: "商品を削除", item_settings_changed: "商品設定を変更",
        staff_created: "スタッフを追加", staff_deleted: "スタッフを削除", staff_settings_changed: "スタッフ設定を変更",
        staff_password_changed: "スタッフのパスワードを変更", admin_password_changed: "管理者パスワードを変更",
        location_created: "提供場所を追加", location_settings_changed: "提供場所設定を変更",
        location_availability_changed: "提供場所の稼働状態を変更", order_settings_changed: "注文設定を変更",
        display_numbers_reset: "受付番号をリセット", backup_created: "バックアップを作成",
      };
      return labels[action] ?? "管理設定を変更";
    } catch { return "管理設定を変更"; }
  }
  return `${statusName(event.from_status)} → ${statusName(event.to_status)}`;
}
