// Browser entry point extracted from the server-rendered page.
export {};
type FlashMessage = { message: string; kind: "success" | "error" };
type CleanupPreview = { count: number; retention_days: number; oldest?: string | null; newest?: string | null };

function filterOrders(filter: string): void {
      const activeStatuses = ['preparing', 'available'];
      const completedStatuses = ['delivered', 'cancelled'];
      let visibleCount = 0;
      document.querySelectorAll<HTMLTableRowElement>('[data-order-status]').forEach(row => {
        const status = row.dataset.orderStatus || '';
        const visible = filter === 'all' || (filter === 'active' && activeStatuses.includes(status)) || (filter === 'completed' && completedStatuses.includes(status));
        row.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      document.querySelectorAll<HTMLButtonElement>('[data-order-filter]').forEach(button => {
        const selected = button.dataset.orderFilter === filter;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const emptyState = document.querySelector<HTMLElement>('[data-order-empty]');
      if (emptyState) emptyState.hidden = visibleCount !== 0;
    }

    function toggleAddPanel(panelId: string, trigger: HTMLButtonElement): void {
      const panel = document.getElementById(panelId);
      if (!panel) return;

      const shouldOpen = panel.hidden;
      panel.hidden = !shouldOpen;
      trigger.setAttribute('aria-expanded', String(shouldOpen));

      if (shouldOpen) {
        panel.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
      }
    }

    function showToast(msg: string, kind: "success" | "error" = 'success'): void {
      const c = document.getElementById('toast-container');
      const t = document.createElement('div');
      t.className = 'toast' + (kind === 'error' ? ' toast-error' : '');
      t.textContent = msg;
      c?.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    function confirmDeleteItem(id: number, name: string): void {
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
              showToast((data as { error?: string }).error || 'リセットに失敗しました');
            }
          })
          .catch(() => showToast('エラーが発生しました'));
      }
    }

    async function confirmCleanup() {
      let preview: CleanupPreview;
      try {
        const response = await fetch('/api/admin/cleanup/preview');
        if (response.status === 401) { location.href = '/login'; return; }
        if (!response.ok) throw new Error('preview failed');
        preview = await response.json() as CleanupPreview;
      } catch { showToast('削除対象を確認できませんでした', 'error'); return; }
      if (!preview.count) { showToast('削除対象の注文はありません'); return; }
      if (confirm(preview.retention_days + '日より古い注文 ' + preview.count + '件を削除しますか？\\n対象期間: ' + (preview.oldest || '---') + ' ～ ' + (preview.newest || '---') + '\\n監査履歴は保持されますが、注文の詳細と顧客画面は削除されます。')) {
        fetch('/api/admin/cleanup', { method: 'POST' })
          .then(async r => {
            const data = await r.json().catch(() => ({}));
            if (r.ok) {
              showToast('古い注文を' + ((data as { deleted?: number }).deleted || 0) + '件削除しました');
              setTimeout(() => location.reload(), 1000);
            } else {
              showToast((data as { error?: string }).error || '削除に失敗しました');
            }
          })
          .catch(() => showToast('エラーが発生しました'));
      }
    }

    async function createBackup() {
      try {
        const response = await fetch('/api/admin/backup', { method: 'POST' });
        if (response.status === 401) { location.href = '/login'; return; }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { showToast((data as { error?: string }).error || 'バックアップに失敗しました', 'error'); return; }
        showToast('バックアップを作成しました: ' + (data as { filename: string }).filename);
      } catch { showToast('バックアップに失敗しました', 'error'); }
    }

    document.addEventListener('click', event => {
      if (event.target instanceof HTMLDialogElement && event.target.classList.contains('editor-dialog')) {
        event.target.close();
        return;
      }
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!button) return;
      if (button.dataset.orderFilter) filterOrders(button.dataset.orderFilter);
      else if (button.dataset.openDialog) (document.getElementById(button.dataset.openDialog) as HTMLDialogElement | null)?.showModal();
      else if (button.hasAttribute('data-close-dialog')) button.closest('dialog')?.close();
      else if (button.dataset.action === 'show-add-item') toggleAddPanel('add-item-form', button);
      else if (button.dataset.action === 'show-add-user') toggleAddPanel('add-user-form', button);
      else if (button.dataset.action === 'reset-numbers') confirmReset();
      else if (button.dataset.action === 'cleanup') confirmCleanup();
      else if (button.dataset.action === 'backup') createBackup();
      else if (button.dataset.deleteItemId) confirmDeleteItem(Number(button.dataset.deleteItemId), button.dataset.deleteItemName || '');
    });

    document.addEventListener('submit', event => {
      if (!(event.target instanceof HTMLFormElement)) return;
      if (event.target.matches('form[data-confirm-delete-user]') && !confirm('このスタッフを削除しますか？')) event.preventDefault();
      if (event.target.matches('form[data-confirm-password-change]')) {
        const username = event.target.dataset.username || 'このスタッフ';
        if (!confirm(username + ' のパスワードを変更しますか？\n変更後、すべての端末で再ログインが必要です。')) event.preventDefault();
      }
    });

    const flashMessages = JSON.parse(document.body.dataset.flashMessages || '[]') as FlashMessage[];
    flashMessages.forEach((flash, index) => {
      setTimeout(() => showToast(flash.message, flash.kind), index * 3200);
    });
    filterOrders('active');
