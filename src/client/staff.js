// Browser behavior for the staff screen. Kept framework-free for kiosk compatibility.
let savedDraft = null;
    try { savedDraft = JSON.parse(sessionStorage.getItem('staff-order-draft') || 'null'); } catch {}
    const cart = new Map(Array.isArray(savedDraft?.items) ? savedDraft.items : []);
    let submitting = false;
    let pendingRequestId = savedDraft?.requestId || null;
    let pendingPayloadSignature = savedDraft?.signature || '';
    const currentDate = document.body.dataset.currentDate || '';

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function addToCart(id) {
      if (submitting) return;
      const current = cart.get(id) || 0;
      cart.set(id, current + 1);
      invalidatePendingRequest();
      updateCart();
    }

    function changeQty(id, delta) {
      const current = cart.get(id) || 0;
      const next = current + delta;
      if (next <= 0) {
        cart.delete(id);
      } else {
        cart.set(id, next);
      }
      invalidatePendingRequest();
      updateCart();
    }

    function invalidatePendingRequest() {
      pendingRequestId = null;
      pendingPayloadSignature = '';
      saveDraft();
    }

    function saveDraft() {
      if (cart.size === 0 && !pendingRequestId) { sessionStorage.removeItem('staff-order-draft'); return; }
      sessionStorage.setItem('staff-order-draft', JSON.stringify({ items: [...cart.entries()], requestId: pendingRequestId, signature: pendingPayloadSignature }));
    }

    function updateCart() {
      const container = document.getElementById('cart-items');
      const total = document.getElementById('cart-total');
      const submitBtn = document.getElementById('submit-order');
      const entries = Array.from(cart.entries());

      // Update badges on menu buttons
      document.querySelectorAll('.menu-btn').forEach(b => {
        const id = b.dataset.id;
        const qty = cart.get(Number(id)) || 0;
        const badge = document.getElementById('badge-' + id);
        b.classList.toggle('selected', qty > 0);
        if (qty > 0) {
          if (badge) { badge.textContent = qty; badge.style.display = 'flex'; }
        } else {
          if (badge) { badge.style.display = 'none'; }
        }
      });

      if (entries.length === 0) {
        container.innerHTML = '<div class="empty-orders">商品を選択してください</div>';
        total.style.display = 'none';
        submitBtn.style.display = 'none';
        return;
      }

      let html = '';
      let count = 0;
      for (const [id, qty] of entries) {
        const name = document.querySelector('.menu-btn[data-id="'+id+'"]')?.dataset.name || '商品';
        count += qty;
        html += '<div class="cart-item">';
        html += '<span>' + escapeHtml(name) + '</span>';
        html += '<div class="cart-qty"><button data-change-item-id="'+id+'" data-delta="-1">−</button><span>' + qty + '</span><button data-change-item-id="'+id+'" data-delta="1">+</button></div>';
        html += '</div>';
      }
      container.innerHTML = html;
      total.style.display = 'flex';
      document.getElementById('cart-count').textContent = count + '点';
      submitBtn.style.display = 'block';
    }

    async function submitOrder() {
      if (submitting) return;
      const entries = Array.from(cart.entries());
      if (entries.length === 0) return;

      submitting = true;
      const btn = document.getElementById('submit-order');
      btn.disabled = true;
      btn.textContent = '送信中...';

      try {
        const items = entries.map(([id, qty]) => ({ item_id: id, quantity: qty }));
        const signature = JSON.stringify(items);
        if (!pendingRequestId || pendingPayloadSignature !== signature) {
          pendingRequestId = crypto.randomUUID();
          pendingPayloadSignature = signature;
          saveDraft();
        }
        const res = await fetch('/api/staff/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, client_request_id: pendingRequestId }),
        });

        if (res.status === 401) { location.href = '/login'; return; }

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'エラーが発生しました' }));
          showToast(err.error || 'エラーが発生しました');
          return;
        }

        const data = await res.json();
        cart.clear();
        invalidatePendingRequest();
        updateCart();

        // Show result modal
        let modalBody = '<div class="text-lg font-bold">注文を受け付けました</div>';
        modalBody += '<div class="big-num">' + padNum(data.display_number) + '</div>';
        modalBody += '<div style="font-size:14px;color:#6b7280;margin-bottom:8px">受付番号</div>';

        modalBody += '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">受付番号をお客様へお伝えください</div>';
        modalBody += '<button class="btn btn-primary" data-action="close-modal" style="min-width:120px">閉じる</button>';

        document.getElementById('modal-body').innerHTML = modalBody;
        document.getElementById('modal').style.display = 'flex';

        // Refresh order list
        refreshOrders();
      } catch (e) {
        showToast('通信エラーが発生しました');
      } finally {
        submitting = false;
        btn.disabled = false;
        btn.textContent = '注文を確定する';
      }
    }

    function padNum(n) {
      return String(n).padStart(Number(document.body.dataset.displayDigits || '3'), '0');
    }

    function closeModal(e) {
      if (e && e.target !== document.getElementById('modal')) return;
      document.getElementById('modal').style.display = 'none';
    }

    document.addEventListener('keydown', function(e) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const modal = document.getElementById('modal');
      if (modal.style.display === 'flex') {
        if (e.key === 'Enter') { closeModal(); }
        return;
      }
      if (e.key === 'Enter') {
        if (cart.size > 0 && !submitting) submitOrder();
        return;
      }
      const key = parseInt(e.key);
      if (!isNaN(key)) {
        const target = document.querySelector('.menu-btn[data-key="' + key + '"]:not(.sold-out)');
        if (target) addToCart(Number(target.dataset.id));
      }
    });

    function showToast(msg) {
      const c = document.getElementById('toast-container');
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      c.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    let currentFilter = 'all';
    function filterOrders(filter) {
      currentFilter = filter;
      document.querySelectorAll('#order-tabs .tab').forEach(t => {
        const active = t.dataset.filter === filter;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
      });
      applyOrderFilter();
    }

    function applyOrderFilter() {
      const cards = document.querySelectorAll('.order-card');
      cards.forEach(c => {
        if (currentFilter === 'all') { c.style.display = ''; return; }
        c.style.display = c.dataset.status === currentFilter ? '' : 'none';
      });
    }

    function filterItems(q) {
      document.querySelectorAll('.menu-btn').forEach(b => {
        const name = (b.dataset.name || '').toLowerCase();
        b.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
      });
    }

    async function updateOrderStatus(orderId, status) {
      if (status !== 'cancelled') return;
      if (!confirm('この注文全体をキャンセルしますか？')) return;
      const reason = prompt('キャンセル理由を入力してください（200文字以内）', 'お客様都合');
      if (reason === null) return;
      if (!reason.trim() || reason.trim().length > 200) { showToast('キャンセル理由を200文字以内で入力してください'); return; }
      const buttons = document.querySelectorAll('button[data-order-id="' + CSS.escape(orderId) + '"]');
      buttons.forEach(button => button.disabled = true);
      try {
        const res = await fetch('/api/staff/orders/' + orderId + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, reason: reason.trim() }),
        });
        if (res.status === 401) { location.href = '/login'; return; }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'エラー' }));
          showToast(err.error || '操作に失敗しました');
          return;
        }
        refreshOrders();
      } catch (e) {
        showToast('通信エラーが発生しました');
      } finally {
        buttons.forEach(button => button.disabled = false);
      }
    }

    async function refreshOrders() {
      try {
        const res = await fetch('/api/staff/orders');
        if (res.status === 401) { location.href = '/login'; return; }
        if (!res.ok) return;
        const data = await res.json();
        const container = document.getElementById('order-list');
        if (data.length === 0) {
          container.innerHTML = '<div class="empty-orders">現在、注文はありません</div>';
          return;
        }
        container.innerHTML = data.map(o => {
          const orderId = escapeHtml(String(o.id));
          const previousDate = o.display_number_date && o.display_number_date !== currentDate ? '<span class="panel-note">' + escapeHtml(o.display_number_date) + '受付</span>' : '';
          const displayFulfillments = o.fulfillments || [{ id: o.id, location_name: '既定提供場所', status: o.status === 'available' ? 'ready' : o.status, items: o.items || [] }];
          const fulfillmentHtml = displayFulfillments.map(f => {
            const label = f.status === 'preparing' ? '準備中' : f.status === 'ready' ? '提供可能' : f.status === 'handed_over' ? '受渡済' : 'キャンセル';
            return '<div class="fulfillment-line"><strong>' + escapeHtml(f.location_name) + '</strong> <span style="color:#6b7280">' + label + '</span><br>' + f.items.map(i => escapeHtml(i.name) + ' x' + i.quantity).join(', ') + '</div>';
          }).join('');
          const statusClass = o.status === 'preparing' ? 'status-preparing' : o.status === 'available' ? 'status-available' : o.status === 'delivered' ? 'status-delivered' : 'status-cancelled';
          const hasReady = displayFulfillments.some(f => f.status === 'ready' || f.status === 'handed_over');
          const statusLabel = o.status === 'available' ? '全ブース提供可能' : hasReady ? '一部提供可能' : '準備中';
          const actions = '<button class="btn-cancel" data-order-id="' + orderId + '" data-order-status="cancelled">注文をキャンセル</button>';
          return '<div class="order-card' + (o.status === 'available' ? ' available' : '') + '" data-status="' + o.status + '">' +
            '<div class="order-header">' +
            '<span class="order-num">' + padNum(o.display_number) + '</span>' + previousDate +
            '<span class="badge ' + statusClass + '">' + statusLabel + '</span>' +
            '</div>' +
            '<div class="order-items">' + fulfillmentHtml + '</div>' +
            '<div class="order-actions">' + actions + '</div>' +
            '</div>';
        }).join('');
        document.getElementById('last-updated').textContent = '最終更新 ' + new Date().toLocaleTimeString('ja-JP');
        applyOrderFilter();
      } catch (e) {
        // silent
      }
    }

    async function refreshItems() {
      try {
        const res = await fetch('/api/staff/items');
        if (res.status === 401) { location.href = '/login'; return; }
        if (!res.ok) return;
        const items = await res.json();
        const orderableIds = new Set(items.filter(item => !item.sold_out).map(item => item.id));
        let removed = false;
        for (const id of [...cart.keys()]) {
          if (!orderableIds.has(id)) { cart.delete(id); removed = true; }
        }
        if (removed) { invalidatePendingRequest(); showToast('販売状態が変わった商品をカートから外しました'); }
        const grid = document.getElementById('menu-grid');
        grid.innerHTML = items.map((item, index) => {
          const key = index < 9 ? index + 1 : 0;
          return '<button class="menu-btn ' + (item.sold_out ? 'sold-out' : '') + '" data-id="' + item.id + '" data-name="' + escapeHtml(item.name) + '" data-key="' + key + '" data-add-item-id="' + item.id + '" ' + (item.sold_out ? 'disabled' : '') + '>' +
            '<span class="key-hint">' + key + '</span>' + escapeHtml(item.name) +
            '<span class="item-location">' + escapeHtml(item.location_name || '既定提供場所') + '</span>' +
            (item.sold_out ? '<span class="soldout-label">売り切れ</span>' : '') +
            '<span class="cart-badge" id="badge-' + item.id + '" style="display:none">0</span></button>';
        }).join('');
        updateCart();
        filterItems(document.getElementById('item-search').value);
      } catch { document.getElementById('last-updated').textContent = '通信を再確認中'; }
    }

    // Poll for order updates
    setInterval(refreshOrders, 5000);
    setInterval(refreshItems, 5000);

    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.dataset.addItemId) addToCart(Number(button.dataset.addItemId));
      else if (button?.dataset.changeItemId) changeQty(Number(button.dataset.changeItemId), Number(button.dataset.delta));
      else if (button?.dataset.orderId && button.dataset.orderStatus) updateOrderStatus(button.dataset.orderId, button.dataset.orderStatus);
      else if (button?.dataset.filter) filterOrders(button.dataset.filter);
      else if (button?.dataset.action === 'submit-order') submitOrder();
      else if (button?.dataset.action === 'close-modal') closeModal();
      else if (event.target === document.getElementById('modal')) closeModal();
    });

    document.getElementById('item-search').addEventListener('input', event => filterItems(event.target.value));
    updateCart();
