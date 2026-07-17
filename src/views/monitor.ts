import { config } from "../config";

export function monitorPage(securityNonce = ""): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>商品受取案内</title>
  <style>
    :root{--waiting-bg:#e5e7eb;--waiting-text:#6b7280;--calling-bg:#166534;--calling-text:#166534;--divider:#d1d5db}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;background:#fff;color:#111827}
    .screen{height:100vh;display:grid;grid-template-rows:minmax(0,1fr) auto}.board{min-height:0;display:grid;grid-template-columns:1fr 1fr}.column{min-width:0;display:grid;grid-template-rows:auto minmax(0,1fr)}.column+ .column{border-left:2px solid var(--divider)}
    .title{margin:0;padding:clamp(14px,2vh,28px);text-align:center;font-size:clamp(28px,2.6vw,48px);font-weight:800;line-height:1.1}.waiting .title{background:var(--waiting-bg);color:#374151}.calling .title{background:var(--calling-bg);color:#fff}
    .content{min-height:0;padding:clamp(16px,2.2vh,30px) clamp(20px,3vw,48px);overflow:hidden}.location{margin-bottom:clamp(14px,2vh,28px)}.location-name{font-size:clamp(19px,1.55vw,30px);font-weight:750;padding-bottom:5px;border-bottom:1px solid #e5e7eb}.numbers{display:flex;flex-direction:column;align-items:flex-start}.number{font-variant-numeric:tabular-nums;font-size:clamp(48px,5.2vw,92px);font-weight:800;line-height:1.05;letter-spacing:.025em}.waiting .number{color:var(--waiting-text)}.calling .number{color:var(--calling-text)}
    .content.dense .location{margin-bottom:8px}.content.dense .location-name{font-size:clamp(17px,1.3vw,24px)}.content.dense .number{font-size:clamp(40px,4vw,68px);line-height:1}
    .guidance{border-top:2px solid #111827;padding:clamp(12px,1.8vh,22px) 24px;text-align:center;font-size:clamp(20px,1.8vw,34px);font-weight:700;line-height:1.25}.page{position:fixed;right:14px;bottom:8px;color:#6b7280;font-size:13px}
    .number.new{animation:number-fade-in 400ms ease-out}@keyframes number-fade-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @media(prefers-reduced-motion:reduce){.number.new{animation:none}}
  </style>
</head>
<body>
  <div class="screen">
    <main class="board">
      <section class="column waiting"><h1 class="title">お待ち番号</h1><div id="waiting" class="content"></div></section>
      <section class="column calling"><h1 class="title">お呼び出し中の番号</h1><div id="calling" class="content"></div></section>
    </main>
    <footer class="guidance">お手元の受付番号をご確認ください。番号が表示されたブースで商品をお受け取りください。</footer>
  </div>
  <div id="page" class="page"></div>
  <script nonce="${securityNonce}">
    const PAGE_SIZE = 10;
    const PAGE_INTERVAL = 8000;
    let socket = null;
    let reconnectTimer = null;
    let board = { locations: [] };
    let knownKeys = new Set();
    let newIds = new Set();
    let waitingPage = 0;
    let callingPage = 0;

    const escapeHtml = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const pad = value => String(value).padStart(${config.displayNumberDigits}, '0');

    function flatten(key) {
      const result = [];
      for (const location of board.locations || []) {
        for (const entry of location[key] || []) result.push({ ...entry, location_id: location.id, location_name: location.name });
      }
      return result;
    }

    function renderColumn(elementId, entries, currentPage) {
      const root = document.getElementById(elementId);
      const start = currentPage * PAGE_SIZE;
      const visible = entries.slice(start, start + PAGE_SIZE);
      root.classList.toggle('dense', visible.length > 7);
      if (!visible.length) { root.innerHTML = ''; return; }
      const groups = [];
      for (const entry of visible) {
        let group = groups.at(-1);
        if (!group || group.id !== entry.location_id) { group = { id: entry.location_id, name: entry.location_name, entries: [] }; groups.push(group); }
        group.entries.push(entry);
      }
      root.innerHTML = groups.map(group => '<section class="location"><h2 class="location-name">' + escapeHtml(group.name) + '</h2><div class="numbers">' + group.entries.map(entry => '<div class="number' + (newIds.has(entry.fulfillment_id) ? ' new' : '') + '" data-id="' + escapeHtml(entry.fulfillment_id) + '">' + pad(entry.display_number) + '</div>').join('') + '</div></section>').join('');
    }

    function render() {
      const waiting = flatten('waiting');
      const calling = flatten('calling');
      const waitingPages = Math.max(1, Math.ceil(waiting.length / PAGE_SIZE));
      const callingPages = Math.max(1, Math.ceil(calling.length / PAGE_SIZE));
      if (waitingPage >= waitingPages) waitingPage = 0;
      if (callingPage >= callingPages) callingPage = 0;
      renderColumn('waiting', waiting, waitingPage);
      renderColumn('calling', calling, callingPage);
      const indicators = [];
      if (waitingPages > 1) indicators.push('待 ' + (waitingPage + 1) + '/' + waitingPages);
      if (callingPages > 1) indicators.push('呼 ' + (callingPage + 1) + '/' + callingPages);
      document.getElementById('page').textContent = indicators.join(' ・ ');
      newIds.clear();
    }

    function applyBoard(next, animate = true) {
      const nextKeys = new Set();
      for (const location of next.locations || []) for (const key of ['waiting','calling']) for (const entry of location[key] || []) nextKeys.add(key + ':' + entry.fulfillment_id);
      newIds = animate ? new Set([...nextKeys].filter(key => !knownKeys.has(key)).map(key => key.slice(key.indexOf(':') + 1))) : new Set();
      knownKeys = nextKeys;
      board = next;
      render();
    }

    async function load() {
      const response = await fetch('/api/monitor/board');
      if (response.ok) applyBoard(await response.json(), knownKeys.size > 0);
    }
    function connect() {
      if (socket && socket.readyState <= 1) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(protocol + '//' + location.host + '/ws/monitor');
      socket.onmessage = event => { try { const data = JSON.parse(event.data); if (data.type === 'monitor_update') applyBoard({ locations: data.locations || [] }); } catch {} };
      socket.onclose = () => { socket = null; reconnectTimer = setTimeout(connect, 3000); };
      socket.onerror = () => socket && socket.close();
    }
    setInterval(() => {
      const waitingPages = Math.max(1, Math.ceil(flatten('waiting').length / PAGE_SIZE));
      const callingPages = Math.max(1, Math.ceil(flatten('calling').length / PAGE_SIZE));
      if (waitingPages > 1) waitingPage = (waitingPage + 1) % waitingPages;
      if (callingPages > 1) callingPage = (callingPage + 1) % callingPages;
      if (waitingPages > 1 || callingPages > 1) render();
    }, PAGE_INTERVAL);
    load().then(connect);
  </script>
</body>
</html>`;
}
