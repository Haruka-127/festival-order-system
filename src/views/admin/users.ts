import { escapeHtml } from "./helpers";
import type { AdminLocation, AdminUser } from "./types";

export function renderUsersSection(users: AdminUser[], locations: AdminLocation[]): string {
  const activeLocations = locations.filter(location => location.active);
  return `<div id="tab-users" class="section active">
    <div class="card">
      <div class="section-tools"><h2>スタッフ</h2><button type="button" class="btn btn-success btn-sm" data-action="show-add-user" aria-controls="add-user-form" aria-expanded="false">＋ 新規スタッフ</button></div>
      <div id="add-user-form" class="add-panel" hidden>
        <h3>スタッフを追加</h3>
        <form method="POST" action="/api/admin/users" class="form-row">
          <div class="form-group"><input type="text" name="username" placeholder="ユーザー名" required></div>
          <div class="form-group"><input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="パスワード（10文字以上）" required></div>
          <div class="form-group"><select name="staff_type"><option value="cashier">注文受付担当</option><option value="provider">提供担当</option></select></div>
          <div class="form-group"><select name="fulfillment_location_id"><option value="">提供担当の場合に選択</option>${activeLocations.map(location => `<option value="${location.id}">${escapeHtml(location.name)}</option>`).join("")}</select></div>
          <div><button type="submit" class="btn btn-primary">追加</button></div>
        </form>
      </div>
      <div class="table-wrap"><table class="user-table">
        <thead><tr><th>ユーザー名</th><th>担当</th><th><span class="sr-only">操作</span></th></tr></thead>
        <tbody>${users.map(user => `<tr>
          <td>${escapeHtml(user.username)}</td>
          <td><span class="role-label">${user.role === "admin" ? "管理者" : user.staff_type === "provider" ? "提供担当" : "注文受付担当"}</span>${user.location_name ? `<span class="muted role-location">${escapeHtml(user.location_name)}</span>` : ""}</td>
          <td class="actions-cell">${user.role !== "admin" ? `<button type="button" class="btn btn-sm" data-open-dialog="user-editor-${escapeHtml(user.id)}">編集</button>
            <dialog id="user-editor-${escapeHtml(user.id)}" class="editor-dialog">
              <div class="dialog-head"><h3>${escapeHtml(user.username)}を編集</h3><button type="button" class="dialog-close" data-close-dialog aria-label="閉じる">×</button></div>
              <div class="editor-panel">
                <form method="POST" action="/api/admin/users/${encodeURIComponent(user.id)}/settings">
                  <label>担当</label><select name="staff_type"><option value="cashier" ${user.staff_type !== "provider" ? "selected" : ""}>注文受付担当</option><option value="provider" ${user.staff_type === "provider" ? "selected" : ""}>提供担当</option></select>
                  <label>提供場所</label><select name="fulfillment_location_id"><option value="">提供担当の場合に選択</option>${activeLocations.map(location => `<option value="${location.id}" ${user.fulfillment_location_id === location.id ? "selected" : ""}>${escapeHtml(location.name)}</option>`).join("")}</select>
                  <button type="submit" class="btn btn-sm btn-primary">設定を更新</button>
                </form>
                <form method="POST" action="/api/admin/users/${encodeURIComponent(user.id)}/password" data-confirm-password-change data-username="${escapeHtml(user.username)}">
                  <label>新しいパスワード</label><input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="128" required placeholder="10文字以上">
                  <p class="form-note">変更後、このスタッフはすべての端末で再ログインが必要です。</p>
                  <button type="submit" class="btn btn-sm">パスワードを変更</button>
                </form>
                <form method="POST" action="/api/admin/users/${encodeURIComponent(user.id)}/delete" data-confirm-delete-user><button type="submit" class="btn btn-sm btn-danger">スタッフを削除</button></form>
                <div class="dialog-footer"><button type="button" class="btn btn-sm" data-close-dialog>閉じる</button></div>
              </div>
            </dialog>` : '<span class="muted">編集不可</span>'}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}
