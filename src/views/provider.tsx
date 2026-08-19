import { config } from "../config";
import { pageDocument } from "./layout";
import type { ProviderTask } from "../contracts/view-models";
import { todayDate } from "../services/numbering";

export function providerPage(locationName: string, tasks: ProviderTask[], _securityNonce = ""): string {
return pageDocument({
    title: `${locationName} - 提供担当`,
    viewport: "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no",
    stylesheet: "provider",
    script: "provider",
    bodyAttributes: { "data-current-date": todayDate(), "data-display-digits": String(config.displayNumberDigits) },
    content: `
<header>
    <div><h1>${escapeHtml(locationName)}</h1><div class="subtitle">提供担当画面</div><div id="connection" class="connection">接続中</div></div>
    <div class="actions"><a class="logout" href="/account/password" style="text-decoration:none">パスワード変更</a><form method="POST" action="/logout"><button class="logout" type="submit">ログアウト</button></form></div>
  </header>
  <main><div id="task-list">${renderTasks(tasks)}</div></main>
    `,
  });
}

function renderTasks(tasks: ProviderTask[]): string {
  if (tasks.length === 0) return '<div class="empty">現在、準備中の商品はありません</div>';
  return `<div class="grid">${tasks.map(task => `<article class="card ${task.status === "ready" ? "ready-card" : task.status === "handed_over" ? "completed-card" : ""}">
    <div style="display:flex;justify-content:space-between;align-items:start"><div><div class="number">${config.displayNumberPad(task.display_number)}</div>${task.display_number_date !== todayDate() ? `<div class="badge">${escapeHtml(task.display_number_date)}受付</div>` : ""}</div><div class="badge">${task.status === "ready" ? "お呼び出し中" : task.status === "handed_over" ? "受渡済み（2分間取消可）" : "準備中"}</div></div>
    <div class="items">${task.items.map(item => `<div class="item"><span>${escapeHtml(item.name)}</span><strong>×${item.quantity}</strong></div>`).join("")}</div>
    <div class="card-actions">${task.status === "preparing" ? `<button class="action ready" data-id="${escapeHtml(task.id)}" data-status="ready">提供可能にする</button>` : task.status === "ready" ? `<button class="action done" data-id="${escapeHtml(task.id)}" data-status="handed_over">受渡完了</button><button class="action undo" data-id="${escapeHtml(task.id)}" data-status="preparing">準備中に戻す</button>` : `<button class="action undo" data-id="${escapeHtml(task.id)}" data-status="ready">受渡完了を取り消す</button>`}</div>
  </article>`).join("")}</div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
