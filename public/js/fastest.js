(async function () {
  const fastestValue = document.getElementById('fastestValue');
  let pollTimer = null;
  let pollRequestId = 0;
  let currentPollController = null;
  let ws = null;
  let wsReconnectTimer = null;

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
        pollTimer = setTimeout(loadFastest, 1000);
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
          loadFastest();
        }
      } catch (_err) {
        // ignore invalid websocket payloads
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

  await loadFastest();
  connectWs();
})();
