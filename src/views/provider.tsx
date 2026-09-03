import { config } from "../config";
import { pageDocument } from "./layout";
import type { ProviderTask } from "../contracts/view-models";
import { todayDate } from "../services/numbering";

export function providerPage(locationName: string, tasks: ProviderTask[], _securityNonce = ""): string {
return pageDocument({
    title: `${locationName} - 提供担当`,
    viewport: "width=device-width, initial-scale=1.0",
    stylesheet: "provider",
    script: "provider",
    bodyAttributes: { "data-current-date": todayDate(), "data-display-digits": String(config.displayNumberDigits) },
    content: `
<a class="skip-link" href="#main-content">本文へ移動</a>
<header class="topbar">
  <div class="topbar-inner">
    <div class="brand"><h1>提供担当</h1></div>
    <form method="POST" action="/logout"><button class="logout" type="submit">ログアウト</button></form>
  </div>
  </header>
  <main id="main-content" class="page-body">
    <div class="view-heading">
      <div><p class="location-label">担当場所</p><h2>${escapeHtml(locationName)}</h2></div>
      <div id="connection" class="connection" role="status">接続中</div>
    </div>
    <section aria-labelledby="task-heading">
      <h2 id="task-heading" class="section-title">提供状況</h2>
      <div id="task-list" aria-live="polite">${renderTasks(tasks)}</div>
    </section>
  </main>
    `,
  });
}

function renderTasks(tasks: ProviderTask[]): string {
  const lanes: { status: ProviderTask["status"]; label: string; empty: string }[] = [
    { status: "preparing", label: "準備中", empty: "準備中の注文はありません" },
    { status: "ready", label: "お渡し待ち", empty: "お渡し待ちの注文はありません" },
    { status: "handed_over", label: "提供済み", empty: "直近の提供済み注文はありません" },
  ];
  return `<div class="kanban-board">${lanes.map(lane => {
    const laneTasks = tasks.filter(task => task.status === lane.status);
    return `<section class="kanban-lane lane-${lane.status}" aria-labelledby="lane-${lane.status}-heading">
      <div class="lane-heading"><h3 id="lane-${lane.status}-heading">${lane.label}</h3><span class="lane-count">${laneTasks.length}件</span></div>
      <div class="lane-cards">${laneTasks.length ? laneTasks.map(renderTask).join("") : `<p class="lane-empty">${lane.empty}</p>`}</div>
    </section>`;
  }).join("")}</div>`;
}

function renderTask(task: ProviderTask): string {
  return `<article class="card ${task.status === "ready" ? "ready-card" : task.status === "handed_over" ? "completed-card" : ""}" data-status="${task.status}">
    <div class="task-head"><div><div class="number">${config.displayNumberPad(task.display_number)}</div>${task.display_number_date !== todayDate() ? `<div class="date-badge">${escapeHtml(task.display_number_date)}受付</div>` : ""}</div><div class="badge status-${task.status}">${task.status === "ready" ? "お渡し待ち" : task.status === "handed_over" ? "提供済み" : "準備中"}</div></div>
    <div class="items">${task.items.map(item => `<div class="item"><span>${escapeHtml(item.name)}</span><strong>×${item.quantity}</strong></div>`).join("")}</div>
    <div class="card-actions">${task.status === "preparing" ? `<button class="action ready" data-id="${escapeHtml(task.id)}" data-status="ready">提供可能にする</button>` : task.status === "ready" ? `<button class="action done" data-id="${escapeHtml(task.id)}" data-status="handed_over">受渡完了</button><button class="action undo" data-id="${escapeHtml(task.id)}" data-status="preparing">準備中に戻す</button>` : `<button class="action undo" data-id="${escapeHtml(task.id)}" data-status="ready">受渡完了を取り消す</button>`}</div>
  </article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
