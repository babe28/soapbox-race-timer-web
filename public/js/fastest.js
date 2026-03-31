(async function () {
  const fastestValue = document.getElementById('fastestValue');
  let pollTimer = null;
  let pollRequestId = 0;
  let currentPollController = null;
  let ws = null;
  let wsReconnectTimer = null;
  let scheduledLoadTimer = null;
  let wsConnected = false;
  const CONNECTED_POLL_MS = 4000;
  const FALLBACK_POLL_MS = 1000;

  function scheduleLoadFastest(delay = 80) {
    clearTimeout(scheduledLoadTimer);
    scheduledLoadTimer = setTimeout(() => {
      scheduledLoadTimer = null;
      loadFastest();
    }, delay);
  }

  async function loadFastest() {
    const requestId = ++pollRequestId;
    currentPollController?.abort();
    currentPollController = new AbortController();

    try {
      const res = await fetch('/api/control/state', {
        cache: 'no-store',
        signal: currentPollController.signal,
      });
      const data = await res.json();
      if (requestId !== pollRequestId) return;
      fastestValue.textContent = formatFastest(data?.overallBest);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
    } finally {
      if (requestId === pollRequestId) {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(loadFastest, wsConnected ? CONNECTED_POLL_MS : FALLBACK_POLL_MS);
      }
    }
  }

  function formatFastest(value) {
    return window.SoapboxCommon?.formatMs?.(value) || '--.---';
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
        if (message.type === 'display_update'
          || message.type === 'run_updated'
          || message.type === 'state_update') {
          scheduleLoadFastest();
        }
      } catch (_err) {
        // ignore invalid websocket payloads
      }
    });

    ws.addEventListener('open', () => {
      wsConnected = true;
    });
    ws.addEventListener('close', scheduleWsReconnect);
    ws.addEventListener('error', () => {
      wsConnected = false;
      try {
        ws?.close();
      } catch (_err) {
        // ignore close errors
      }
    });
  }

  function scheduleWsReconnect() {
    clearTimeout(wsReconnectTimer);
    wsConnected = false;
    wsReconnectTimer = setTimeout(connectWs, 1500);
  }

  await loadFastest();
  connectWs();
})();
