// Browser behavior for the staff screen. Kept framework-free for kiosk compatibility.
let savedDraft = null;
    try { savedDraft = JSON.parse(sessionStorage.getItem('staff-order-draft') || 'null'); } catch {}
    const cart = new Map(Array.isArray(savedDraft?.items) ? savedDraft.items : []);
    let submitting = false;
    let pendingRequestId = savedDraft?.requestId || null;
    let pendingPayloadSignature = savedDraft?.signature || '';
    const currentDate = document.body.dataset.currentDate || '';

    function createElement(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = String(text);
      return element;
    }

    function showEmpty(container, message) {
      container.replaceChildren(createElement('div', 'empty-orders', message));
    }

    function fulfillmentLine(fulfillment) {
      const line = createElement('div', 'fulfillment-line');
      line.append(createElement('strong', '', fulfillment.location_name));
      const status = fulfillment.status === 'preparing' ? '準備中' : fulfillment.status === 'ready' ? '提供可能' : fulfillment.status === 'handed_over' ? '受渡済' : 'キャンセル';
      line.append(' ', createElement('span', 'fulfillment-status', status), document.createElement('br'));
      line.append(fulfillment.items.map(item => item.name + ' x' + item.quantity).join(', '));
      return line;
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
          if (badge) { badge.textContent = qty; badge.hidden = false; }
        } else {
          if (badge) { badge.hidden = true; }
        }
      });

      if (entries.length === 0) {
        showEmpty(container, '商品を選択してください');
        total.hidden = true;
        submitBtn.hidden = true;
        return;
      }

      let count = 0;
      const rows = [];
      for (const [id, qty] of entries) {
        const name = document.querySelector('.menu-btn[data-id="'+id+'"]')?.dataset.name || '商品';
        count += qty;
        const row = createElement('div', 'cart-item');
        const quantity = createElement('div', 'cart-qty');
        const decrease = createElement('button', '', '−');
        decrease.dataset.changeItemId = String(id);
        decrease.dataset.delta = '-1';
        const increase = createElement('button', '', '+');
        increase.dataset.changeItemId = String(id);
        increase.dataset.delta = '1';
        quantity.append(decrease, createElement('span', '', qty), increase);
        row.append(createElement('span', '', name), quantity);
        rows.push(row);
      }
      container.replaceChildren(...rows);
      total.hidden = false;
      document.getElementById('cart-count').textContent = count + '点';
      submitBtn.hidden = false;
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
        const closeButton = createElement('button', 'btn btn-primary modal-close-button', '閉じる');
        closeButton.dataset.action = 'close-modal';
        document.getElementById('modal-body').replaceChildren(
          createElement('div', 'text-lg font-bold', '注文を受け付けました'),
          createElement('div', 'big-num', padNum(data.display_number)),
          createElement('div', 'modal-label', '受付番号'),
          createElement('div', 'modal-help', '受付番号をお客様へお伝えください'),
          closeButton,
        );
        document.getElementById('modal').hidden = false;

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
      document.getElementById('modal').hidden = true;
    }

    document.addEventListener('keydown', function(e) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const modal = document.getElementById('modal');
      if (!modal.hidden) {
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
        if (currentFilter === 'all') { c.hidden = false; return; }
        c.hidden = c.dataset.status !== currentFilter;
      });
    }

    function filterItems(q) {
      document.querySelectorAll('.menu-btn').forEach(b => {
        const name = (b.dataset.name || '').toLowerCase();
        b.hidden = !name.includes(q.toLowerCase());
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
          showEmpty(container, '現在、注文はありません');
          return;
        }
        const orderCards = data.map(o => {
          const orderId = String(o.id);
          const displayFulfillments = o.fulfillments || [{ id: o.id, location_name: '既定提供場所', status: o.status === 'available' ? 'ready' : o.status, items: o.items || [] }];
          const statusClass = o.status === 'preparing' ? 'status-preparing' : o.status === 'available' ? 'status-available' : o.status === 'delivered' ? 'status-delivered' : 'status-cancelled';
          const hasReady = displayFulfillments.some(f => f.status === 'ready' || f.status === 'handed_over');
          const statusLabel = o.status === 'available' ? '全ブース提供可能' : hasReady ? '一部提供可能' : '準備中';
          const card = createElement('div', 'order-card' + (o.status === 'available' ? ' available' : ''));
          card.dataset.status = o.status;
          const header = createElement('div', 'order-header');
          header.append(createElement('span', 'order-num', padNum(o.display_number)));
          if (o.display_number_date && o.display_number_date !== currentDate) header.append(createElement('span', 'panel-note', o.display_number_date + '受付'));
          header.append(createElement('span', 'badge ' + statusClass, statusLabel));
          const orderItems = createElement('div', 'order-items');
          orderItems.append(...displayFulfillments.map(fulfillmentLine));
          const cancel = createElement('button', 'btn-cancel', '注文をキャンセル');
          cancel.dataset.orderId = orderId;
          cancel.dataset.orderStatus = 'cancelled';
          const actions = createElement('div', 'order-actions');
          actions.append(cancel);
          card.append(header, orderItems, actions);
          return card;
        });
        container.replaceChildren(...orderCards);
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
        const menuButtons = items.map((item, index) => {
          const key = index < 9 ? index + 1 : 0;
          const button = createElement('button', 'menu-btn' + (item.sold_out ? ' sold-out' : ''));
          button.dataset.id = String(item.id);
          button.dataset.name = item.name;
          button.dataset.key = String(key);
          button.dataset.addItemId = String(item.id);
          button.disabled = Boolean(item.sold_out);
          button.append(createElement('span', 'key-hint', key), item.name, createElement('span', 'item-location', item.location_name || '既定提供場所'));
          if (item.sold_out) button.append(createElement('span', 'soldout-label', '売り切れ'));
          const badge = createElement('span', 'cart-badge', '0');
          badge.id = 'badge-' + item.id;
          badge.hidden = true;
          button.append(badge);
          return button;
        });
        grid.replaceChildren(...menuButtons);
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
