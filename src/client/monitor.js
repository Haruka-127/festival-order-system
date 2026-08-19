// Browser behavior for the public monitor. Kept framework-free for display-device compatibility.
const PAGE_SIZE = 10;
    const PAGE_INTERVAL = 8000;
    let socket = null;
    let reconnectTimer = null;
    let board = { locations: [] };
    let knownKeys = new Set();
    let newIds = new Set();
    let waitingPage = 0;
    let callingPage = 0;
    let reconnectDelay = 3000;
    const currentDate = document.body.dataset.currentDate || '';

    const pad = value => String(value).padStart(Number(document.body.dataset.displayDigits || '3'), '0');

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
      if (!visible.length) { root.replaceChildren(); return; }
      const groups = [];
      for (const entry of visible) {
        let group = groups.at(-1);
        if (!group || group.id !== entry.location_id) { group = { id: entry.location_id, name: entry.location_name, entries: [] }; groups.push(group); }
        group.entries.push(entry);
      }
      const sections = groups.map(group => {
        const section = document.createElement('section');
        section.className = 'location';
        const heading = document.createElement('h2');
        heading.className = 'location-name';
        heading.textContent = group.name;
        const numbers = document.createElement('div');
        numbers.className = 'numbers';
        for (const entry of group.entries) {
          const number = document.createElement('div');
          number.className = 'number' + (newIds.has(entry.fulfillment_id) ? ' new' : '');
          number.dataset.id = String(entry.fulfillment_id);
          number.append(pad(entry.display_number));
          if (entry.display_number_date && entry.display_number_date !== currentDate) {
            const date = document.createElement('span');
            date.className = 'date-label';
            date.textContent = entry.display_number_date;
            number.append(date);
          }
          numbers.append(number);
        }
        section.append(heading, numbers);
        return section;
      });
      root.replaceChildren(...sections);
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
      try {
        const response = await fetch('/api/monitor/board');
        if (response.ok) { applyBoard(await response.json(), knownKeys.size > 0); setConnection('同期済み', false); }
      } catch { setConnection('オフライン・再接続中', true); }
    }
    function setConnection(message, offline) {
      const element = document.getElementById('connection');
      element.textContent = message + ' ' + new Date().toLocaleTimeString('ja-JP');
      element.classList.toggle('offline', offline);
    }
    function connect() {
      if (socket && socket.readyState <= 1) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(protocol + '//' + location.host + '/ws/monitor');
      socket.onopen = () => { reconnectDelay = 3000; setConnection('リアルタイム接続済み', false); };
      socket.onmessage = event => { try { const data = JSON.parse(event.data); if (data.type === 'monitor_update') applyBoard({ locations: data.locations || [] }); } catch {} };
      socket.onclose = () => { socket = null; setConnection('再接続中', true); reconnectTimer = setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 30000); };
      socket.onerror = () => socket && socket.close();
    }
    setInterval(() => {
      const waitingPages = Math.max(1, Math.ceil(flatten('waiting').length / PAGE_SIZE));
      const callingPages = Math.max(1, Math.ceil(flatten('calling').length / PAGE_SIZE));
      if (waitingPages > 1) waitingPage = (waitingPage + 1) % waitingPages;
      if (callingPages > 1) callingPage = (callingPage + 1) % callingPages;
      if (waitingPages > 1 || callingPages > 1) render();
    }, PAGE_INTERVAL);
    setInterval(load, 15000);
    load().then(connect);
