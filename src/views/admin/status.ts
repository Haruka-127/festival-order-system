import type { AdminItemSales, AdminOrderSettings, AdminStatusSummary } from "./types";
import { escapeHtml } from "./helpers";

export function renderStatusSection(settings: AdminOrderSettings, summary: AdminStatusSummary, itemSales: AdminItemSales[]): string {
  return `<div id="tab-status" class="section active">
    <section class="overview" aria-label="現在の注文状況">
      <div class="overview-item"><span class="overview-label">注文受付</span><strong class="overview-value">${settings.ordering_enabled ? "受付中" : "停止中"}</strong></div>
      <div class="overview-item"><span class="overview-label">準備中</span><strong class="overview-value">${summary.preparing}<small>件</small></strong></div>
      <div class="overview-item"><span class="overview-label">お渡し待ち</span><strong class="overview-value">${summary.available}<small>件</small></strong></div>
    </section>

    <section class="card sales-card" aria-labelledby="sales-heading">
      <div class="section-tools sales-heading"><div><h2 id="sales-heading">販売実績</h2><p class="section-description">受渡完了した注文と商品の数量を集計しています</p></div></div>
      <div class="sales-summary">
        <div class="sales-metric"><span>本日の販売注文</span><strong>${summary.today_delivered_orders}<small>件</small></strong></div>
        <div class="sales-metric"><span>本日の販売数</span><strong>${summary.today_units}<small>点</small></strong></div>
        <div class="sales-metric"><span>累計販売注文</span><strong>${summary.total_delivered_orders}<small>件</small></strong></div>
        <div class="sales-metric"><span>累計販売数</span><strong>${summary.total_units}<small>点</small></strong></div>
      </div>
      <h3 class="sales-table-heading">商品別販売数</h3>
      <div class="table-wrap"><table class="sales-table">
        <thead><tr><th>商品</th><th>本日</th><th>累計</th></tr></thead>
        <tbody>${itemSales.map(item => `<tr><td class="item-name">${escapeHtml(item.name)}</td><td class="sales-quantity">${item.today_quantity}<small>点</small></td><td class="sales-quantity">${item.total_quantity}<small>点</small></td></tr>`).join("")}</tbody>
      </table>${itemSales.length ? "" : '<p class="empty-state">受渡完了した商品はまだありません</p>'}</div>
    </section>
  </div>`;
}
