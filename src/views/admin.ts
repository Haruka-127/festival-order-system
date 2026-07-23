import { config } from "../config";
import type { FlashMessage } from "../services/flash";

type Item = { id: number; name: string; active: number; sold_out: number; sort_order: number; fulfillment_location_id?: number; location_name?: string; max_quantity_per_order?: number | null; daily_limit?: number | null };
type OrderSummary = { id: string; display_number: number; status: string; created_at: string; items: string; token: string };
type UserSummary = { id: string; username: string; role: string; staff_type?: string; fulfillment_location_id?: number | null; location_name?: string | null; created_at: string };
type LocationSummary = { id: number; name: string; slug: string; active: number; sort_order: number; max_preparing_orders: number | null; max_preparing_units: number | null };
type OrderSettings = { ordering_enabled: number; order_open_time: string | null; order_close_time: string | null; daily_order_limit: number | null; max_items_per_order: number; max_total_quantity: number };
type EventSummary = { display_number: number; location_name: string; from_status: string | null; to_status: string; username: string | null; created_at: string };

export function adminPage(
  items: Item[],
  orders: OrderSummary[],
  users: UserSummary[],
  currentNum: { number: number; date: string } | null,
  securityNonce = "",
  locations: LocationSummary[] = [{ id: 1, name: "既定提供場所", slug: "default", active: 1, sort_order: 0, max_preparing_orders: null, max_preparing_units: null }],
  settings: OrderSettings = { ordering_enabled: 1, order_open_time: null, order_close_time: null, daily_order_limit: null, max_items_per_order: 50, max_total_quantity: 500 },
  events: EventSummary[] = [],
  flashMessages: FlashMessage[] = [],
): string {
  const statusLabels: Record<string, string> = { preparing: "準備中", available: "提供可能", delivered: "受渡済", cancelled: "キャンセル" };
  const statusColors: Record<string, string> = { preparing: "badge-blue", available: "badge-green", delivered: "badge-gray", cancelled: "badge-red" };
  const serializedFlashMessages = JSON.stringify(flashMessages).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理画面 - 文化祭飲食システム</title>
  <style>
    :root{--green:#166534;--green-dark:#14532d;--green-soft:#f0fdf4;--ink:#111827;--muted:#6b7280;--line:#d1d5db;--panel:#fff;--canvas:#f3f4f6;--danger:#b91c1c}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{background:var(--canvas)}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;background:var(--canvas);color:var(--ink);line-height:1.5}
    a{color:var(--green);font-weight:700;text-underline-offset:3px}
    button{cursor:pointer;font:inherit}
    input,select,textarea{font:inherit}
    .app{max-width:1500px;margin:0 auto;padding:0 24px 40px}
    .header{display:flex;justify-content:space-between;align-items:center;min-height:76px;margin:0 -24px;padding:14px 28px;background:var(--green);color:#fff;border-bottom:5px solid var(--green-dark);gap:20px}
    .header-title h1{font-size:24px;line-height:1.2}
    .header-subtitle{margin-top:2px;font-size:12px;opacity:.8}
    .header .btn{min-height:38px;border-color:#fff}
    .header .btn-primary{background:#fff;color:var(--green)}
    .header .btn-secondary{background:transparent;color:#fff}
    .overview{display:grid;grid-template-columns:repeat(4,1fr);margin:16px 0;background:var(--panel);border:1px solid var(--line)}
    .overview-item{min-height:62px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-left:1px solid var(--line)}
    .overview-item:first-child{border-left:0;background:var(--panel)}
    .overview-label{font-size:12px;font-weight:700;color:var(--muted)}
    .overview-value{font-size:21px;font-weight:850;line-height:1;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
    .overview-value small{font-size:12px;font-weight:700;color:var(--muted)}
    .workspace{display:grid;grid-template-columns:210px minmax(0,1fr);gap:18px;align-items:start}
    .content-area{min-width:0}
    .tabs{position:sticky;top:16px;display:flex;flex-direction:column;background:#fff;border:1px solid var(--line)}
    .tab{min-height:48px;padding:11px 14px;border:0;border-bottom:1px solid #e5e7eb;border-left:4px solid transparent;border-radius:0;text-align:left;font-size:14px;font-weight:750;background:#fff;color:#4b5563;transition:background-color .15s,color .15s}
    .tab:last-child{border-bottom:0}
    .tab.active{background:var(--green-soft);border-left-color:var(--green);color:var(--green)}
    .tab:hover:not(.active){background:#f9fafb;color:var(--ink)}
    .tab:focus-visible,.btn:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #facc15;outline-offset:2px}
    .section{display:none}
    .section.active{display:block}
    .card{background:var(--panel);border-radius:0;padding:22px;border:1px solid var(--line);box-shadow:none;margin-bottom:16px;overflow-x:auto}
    .card h2{font-size:20px;margin-bottom:16px;line-height:1.2}
    .section-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    .section-tools h2{margin:0}
    table{width:100%;border-collapse:collapse}
    th,td{padding:13px 14px;text-align:left;border-bottom:1px solid #e5e7eb;font-size:14px;vertical-align:middle}
    th{background:#e5e7eb;font-size:12px;font-weight:850;color:#374151;letter-spacing:.05em;white-space:nowrap}
    tbody tr:last-child td{border-bottom:0}
    tr:hover{background:#f9fafb}
    .form-group{margin-bottom:14px}
    .form-group label{display:block;font-size:13px;font-weight:800;color:#4b5563;margin-bottom:5px}
    .form-group input,.form-group select,td input,td select,.editor-panel input,.editor-panel select{width:100%;min-height:40px;padding:8px 10px;border:1px solid #9ca3af;border-radius:2px;font-size:14px;background:#fff;color:var(--ink)}
    .form-group input:focus,.form-group select:focus,td input:focus,td select:focus,.editor-panel input:focus,.editor-panel select:focus{border-color:var(--green)}
    .form-row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}
    .form-row .form-group{flex:1;min-width:150px}
    .inline-form{display:inline}
    .muted{font-size:12px;color:var(--muted)}
    .item-name{font-size:15px;font-weight:800}
    .row-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    details.editor{min-width:260px}
    details.editor>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:5px 10px;border:1px solid #9ca3af;border-radius:2px;background:#fff;font-size:12px;font-weight:800}
    details.editor>summary::-webkit-details-marker{display:none}
    details.editor[open]>summary{background:var(--green-soft);border-color:var(--green);color:var(--green)}
    .editor-panel{display:grid;gap:10px;min-width:280px;margin-top:10px;padding:14px;background:#f9fafb;border:1px solid var(--line)}
    .editor-panel form{display:grid;gap:8px}
    .editor-panel .form-row{gap:8px}
    .editor-panel .form-group{margin-bottom:0}
    .editor-panel label{font-size:12px}
    .editor-dialog{width:min(520px,calc(100vw - 32px));max-height:min(82vh,720px);margin:auto;padding:0;border:0;border-top:7px solid var(--green);background:#fff;color:var(--ink);overflow:auto}
    .editor-dialog::backdrop{background:rgba(17,24,39,.55)}
    .dialog-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;background:#fff;border-bottom:1px solid var(--line)}
    .dialog-head h3{font-size:18px}
    .dialog-close{width:38px;height:38px;padding:0;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:22px;line-height:1}
    .editor-dialog .editor-panel{min-width:0;margin:0;padding:18px;border:0;background:#fff}
    .dialog-footer{display:flex;justify-content:flex-end;padding-top:4px}
    .location-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .location-card-head h2{margin:0}
    .add-panel{background:#f9fafb;border:1px solid var(--line);padding:16px;margin-bottom:14px}
    .add-panel[hidden]{display:none}
    .badge{display:inline-block;padding:4px 9px;border-radius:2px;font-size:12px;font-weight:800;line-height:1.3}
    .badge-blue{background:#e5e7eb;color:#111827}
    .badge-green{background:#dcfce7;color:var(--green)}
    .badge-gray{background:#e5e7eb;color:#4b5563}
    .badge-red{background:#fecaca;color:#991b1b}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:38px;padding:8px 16px;border:1px solid #9ca3af;border-radius:2px;background:#fff;color:var(--ink);font-size:13px;font-weight:800;transition:background-color .15s,color .15s,border-color .15s}
    .btn:hover{background:#f9fafb}
    .btn:active{transform:translateY(1px)}
    .btn-primary,.btn-success{background:var(--green);border-color:var(--green);color:#fff}
    .btn-primary:hover,.btn-success:hover{background:var(--green-dark)}
    .btn-warning{background:#fff;color:var(--ink)}
    .btn-danger{background:#fff;border-color:#dc2626;color:var(--danger)}
    .btn-danger:hover{background:#fef2f2}
    .btn-secondary{background:#fff;color:#374151}
    .btn-sm{min-height:34px;padding:5px 10px;font-size:12px}
    .flex{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .mt-2{margin-top:8px}
    .mb-2{margin-bottom:8px}
    .text-center{text-align:center}
    .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--green-dark);color:#fff;padding:13px 24px;border-radius:2px;z-index:9999;animation:fadeIn .25s}
    .toast.toast-error{background:var(--danger)}
    @keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    .confirm-dialog{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center}
    .confirm-content{background:#fff;border-radius:0;padding:24px;max-width:400px;width:90%;text-align:center;border-top:8px solid var(--green)}
    .confirm-content p{margin-bottom:16px;font-size:15px}
    @media(max-width:900px){.overview{grid-template-columns:1fr 1fr}.overview-item:nth-child(3){border-left:0;border-top:1px solid var(--line)}.overview-item:nth-child(4){border-top:1px solid var(--line)}.workspace{display:block}.tabs{position:static;display:flex;flex-direction:row;overflow-x:auto;margin-bottom:14px}.tab{min-width:130px;border-left:0;border-bottom:4px solid transparent;border-right:1px solid var(--line);text-align:center}.tab.active{border-left:0;border-bottom-color:var(--green)}}
    @media(max-width:640px){.app{padding:0 12px 28px}.header{margin:0 -12px;padding:12px 14px;align-items:flex-start}.header-title h1{font-size:20px}.header-subtitle{display:none}.header .flex{justify-content:flex-end}.overview{grid-template-columns:1fr 1fr;margin:12px 0}.overview-item{min-height:58px;padding:8px 10px;display:block}.overview-label{display:block}.overview-value{display:block;margin-top:4px;font-size:19px}.card{padding:14px;margin-bottom:12px}.card h2{font-size:18px}.section-tools{align-items:flex-start}table{min-width:680px}.editor-panel{min-width:250px}.location-card-head{align-items:flex-start}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
  </style>
</head>
<body>
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
                          <label>提供場所</label><select name="fulfillment_location_id" required>${locations.map(location => `<option value="${location.id}" ${item.fulfillment_location_id === location.id ? "selected" : ""}>${escapeHtml(location.name)}</option>`).join("")}</select>
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
          <thead><tr><th>受付番号</th><th>商品</th><th>状態</th><th>日時</th><th>QR</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td style="font-weight:700">${config.displayNumberPad(o.display_number)}</td>
                <td style="font-size:13px">${escapeHtml(o.items)}</td>
                <td><span class="badge ${statusColors[o.status] || "badge-gray"}">${escapeHtml(statusLabels[o.status] || o.status)}</span></td>
                <td style="font-size:12px;color:#6b7280">${new Date(o.created_at).toLocaleString("ja-JP")}</td>
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
            <div class="form-group"><input type="password" name="password" placeholder="パスワード" required></div>
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
                <td style="font-size:12px;color:#6b7280">${new Date(u.created_at).toLocaleString("ja-JP")}</td>
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
        <h2>提供状態の操作履歴</h2>
        <table>
          <thead><tr><th>日時</th><th>受付番号</th><th>提供場所</th><th>変更</th><th>担当者</th></tr></thead>
          <tbody>${events.map(event => `<tr>
            <td style="font-size:12px">${new Date(event.created_at).toLocaleString("ja-JP")}</td>
            <td style="font-weight:700">${config.displayNumberPad(event.display_number)}</td>
            <td>${escapeHtml(event.location_name)}</td>
            <td>${escapeHtml(statusName(event.from_status))} → ${escapeHtml(statusName(event.to_status))}</td>
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
          </div>
          <button type="submit" class="btn btn-primary">注文設定を更新</button>
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
        <button type="button" class="btn btn-danger" data-action="cleanup">古い注文を削除</button>
        <span style="font-size:12px;color:#6b7280;margin-left:8px">受け渡し済み・キャンセルの注文データを削除します</span>
      </div>
    </div>
      </main>
    </div>
  </div>

  <div id="toast-container"></div>
  <div id="confirm-modal" style="display:none"></div>

  <script nonce="${securityNonce}">
    function showTab(name) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      document.getElementById('tab-' + name).classList.add('active');
      const activeTab = document.querySelector('.tab[data-tab="' + name + '"]');
      activeTab.classList.add('active');
      activeTab.setAttribute('aria-selected', 'true');
    }

    function toggleAddPanel(panelId, trigger) {
      const panel = document.getElementById(panelId);
      if (!panel) return;

      const shouldOpen = panel.hidden;
      panel.hidden = !shouldOpen;
      trigger.setAttribute('aria-expanded', String(shouldOpen));

      if (shouldOpen) {
        panel.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
      }
    }

    function showToast(msg, kind = 'success') {
      const c = document.getElementById('toast-container');
      const t = document.createElement('div');
      t.className = 'toast' + (kind === 'error' ? ' toast-error' : '');
      t.textContent = msg;
      c.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    function confirmDeleteItem(id, name) {
      if (confirm('「' + name + '」を削除しますか？\\n過去の注文データには影響しません。')) {
        fetch('/api/admin/items/' + id + '/delete', { method: 'POST' })
          .then(r => { if (r.ok) location.reload(); else showToast('削除に失敗しました'); })
          .catch(() => showToast('エラーが発生しました'));
      }
    }

    function confirmReset() {
      if (confirm('受付番号をリセットしますか？\\n現在の注文データは保持されますが、新しい注文は1から採番されます。')) {
        fetch('/api/admin/reset-numbers', { method: 'POST' })
          .then(async r => {
            const data = await r.json().catch(() => ({}));
            if (r.ok) {
              showToast('番号をリセットしました');
              setTimeout(() => location.reload(), 1000);
            } else {
              showToast(data.error || 'リセットに失敗しました');
            }
          })
          .catch(() => showToast('エラーが発生しました'));
      }
    }

    function confirmCleanup() {
      if (confirm('受け渡し済みおよびキャンセルの注文を削除しますか？\\nこの操作は元に戻せません。')) {
        fetch('/api/admin/cleanup', { method: 'POST' })
          .then(async r => {
            const data = await r.json().catch(() => ({}));
            if (r.ok) {
              showToast('古い注文を' + (data.deleted || 0) + '件削除しました');
              setTimeout(() => location.reload(), 1000);
            } else {
              showToast(data.error || '削除に失敗しました');
            }
          })
          .catch(() => showToast('エラーが発生しました'));
      }
    }

    document.addEventListener('click', event => {
      if (event.target instanceof HTMLDialogElement && event.target.classList.contains('editor-dialog')) {
        event.target.close();
        return;
      }
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.tab) showTab(button.dataset.tab);
      else if (button.dataset.openDialog) document.getElementById(button.dataset.openDialog)?.showModal();
      else if (button.hasAttribute('data-close-dialog')) button.closest('dialog')?.close();
      else if (button.dataset.action === 'show-add-item') toggleAddPanel('add-item-form', button);
      else if (button.dataset.action === 'show-add-user') toggleAddPanel('add-user-form', button);
      else if (button.dataset.action === 'reset-numbers') confirmReset();
      else if (button.dataset.action === 'cleanup') confirmCleanup();
      else if (button.dataset.deleteItemId) confirmDeleteItem(Number(button.dataset.deleteItemId), button.dataset.deleteItemName || '');
    });

    document.addEventListener('submit', event => {
      if (event.target.matches('form[data-confirm-delete-user]') && !confirm('このスタッフを削除しますか？')) event.preventDefault();
    });

    const flashMessages = ${serializedFlashMessages};
    const targetFlash = [...flashMessages].reverse().find(flash => flash.targetTab);
    if (targetFlash) showTab(targetFlash.targetTab);
    flashMessages.forEach((flash, index) => {
      setTimeout(() => showToast(flash.message, flash.kind), index * 3200);
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function statusName(status: string | null): string {
  if (!status) return "新規";
  return { preparing: "準備中", ready: "提供可能", handed_over: "受渡済", cancelled: "キャンセル" }[status] ?? status;
}
