(async function () {
  const fmt = window.SoapboxCommon?.formatMs || ((v) => String(v ?? '--.---'));
  const app = document.getElementById('driverOverlayApp');
  let pollTimer = null;
  let pollRequestId = 0;
  let currentPollController = null;
  let ws = null;
  let wsReconnectTimer = null;
  let scheduledLoadTimer = null;
  let wsConnected = false;
  let lastSignature = '';
  const CONNECTED_POLL_MS = 4000;
  const FALLBACK_POLL_MS = 1000;

  function scheduleLoadOverlay(delay = 80) {
    clearTimeout(scheduledLoadTimer);
    scheduledLoadTimer = setTimeout(() => {
      scheduledLoadTimer = null;
      loadOverlay();
    }, delay);
  }

  async function loadOverlay() {
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
      render(data || {});
      app?.classList.remove('is-error');
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      if (!app?.classList.contains('is-error')) {
        render({});
        app?.classList.add('is-error');
      }
    } finally {
      if (requestId === pollRequestId) {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(loadOverlay, wsConnected ? CONNECTED_POLL_MS : FALLBACK_POLL_MS);
      }
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
        if (message.type === 'display_update'
          || message.type === 'run_updated'
          || message.type === 'state_update'
          || message.type === 'entry_updated'
          || message.type === 'overlay_preview_updated') {
          scheduleLoadOverlay();
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

  function render(data) {
    const entry = data.nowRunningEntry || null;
    const runs = resolveRunsForEntry(data, entry?.id);
    const latestRun = runs[0] || null;
    const preview = resolvePreview(data.overlayPreview, entry?.id);
    const splitMs = preview?.splitMs ?? latestRun?.split_ms ?? null;
    const goalMs = preview?.goalMs ?? latestRun?.goal_ms ?? null;
    const displayStatus = preview?.status || latestRun?.status || data.status;

    const nextSignature = JSON.stringify({
      entryId: entry?.id || null,
      split: splitMs,
      goal: goalMs,
      status: displayStatus || null,
    });

    setText('overlayDriverName', entry?.name || 'NO DRIVER');
    setText('overlayDriverBib', entry?.bibNo ? `No.${entry.bibNo}` : 'No.-');
    setText('overlaySplitTime', splitMs != null ? fmt(splitMs) : '--.---');
    setText('overlayGoalTime', goalMs != null ? fmt(goalMs) : '--.---');
    setText('overlaySplitStatus', splitMs != null ? statusLabel(displayStatus) : statusFallback(data.status));
    setText('overlayGoalStatus', goalMs != null ? statusLabel(displayStatus) : statusFallback(data.status));

    if (nextSignature !== lastSignature) {
      flashCards();
      lastSignature = nextSignature;
    }
  }

  function resolveRunsForEntry(data, entryId) {
    if (!entryId) return [];
    const selectedEntryId = data.selectedEntry?.id ?? null;
    if (selectedEntryId === entryId && Array.isArray(data.selectedEntryRuns)) {
      return data.selectedEntryRuns;
    }
    return [];
  }

  function resolvePreview(preview, entryId) {
    if (!preview || !entryId) return null;
    return Number(preview.entryId) === Number(entryId) ? preview : null;
  }

  function statusLabel(status) {
    const normalized = String(status || '').toLowerCase();
    return ({
      finished: 'FINISHED',
      dq: 'DQ',
      dnf: 'DNF',
      scratch: 'SCRATCH',
      void: 'VOID',
    })[normalized] || 'RECORDED';
  }

  function statusFallback(status) {
    const normalized = String(status || '').toLowerCase();
    return ({
      running: 'RUNNING',
      preparing: 'PREPARING',
      finished: 'FINISHED',
      waiting: 'WAITING',
    })[normalized] || 'WAITING';
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function flashCards() {
    document.querySelectorAll('.overlay-card').forEach((card) => {
      card.classList.remove('is-updated');
      void card.offsetWidth;
      card.classList.add('is-updated');
    });
  }

  await loadOverlay();
  connectWs();
})();
