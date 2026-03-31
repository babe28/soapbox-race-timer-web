(function () {
  const POLL_MS = 4000;
  let pollTimer = null;
  let ws = null;
  let wsReconnectTimer = null;
  let currentState = null;

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadStarterState();
    connectWs();
  });

  function bindEvents() {
    document.querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        await postJson('/api/control/action/status', { status: button.dataset.status });
        await loadStarterState();
      });
    });

    document.getElementById('starterReadyBtn')?.addEventListener('click', async () => {
      const nextReady = !currentState?.starterReady;
      await postJson('/api/control/action/starter-ready', { ready: nextReady });
      await loadStarterState();
    });
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || 'request failed');
    }
    return res.json().catch(() => ({}));
  }

  async function loadStarterState() {
    clearTimeout(pollTimer);
    try {
      const res = await fetch('/api/control/starter', { cache: 'no-store' });
      const data = await res.json();
      currentState = data;
      render(data);
    } catch (err) {
      console.error(err);
    } finally {
      pollTimer = setTimeout(loadStarterState, POLL_MS);
    }
  }

  function connectWs() {
    clearTimeout(wsReconnectTimer);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      ws = new WebSocket(url);
    } catch (_err) {
      scheduleWsReconnect();
      return;
    }

    ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state_update') {
          loadStarterState();
        }
      } catch (_err) {
        // ignore invalid payloads
      }
    });

    ws.addEventListener('close', scheduleWsReconnect);
    ws.addEventListener('error', () => {
      try {
        ws?.close();
      } catch (_err) {
        // ignore close errors
      }
    });
  }

  function scheduleWsReconnect() {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectWs, 1500);
  }

  function render(data) {
    document.getElementById('starterEventName').textContent = data.eventName || 'Soap Box Derby';
    document.getElementById('starterHeatNo').textContent = data.heatNo ? `Heat ${data.heatNo}` : 'Heat -';
    document.getElementById('starterLastUpdate').textContent = `Last update ${data.lastUpdate || '-'}`;
    document.getElementById('starterCurrentStatus').textContent = String(data.status || 'waiting').toUpperCase();
    document.getElementById('starterNowRunning').textContent = formatEntry(data.nowRunningEntry);
    document.getElementById('starterNext').textContent = formatEntry(data.nextEntry);

    document.querySelectorAll('[data-status]').forEach((button) => {
      button.classList.toggle('active', button.dataset.status === data.status);
    });

    const readyStateEl = document.getElementById('starterReadyState');
    const readyBtnEl = document.getElementById('starterReadyBtn');
    const isReady = Boolean(data.starterReady);
    readyStateEl.textContent = isReady ? 'READY' : 'WAITING';
    readyStateEl.classList.toggle('is-ready', isReady);
    readyStateEl.classList.toggle('is-waiting', !isReady);
    readyBtnEl.textContent = isReady ? 'スタート準備完了を解除' : 'スタート準備完了';
    readyBtnEl.classList.toggle('is-ready', isReady);
  }

  function formatEntry(entry) {
    if (!entry?.id) return '-';
    return `No.${entry.bibNo} ${entry.name}`;
  }
})();
