import { config } from "../config";

export function monitorPage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>呼び出しモニター - 文化祭飲食システム</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;background:#fff;color:#111827;overflow:hidden;height:100vh}
    .monitor{display:flex;flex-direction:column;height:100vh;padding:32px 40px}
    .header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding-bottom:20px;border-bottom:1px solid #e5e7eb}
    .header h1{font-size:2rem;font-weight:700;letter-spacing:0}
    .header p{font-size:1.05rem;color:#6b7280;margin-top:4px}
    .numbers-grid{flex:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px;align-content:center;padding:28px 0}
    .number-card{background:#fff;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;border:2px solid #d1d5db;transition:border-color .2s,box-shadow .2s,transform .2s;min-height:148px}
    .number-card .num{font-size:4rem;font-weight:800;line-height:1;color:#111827}
    .number-card .label{font-size:0.85rem;color:#6b7280;margin-top:10px}
    .number-card.new{animation:pulse .45s ease-in-out 3;border-color:#111827;box-shadow:0 0 0 4px #f3f4f6}
    @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
    .empty-state{display:flex;align-items:center;justify-content:center;height:100%;min-height:240px;color:#6b7280;border:2px dashed #d1d5db;border-radius:8px;background:#fafafa}
    .empty-state p{font-size:1.6rem;font-weight:600}
    @media(max-width:768px){
      .monitor{padding:20px}
      .header{display:block;padding-bottom:16px}
      .header h1{font-size:1.5rem}
      .header p{font-size:0.95rem}
      .numbers-grid{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;padding:20px 0}
      .number-card .num{font-size:3rem}
      .number-card{min-height:112px}
    }
  </style>
</head>
<body>
  <div class="monitor">
    <div class="header">
      <h1>お呼び出し番号</h1>
      <p>商品のご準備ができました</p>
    </div>
    <div id="numbers-container" class="numbers-grid">
      <div class="empty-state">
        <p>ただいま準備中です</p>
      </div>
    </div>
  </div>

  <script>
    let ws = null;
    let reconnectTimer = null;

    function connect() {
      if (ws && ws.readyState <= 1) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + window.location.host + '/ws/monitor');

      ws.onopen = () => {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'monitor_update') {
            renderNumbers(data.numbers || []);
          }
        } catch(err) {}
      };

      ws.onclose = () => {
        ws = null;
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws && ws.close();
      };
    }

    function renderNumbers(numbers) {
      const container = document.getElementById('numbers-container');
      if (!numbers.length) {
        container.innerHTML = '<div class="empty-state"><p>ただいま準備中です</p></div>';
        return;
      }

      // Track which ones are new for animation
      const existing = new Set();
      container.querySelectorAll('.number-card').forEach(el => {
        const n = el.dataset.num;
        if (n) existing.add(n);
      });

      container.innerHTML = numbers.map(n => {
        const isNew = !existing.has(String(n));
        return '<div class="number-card' + (isNew ? ' new' : '') + '" data-num="' + n + '">' +
          '<div class="num">' + padNum(n) + '</div>' +
          '<div class="label">受付番号</div>' +
          '</div>';
      }).join('');
    }

    function padNum(n) {
      return String(n).padStart(${config.displayNumberDigits}, '0');
    }

    // Initial fetch + connect
    async function init() {
      try {
        const res = await fetch('/api/monitor/numbers');
        if (res.ok) {
          const data = await res.json();
          renderNumbers(data.numbers || []);
        }
      } catch(e) {}
      connect();
    }
    init();
  </script>
</body>
</html>`;
}
