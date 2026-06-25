import { config } from "../config";

type Item = { id: number; name: string; sold_out: number; sort_order: number };
type OrderSummary = { id: string; display_number: number; status: string; created_at: string; items: { name: string; quantity: number }[] };

export function staffPage(items: Item[], orders: OrderSummary[]): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>店員画面 - 文化祭飲食システム</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍽️</text></svg>">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;background:#f0f4f8;color:#1a1a2e;line-height:1.5;overflow-x:hidden}
    button{cursor:pointer;font:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .app{display:grid;grid-template-columns:1fr 380px;height:100vh;gap:0}
    @media(max-width:900px){.app{grid-template-columns:1fr}}
    .menu-panel{padding:16px;overflow-y:auto;background:#fff}
    .orders-panel{padding:16px;overflow-y:auto;background:#f8fafc;border-left:1px solid #e2e8f0}
    @media(max-width:900px){.orders-panel{border-left:none;border-top:1px solid #e2e8f0;max-height:60vh}}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .header h1{font-size:20px}
    .menu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
    .menu-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 8px;border:2px solid #e2e8f0;border-radius:12px;background:#fff;font-size:14px;font-weight:600;transition:all .15s;min-height:80px}
    .menu-btn:hover{border-color:#2563eb;background:#eff6ff}
    .menu-btn:active{transform:scale(.96)}
    .menu-btn.sold-out{opacity:.4;border-color:#fecaca;background:#fef2f2;cursor:not-allowed}
    .menu-btn.sold-out:active{transform:none}
    .menu-btn .price{font-size:11px;color:#6b7280;margin-top:4px;font-weight:400}
    .cart{background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:16px}
    .cart h2{font-size:16px;margin-bottom:10px}
    .cart-item{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #e2e8f0}
    .cart-item:last-child{border-bottom:none}
    .cart-qty{display:flex;align-items:center;gap:6px}
    .cart-qty button{width:28px;height:28px;border-radius:6px;border:1px solid #ddd;background:#fff;font-size:16px;display:flex;align-items:center;justify-content:center}
    .cart-qty button:active{background:#e2e8f0}
    .cart-total{display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:2px solid #e2e8f0;font-weight:700}
    .order-card{border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin-bottom:10px;background:#fff}
    .order-card.available{border-color:#16a34a;background:#f0fdf4}
    .order-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .order-num{font-size:20px;font-weight:700}
    .order-time{font-size:11px;color:#6b7280}
    .order-items{font-size:13px;color:#4b5563;margin-bottom:8px}
    .order-actions{display:flex;gap:6px;flex-wrap:wrap}
    .order-actions button{padding:6px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;transition:all .15s}
    .order-actions button:active{transform:scale(.95)}
    .btn-available{background:#16a34a;color:#fff}
    .btn-delivered{background:#6b7280;color:#fff}
    .btn-cancel{background:#fee2e2;color:#dc2626}
    .btn-undo{background:#e2e8f0;color:#4b5563}
    .empty-orders{text-align:center;padding:40px 0;color:#9ca3af;font-size:14px}
    .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;animation:toastAnim .3s ease-out}
    @keyframes toastAnim{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center}
    .modal-content{background:#fff;border-radius:16px;padding:24px;max-width:400px;width:90%;text-align:center}
    .modal-content .big-num{font-size:56px;font-weight:700;color:#2563eb;margin:12px 0}
    .modal-content .qr-wrap{margin:12px 0}
    .modal-content .qr-wrap img{max-width:200px;height:auto}
    .modal-close{margin-top:12px}
    .search-box{margin-bottom:12px}
    .search-box input{width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px}
    .tabs{display:flex;gap:4px;margin-bottom:12px}
    .tab{flex:1;padding:8px;border:none;border-radius:8px;font-size:13px;font-weight:600;background:#e2e8f0;color:#64748b;transition:all .15s}
    .tab.active{background:#2563eb;color:#fff}
    .status-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
    .status-preparing{background:#dbeafe;color:#1d4ed8}
    .status-available{background:#dcfce7;color:#15803d}
    .status-delivered{background:#e5e7eb;color:#4b5563}
    .status-cancelled{background:#fecaca;color:#991b1b}
  </style>
</head>
<body>
  <div class="app">
    <div class="menu-panel">
      <div class="header">
        <h1>🍽️ 注文受付</h1>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:13px;color:#6b7280">${new Date().toLocaleString("ja-JP")}</span>
          <form method="POST" action="/logout" style="display:inline">
            <button type="submit" class="btn" style="padding:4px 12px;font-size:12px;background:#e2e8f0;border:none;border-radius:6px">ログアウト</button>
          </form>
        </div>
      </div>

      <div id="cart" class="cart">
        <h2>🛒 カート</h2>
        <div id="cart-items">
          <div class="empty-orders">商品を選択してください</div>
        </div>
        <div id="cart-total" class="cart-total" style="display:none">
          <span>合計</span>
          <span id="cart-count">0点</span>
        </div>
        <button id="submit-order" class="btn btn-success btn-lg btn-block mt-2" style="display:none" onclick="submitOrder()">
          注文を確定する
        </button>
      </div>

      <div class="search-box">
        <input type="text" id="item-search" placeholder="商品を検索..." oninput="filterItems(this.value)">
      </div>

      <div class="menu-grid" id="menu-grid">
        ${items.map(item => `
          <button class="menu-btn ${item.sold_out ? 'sold-out' : ''}" data-id="${item.id}" data-name="${escapeHtml(item.name)}"
            onclick="addToCart(${item.id})"
            ${item.sold_out ? 'disabled' : ''}>
            ${escapeHtml(item.name)}
            ${item.sold_out ? '<span style="font-size:10px;color:#dc2626;margin-top:4px">売り切れ</span>' : ''}
          </button>
        `).join("")}
      </div>
    </div>

    <div class="orders-panel">
      <div class="header">
        <h2>📋 現在の注文</h2>
        <div class="tabs" id="order-tabs">
          <button class="tab active" data-filter="all" onclick="filterOrders('all')">すべて</button>
          <button class="tab" data-filter="preparing" onclick="filterOrders('preparing')">準備中</button>
          <button class="tab" data-filter="available" onclick="filterOrders('available')">提供可能</button>
        </div>
      </div>
      <div id="order-list">
        ${orders.length === 0 ? '<div class="empty-orders">現在、注文はありません</div>' : orders.map(order => orderCard(order)).join("")}
      </div>
    </div>
  </div>

  <div id="modal" class="modal-overlay" style="display:none" onclick="closeModal(event)">
    <div class="modal-content" id="modal-content">
      <div id="modal-body"></div>
    </div>
  </div>
  <div id="toast-container"></div>

  <script>
    const cart = new Map();
    let submitting = false;

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function addToCart(id) {
      if (submitting) return;
      const current = cart.get(id) || 0;
      cart.set(id, current + 1);
      if (document.querySelector('.menu-btn[data-id="'+id+'"]')) {
        document.querySelector('.menu-btn[data-id="'+id+'"]').style.borderColor = '#2563eb';
      }
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
      updateCart();
    }

    function updateCart() {
      const container = document.getElementById('cart-items');
      const total = document.getElementById('cart-total');
      const submitBtn = document.getElementById('submit-order');
      const entries = Array.from(cart.entries());
      const items = document.querySelectorAll('.menu-btn');
      items.forEach(b => b.style.borderColor = '#e2e8f0');

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
        if (document.querySelector('.menu-btn[data-id="'+id+'"]')) {
          document.querySelector('.menu-btn[data-id="'+id+'"]').style.borderColor = '#2563eb';
        }
        count += qty;
        html += '<div class="cart-item">';
        html += '<span>' + name + '</span>';
        html += '<div class="cart-qty"><button onclick="changeQty('+id+',-1)">−</button><span>' + qty + '</span><button onclick="changeQty('+id+',1)">+</button></div>';
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
        const res = await fetch('/api/staff/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'エラーが発生しました' }));
          showToast(err.error || 'エラーが発生しました');
          return;
        }

        const data = await res.json();
        const orderUrl = window.location.origin + '/order/' + data.token;
        cart.clear();
        updateCart();

        // Show result modal
        let modalBody = '<div class="text-lg font-bold">注文を受け付けました</div>';
        modalBody += '<div class="big-num">' + padNum(data.display_number) + '</div>';
        modalBody += '<div style="font-size:14px;color:#6b7280;margin-bottom:8px">受付番号</div>';

        // Load QR
        modalBody += '<div class="qr-wrap"><img src="/api/qr/' + data.token + '" alt="QRコード"></div>';
        modalBody += '<div style="font-size:12px;color:#6b7280;margin-bottom:8px">スマートフォンで注文状況を確認できます</div>';
        modalBody += '<div style="font-size:11px;color:#9ca3af;margin-bottom:12px;word-break:break-all">' + orderUrl + '</div>';
        modalBody += '<button class="btn btn-primary" onclick="closeModal()" style="min-width:120px">閉じる</button>';

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
      return String(n).padStart(${config.displayNumberDigits}, '0');
    }

    function closeModal(e) {
      if (e && e.target !== document.getElementById('modal')) return;
      document.getElementById('modal').style.display = 'none';
    }

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
        t.classList.toggle('active', t.dataset.filter === filter);
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
      try {
        const res = await fetch('/api/staff/orders/' + orderId + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'エラー' }));
          showToast(err.error || '操作に失敗しました');
          return;
        }
        refreshOrders();
      } catch (e) {
        showToast('通信エラーが発生しました');
      }
    }

    async function refreshOrders() {
      try {
        const res = await fetch('/api/staff/orders');
        if (!res.ok) return;
        const data = await res.json();
        const container = document.getElementById('order-list');
        if (data.length === 0) {
          container.innerHTML = '<div class="empty-orders">現在、注文はありません</div>';
          return;
        }
        container.innerHTML = data.map(o => {
          const itemsHtml = o.items.map(i => escapeHtml(i.name) + ' x' + i.quantity).join(', ');
          const statusClass = o.status === 'preparing' ? 'status-preparing' : o.status === 'available' ? 'status-available' : o.status === 'delivered' ? 'status-delivered' : 'status-cancelled';
          const statusLabel = o.status === 'preparing' ? '準備中' : o.status === 'available' ? '提供可能' : o.status === 'delivered' ? '受渡済' : 'キャンセル';
          let actions = '';
          if (o.status === 'preparing') {
            actions += '<button class="btn-available" onclick="updateOrderStatus(\\'' + o.id + '\\',\\'available\\')">提供可能にする</button>';
            actions += '<button class="btn-cancel" onclick="updateOrderStatus(\\'' + o.id + '\\',\\'cancelled\\')">キャンセル</button>';
          } else if (o.status === 'available') {
            actions += '<button class="btn-delivered" onclick="updateOrderStatus(\\'' + o.id + '\\',\\'delivered\\')">受渡完了</button>';
            actions += '<button class="btn-undo" onclick="updateOrderStatus(\\'' + o.id + '\\',\\'preparing\\')">準備中に戻す</button>';
          } else if (o.status === 'delivered') {
            actions += '<button class="btn-undo" onclick="updateOrderStatus(\\'' + o.id + '\\',\\'available\\')">提供可能に戻す</button>';
          }
          if (o.status === 'cancelled') {
            actions += '<button class="btn-undo" onclick="updateOrderStatus(\\'' + o.id + '\\',\\'preparing\\')">準備中に戻す</button>';
          }
          return '<div class="order-card' + (o.status === 'available' ? ' available' : '') + '" data-status="' + o.status + '">' +
            '<div class="order-header">' +
            '<span class="order-num">' + padNum(o.display_number) + '</span>' +
            '<span class="badge ' + statusClass + '">' + statusLabel + '</span>' +
            '</div>' +
            '<div class="order-items">' + itemsHtml + '</div>' +
            '<div class="order-actions">' + actions + '</div>' +
            '</div>';
        }).join('');
        applyOrderFilter();
      } catch (e) {
        // silent
      }
    }

    // Poll for order updates
    setInterval(refreshOrders, 5000);
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function orderCard(order: OrderSummary): string {
  const itemsHtml = order.items.map(i => `${escapeHtml(i.name)} x${i.quantity}`).join(", ");
  const statusLabel = { preparing: "準備中", available: "提供可能", delivered: "受渡済", cancelled: "キャンセル" }[order.status];
  const statusClass = {
    preparing: "status-preparing",
    available: "status-available",
    delivered: "status-delivered",
    cancelled: "status-cancelled",
  }[order.status];

  let actions = "";
  if (order.status === "preparing") {
    actions += `<button class="btn-available" onclick="updateOrderStatus('${order.id}','available')">提供可能にする</button>`;
    actions += `<button class="btn-cancel" onclick="updateOrderStatus('${order.id}','cancelled')">キャンセル</button>`;
  } else if (order.status === "available") {
    actions += `<button class="btn-delivered" onclick="updateOrderStatus('${order.id}','delivered')">受渡完了</button>`;
    actions += `<button class="btn-undo" onclick="updateOrderStatus('${order.id}','preparing')">準備中に戻す</button>`;
  } else if (order.status === "delivered") {
    actions += `<button class="btn-undo" onclick="updateOrderStatus('${order.id}','available')">提供可能に戻す</button>`;
  } else if (order.status === "cancelled") {
    actions += `<button class="btn-undo" onclick="updateOrderStatus('${order.id}','preparing')">準備中に戻す</button>`;
  }

  return `<div class="order-card${order.status === "available" ? " available" : ""}" data-status="${order.status}">
    <div class="order-header">
      <span class="order-num">${config.displayNumberPad(order.display_number)}</span>
      <span class="badge ${statusClass}">${statusLabel}</span>
    </div>
    <div class="order-items">${itemsHtml}</div>
    <div class="order-actions">${actions}</div>
  </div>`;
}
