import { config } from "../config";

export function monitorPage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>呼び出しモニター - 文化祭飲食システム</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📺</text></svg>">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif;background:#0f172a;color:#f1f5f9;overflow:hidden;height:100vh}
    .monitor{display:flex;flex-direction:column;height:100vh;padding:20px}
    .header{text-align:center;padding:10px 0 20px}
    .header h1{font-size:2rem;font-weight:700;letter-spacing:2px}
    .header p{font-size:1.1rem;color:#94a3b8;margin-top:4px}
    .numbers-grid{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;align-content:center;padding:10px}
    .number-card{background:linear-gradient(135deg,#1e293b,#334155);border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;border:2px solid #475569;transition:all .3s;min-height:140px}
    .number-card .num{font-size:3.5rem;font-weight:800;line-height:1.1}
    .number-card .label{font-size:0.9rem;color:#94a3b8;margin-top:4px}
    .number-card.new{animation:pulse .5s ease-in-out 3;border-color:#22c55e;background:linear-gradient(135deg,#064e3b,#065f46)}
    .number-card.new .num{color:#4ade80}
    @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
    .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#64748b}
    .empty-state .icon{font-size:6rem;margin-bottom:20px}
    .empty-state p{font-size:1.5rem}
    @media(max-width:768px){
      .header h1{font-size:1.5rem}
      .numbers-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
      .number-card .num{font-size:2.5rem}
      .number-card{min-height:100px}
    }
  </style>
</head>
<body>
  <div class="monitor">
    <div class="header">
      <h1>🔔 お呼び出し</h1>
      <p>商品のご準備ができました</p>
    </div>
    <div id="numbers-container" class="numbers-grid">
      <div class="empty-state">
        <div class="icon">🍳</div>
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
        container.innerHTML = '<div class="empty-state"><div class="icon">🍳</div><p>ただいま準備中です</p></div>';
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
