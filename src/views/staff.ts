import { config } from "../config";
import { formatDateTime } from "../services/time";
import { todayDate } from "../services/numbering";

type Item = { id: number; name: string; sold_out: number; sort_order: number; location_name?: string; max_quantity_per_order?: number | null };
export type CashierOrder = {
  id: string;
  display_number: number;
  display_number_date?: string;
  status: string;
  created_at: string;
  fulfillments?: { id: string; location_name: string; status: string; items: { name: string; quantity: number }[] }[];
  items?: { name: string; quantity: number }[];
};

export function staffPage(items: Item[], orders: CashierOrder[], securityNonce = ""): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>店員画面 - 文化祭飲食システム</title>
  <style>
    :root{--green:#166534;--green-dark:#14532d;--green-soft:#f0fdf4;--ink:#111827;--muted:#6b7280;--line:#d1d5db;--canvas:#f3f4f6;--panel:#fff;--danger:#b91c1c}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body{min-height:100%;background:var(--canvas)}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;color:var(--ink);line-height:1.5;overflow-x:hidden}
    button{cursor:pointer;font:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:42px;padding:9px 16px;border:1px solid #9ca3af;border-radius:2px;background:#fff;color:var(--ink);font-size:14px;font-weight:800;transition:background-color .15s,color .15s,border-color .15s}
    .btn:hover{background:#f9fafb}
    .btn:active{transform:translateY(1px)}
    .btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
    .btn-success,.btn-primary{background:var(--green);border-color:var(--green);color:#fff}
    .btn-success:hover,.btn-primary:hover{background:var(--green-dark)}
    .btn-lg{min-height:54px;padding:14px 24px;font-size:17px}
    .btn-block{width:100%}
    .mt-2{margin-top:8px}
    .text-lg{font-size:1.1rem}
    .font-bold{font-weight:700}
    .topbar{min-height:88px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 24px;background:var(--green);color:#fff;border-bottom:8px solid var(--green-dark)}
    .brand{display:flex;align-items:center;gap:14px}
    .brand-mark{display:grid;place-items:center;width:48px;height:48px;background:#fff;color:var(--green);font-size:24px;font-weight:900}
    .brand-kicker{font-size:11px;font-weight:800;letter-spacing:.15em;opacity:.8}
    .brand h1{font-size:clamp(23px,2.7vw,32px);line-height:1.15}
    .topbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:14px;flex-wrap:wrap}
    .current-time{font-size:13px;font-weight:700}
    .topbar .btn{min-height:38px;border-color:#fff;background:transparent;color:#fff}
    .app{display:grid;grid-template-columns:minmax(0,1fr) 410px;height:calc(100dvh - 88px);min-height:560px}
    .menu-panel{padding:20px 24px 32px;overflow-y:auto;background:var(--canvas)}
    .orders-panel{padding:20px;overflow-y:auto;background:#fff;border-left:2px solid var(--line)}
    .panel-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:14px}
    .panel-kicker{font-size:11px;font-weight:850;letter-spacing:.12em;color:var(--green)}
    .panel-heading h2{font-size:23px;line-height:1.2;padding-left:12px;border-left:7px solid var(--green)}
    .panel-note{font-size:12px;color:var(--muted);font-weight:700;text-align:right}
    .orders-panel .panel-heading{display:block}
    .orders-panel .tabs{margin-top:14px}
    .catalog-toolbar{display:grid;grid-template-columns:auto minmax(220px,360px);align-items:center;justify-content:space-between;gap:16px;margin:18px 0 12px}
    .catalog-title{font-size:18px;font-weight:850}
    .menu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:10px}
    .menu-btn{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 10px;border:2px solid var(--line);border-radius:2px;background:#fff;color:var(--ink);font-size:15px;font-weight:800;transition:background-color .12s,border-color .12s;min-height:98px}
    .menu-btn:hover{border-color:var(--green);background:var(--green-soft)}
    .menu-btn:active{background:#dcfce7}
    .menu-btn.selected{border-color:var(--green);background:var(--green-soft)}
    .menu-btn.sold-out{opacity:.55;border-color:#e5e7eb;background:#f3f4f6;cursor:not-allowed}
    .menu-btn.sold-out:active{transform:none}
    .menu-btn .price{font-size:11px;color:#6b7280;margin-top:4px;font-weight:400}
    .item-location{font-size:11px;color:var(--muted);margin-top:5px;font-weight:650}
    .soldout-label{font-size:11px;color:var(--danger);margin-top:4px;font-weight:850}
    .cart-badge{position:absolute;top:8px;right:8px;min-width:30px;height:30px;border-radius:2px;background:var(--green);color:#fff;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 8px;line-height:1;pointer-events:none}
    .key-hint{position:absolute;top:8px;left:8px;min-width:24px;height:24px;border-radius:2px;background:#e5e7eb;color:#4b5563;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px;line-height:1;pointer-events:none}
    .cart{background:#fff;border:1px solid var(--line);border-top:7px solid var(--green);border-radius:0;padding:18px 20px;margin-bottom:16px}
    .cart h2{font-size:19px;margin-bottom:10px}
    .cart-item{display:flex;justify-content:space-between;align-items:center;gap:14px;min-height:48px;padding:7px 0;border-bottom:1px solid #e5e7eb;font-weight:700}
    .cart-item:last-child{border-bottom:none}
    .cart-qty{display:grid;grid-template-columns:44px 36px 44px;align-items:center;text-align:center;flex:0 0 auto}
    .cart-qty button{width:44px;height:44px;border-radius:2px;border:1px solid #9ca3af;background:#fff;color:var(--ink);font-size:20px;font-weight:800;display:flex;align-items:center;justify-content:center}
    .cart-qty button:active{background:var(--green-soft)}
    .cart-total{display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:2px solid var(--ink);font-size:17px;font-weight:850}
    .order-card{border:1px solid var(--line);border-left:7px solid #9ca3af;border-radius:0;padding:14px 14px 13px;margin-bottom:10px;background:#fff}
    .order-card.available{border-left-color:var(--green);background:var(--green-soft)}
    .order-header{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
    .order-num{font-size:32px;font-weight:850;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:.03em}
    .order-time{font-size:11px;color:#6b7280}
    .order-items{font-size:13px;color:#374151;margin-bottom:10px;line-height:1.55}
    .fulfillment-line{margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}
    .fulfillment-line:last-child{border-bottom:0}
    .order-actions{display:flex;gap:6px;flex-wrap:wrap}
    .order-actions button{min-height:40px;padding:7px 12px;border:1px solid #9ca3af;border-radius:2px;font-size:12px;font-weight:800;transition:background-color .15s;background:#fff;color:var(--ink)}
    .order-actions button:active{transform:translateY(1px)}
    .btn-available{background:var(--green)!important;border-color:var(--green)!important;color:#fff!important}
    .btn-delivered{background:#fff;color:var(--ink)}
    .btn-cancel{background:#fff;color:var(--danger);border-color:#fca5a5!important}
    .btn-undo{background:#fff;color:#374151}
    .empty-orders{text-align:center;padding:28px 12px;color:#9ca3af;font-size:14px}
    .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--green-dark);color:#fff;padding:13px 24px;border-radius:2px;z-index:9999;animation:toastAnim .25s ease-out}
    @keyframes toastAnim{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:center;justify-content:center}
    .modal-content{background:#fff;border-radius:0;padding:28px;max-width:420px;width:90%;text-align:center;border-top:9px solid var(--green)}
    .modal-content .big-num{font-size:72px;font-weight:850;color:var(--green);margin:12px 0;font-variant-numeric:tabular-nums}
    .modal-content .qr-wrap{margin:12px 0}
    .modal-content .qr-wrap img{max-width:200px;height:auto}
    .modal-close{margin-top:12px}
    .search-box{margin:0}
    .search-box input{width:100%;min-height:46px;padding:10px 14px;border:1px solid #9ca3af;border-radius:2px;font-size:15px;background:#fff;color:var(--ink)}
    .search-box input:focus{border-color:var(--green)}
    .tabs{display:flex;gap:0;margin-bottom:12px;border:1px solid var(--line)}
    .tab{flex:1;min-height:44px;padding:9px 8px;border:0;border-right:1px solid var(--line);border-bottom:4px solid transparent;border-radius:0;font-size:13px;font-weight:800;background:#fff;color:#4b5563;transition:background-color .15s,color .15s;white-space:nowrap;line-height:1.2}
    .tab:last-child{border-right:0}
    .tab.active{background:var(--green-soft);border-bottom-color:var(--green);color:var(--green)}
    .badge,.status-badge{display:inline-flex;align-items:center;justify-content:center;padding:4px 9px;border-radius:2px;font-size:12px;font-weight:800;line-height:1.2;white-space:nowrap}
    .status-preparing{background:#e5e7eb;color:#374151}
    .status-available{background:var(--green);color:#fff;border:1px solid var(--green)}
    .status-delivered{background:#e5e7eb;color:#4b5563}
    .status-cancelled{background:#fecaca;color:#991b1b}
    button:focus-visible,input:focus-visible{outline:3px solid #facc15;outline-offset:2px}
    @media(max-width:900px){body{overflow:auto}.topbar{min-height:80px}.app{display:block;height:auto;min-height:0}.menu-panel,.orders-panel{overflow:visible}.orders-panel{border-left:0;border-top:8px solid var(--green);padding:20px 24px 32px}.orders-panel .panel-heading{display:flex}.orders-panel .tabs{min-width:310px;margin:0}.order-card{max-width:none}}
    @media(max-width:640px){.topbar{align-items:flex-start;padding:14px 12px}.brand-mark{display:none}.brand-kicker{font-size:10px}.brand h1{font-size:22px}.topbar-actions{gap:8px}.current-time{font-size:11px}.menu-panel,.orders-panel{padding:16px 12px 24px}.panel-heading,.orders-panel .panel-heading{display:block}.panel-note{text-align:left;margin-top:5px}.orders-panel .tabs{min-width:0;margin-top:12px}.catalog-toolbar{grid-template-columns:1fr;gap:8px}.menu-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.menu-btn{min-height:96px;padding:16px 7px}.cart{padding:14px}.cart-item{align-items:flex-start}.cart-qty{grid-template-columns:42px 32px 42px}.cart-qty button{width:42px;height:42px}.order-num{font-size:29px}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand"><div class="brand-mark" aria-hidden="true">注</div><div><div class="brand-kicker">FESTIVAL ORDER SYSTEM</div><h1>注文受付</h1></div></div>
    <div class="topbar-actions">
      <span class="current-time">${formatDateTime(new Date())}</span>
      <a href="/account/password" class="btn" style="text-decoration:none">パスワード変更</a>
      <form method="POST" action="/logout" style="display:inline"><button type="submit" class="btn">ログアウト</button></form>
    </div>
  </header>
  <div class="app">
    <div class="menu-panel">
      <div class="panel-heading"><div><div class="panel-kicker">ORDER ENTRY</div><h2>新しい注文</h2></div><p class="panel-note">商品ボタンまたは数字キーで追加できます</p></div>

      <div id="cart" class="cart">
        <h2>カート</h2>
        <div id="cart-items" aria-live="polite">
          <div class="empty-orders">商品を選択してください</div>
        </div>
        <div id="cart-total" class="cart-total" style="display:none">
          <span>合計</span>
          <span id="cart-count">0点</span>
        </div>
        <button id="submit-order" class="btn btn-success btn-lg btn-block mt-2" style="display:none" data-action="submit-order">
          注文を確定する
        </button>
      </div>

      <div class="catalog-toolbar">
        <h2 class="catalog-title">商品を選択</h2>
        <div class="search-box"><input type="search" id="item-search" aria-label="商品を検索" placeholder="商品名で検索"></div>
      </div>

      <div class="menu-grid" id="menu-grid">
        ${items.map((item, i) => {
          const key = i < 9 ? i + 1 : 0;
          return `
          <button class="menu-btn ${item.sold_out ? 'sold-out' : ''}" data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-key="${key}" data-add-item-id="${item.id}"
            ${item.sold_out ? 'disabled' : ''}>
            <span class="key-hint">${key}</span>
            ${escapeHtml(item.name)}
            <span class="item-location">${escapeHtml(item.location_name ?? "既定提供場所")}</span>
            ${item.sold_out ? '<span class="soldout-label">売り切れ</span>' : ''}
            <span class="cart-badge" id="badge-${item.id}" style="display:none">0</span>
          </button>`;
        }).join("")}
      </div>
    </div>

    <div class="orders-panel">
      <div class="panel-heading">
        <div><div class="panel-kicker">ORDER STATUS</div><h2>現在の注文</h2></div>
        <div><div id="last-updated" class="panel-note">更新確認中</div><div class="tabs" id="order-tabs" role="tablist" aria-label="注文状態で絞り込み">
          <button class="tab active" data-filter="all" role="tab" aria-selected="true">すべて</button>
          <button class="tab" data-filter="preparing" role="tab" aria-selected="false">準備中</button>
          <button class="tab" data-filter="available" role="tab" aria-selected="false">提供可能</button>
        </div></div>
      </div>
      <div id="order-list">
        ${orders.length === 0 ? '<div class="empty-orders">現在、注文はありません</div>' : orders.map(order => orderCard(order)).join("")}
      </div>
    </div>
  </div>

  <div id="modal" class="modal-overlay" style="display:none">
    <div class="modal-content" id="modal-content" role="dialog" aria-modal="true" aria-label="注文受付結果">
      <div id="modal-body"></div>
    </div>
  </div>
  <div id="toast-container"></div>

  <script nonce="${securityNonce}">
    let savedDraft = null;
    try { savedDraft = JSON.parse(sessionStorage.getItem('staff-order-draft') || 'null'); } catch {}
    const cart = new Map(Array.isArray(savedDraft?.items) ? savedDraft.items : []);
    let submitting = false;
    let pendingRequestId = savedDraft?.requestId || null;
    let pendingPayloadSignature = savedDraft?.signature || '';
    const currentDate = ${JSON.stringify(todayDate())};

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
      return String(n).padStart(${config.displayNumberDigits}, '0');
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
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function orderCard(order: CashierOrder): string {
  const orderId = escapeHtml(order.id);
  const fulfillments = order.fulfillments ?? [{ id: order.id, location_name: "既定提供場所", status: order.status === "available" ? "ready" : order.status, items: order.items ?? [] }];
  const fulfillmentHtml = fulfillments.map(fulfillment => {
    const label = { preparing: "準備中", ready: "提供可能", handed_over: "受渡済", cancelled: "キャンセル" }[fulfillment.status] ?? fulfillment.status;
    const items = fulfillment.items.map(item => `${escapeHtml(item.name)} x${item.quantity}`).join(", ");
    return `<div class="fulfillment-line"><strong>${escapeHtml(fulfillment.location_name)}</strong> <span style="color:#6b7280">${label}</span><br>${items}</div>`;
  }).join("");
  const hasReady = fulfillments.some(fulfillment => fulfillment.status === "ready" || fulfillment.status === "handed_over");
  const statusLabel = order.status === "available" ? "全ブース提供可能" : hasReady ? "一部提供可能" : "準備中";
  const statusClass = {
    preparing: "status-preparing",
    available: "status-available",
    delivered: "status-delivered",
    cancelled: "status-cancelled",
  }[order.status];

  const actions = `<button class="btn-cancel" data-order-id="${orderId}" data-order-status="cancelled">注文をキャンセル</button>`;

  return `<div class="order-card${order.status === "available" ? " available" : ""}" data-status="${order.status}">
    <div class="order-header">
      <span class="order-num">${config.displayNumberPad(order.display_number)}</span>
      ${order.display_number_date && order.display_number_date !== todayDate() ? `<span class="panel-note">${escapeHtml(order.display_number_date)}受付</span>` : ""}
      <span class="badge ${statusClass}">${statusLabel}</span>
    </div>
    <div class="order-items">${fulfillmentHtml}</div>
    <div class="order-actions">${actions}</div>
  </div>`;
}
