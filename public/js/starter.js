(function () {
  const POLL_MS = 4000;
  let pollTimer = null;
  let ws = null;
  let wsReconnectTimer = null;
  let currentState = null;
  let lastSeenResultRunId = null;
  let dismissedResultRunId = null;
  let sliderPointerId = null;
  let sliderStartX = 0;
  let sliderBaseX = 0;
  let sliderCurrentX = 0;

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

    document.getElementById('starterResultCloseBtn')?.addEventListener('click', closeResultPopup);
    document.getElementById('starterFullscreenBtn')?.addEventListener('click', toggleFullscreen);
    bindReadySlider();
  }

  function bindReadySlider() {
    const slider = document.getElementById('starterReadySlider');
    if (!slider) return;

    slider.addEventListener('pointerdown', (event) => {
      sliderPointerId = event.pointerId;
      sliderStartX = event.clientX;
      sliderBaseX = getSliderTargetX(Boolean(currentState?.starterReady));
      sliderCurrentX = sliderBaseX;
      slider.setPointerCapture(event.pointerId);
    });

    slider.addEventListener('pointermove', (event) => {
      if (sliderPointerId !== event.pointerId) return;
      const delta = event.clientX - sliderStartX;
      const maxX = getSliderMaxX();
      sliderCurrentX = clamp(sliderBaseX + delta, 0, maxX);
      applySliderOffset(sliderCurrentX);
    });

    const finishSlide = async (event) => {
      if (sliderPointerId !== event.pointerId) return;
      try {
        slider.releasePointerCapture(event.pointerId);
      } catch (_err) {
        // ignore release errors
      }
      sliderPointerId = null;
      const maxX = getSliderMaxX();
      const nextReady = maxX > 0 ? sliderCurrentX >= (maxX * 0.58) : Boolean(currentState?.starterReady);
      await postJson('/api/control/action/starter-ready', { ready: nextReady });
      await loadStarterState();
    };

    slider.addEventListener('pointerup', finishSlide);
    slider.addEventListener('pointercancel', finishSlide);
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
        if (message.type === 'state_update' || message.type === 'run_updated') {
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
    document.getElementById('starterNowRunning').textContent = formatEntry(data.nowRunningEntry);
    document.getElementById('starterNext').textContent = formatEntry(data.nextEntry);

    document.querySelectorAll('[data-status]').forEach((button) => {
      button.classList.toggle('active', button.dataset.status === data.status);
    });

    const readyStateEl = document.getElementById('starterReadyState');
    const isReady = Boolean(data.starterReady);
    readyStateEl.textContent = isReady ? 'READY' : 'WAITING';
    readyStateEl.classList.toggle('is-ready', isReady);
    readyStateEl.classList.toggle('is-waiting', !isReady);
    syncReadySlider(isReady);

    renderLatestResult(data.latestResult);
  }

  function syncReadySlider(isReady) {
    const slider = document.getElementById('starterReadySlider');
    if (!slider) return;
    slider.dataset.ready = String(isReady);
    slider.classList.toggle('is-ready', isReady);
    applySliderOffset(getSliderTargetX(isReady));
  }

  function getSliderMaxX() {
    const slider = document.getElementById('starterReadySlider');
    const thumb = document.getElementById('starterReadyThumb');
    if (!slider || !thumb) return 0;
    return Math.max(slider.clientWidth - thumb.clientWidth - 16, 0);
  }

  function getSliderTargetX(isReady) {
    return isReady ? getSliderMaxX() : 0;
  }

  function applySliderOffset(value) {
    const thumb = document.getElementById('starterReadyThumb');
    if (!thumb) return;
    thumb.style.transform = `translateX(${value}px)`;
  }

  function renderLatestResult(result) {
    if (!result?.runId) {
      hideResultPopup();
      return;
    }

    document.getElementById('starterResultName').textContent = `No.${result.bibNo} ${result.name}`;
    document.getElementById('starterResultRank').textContent = result.provisionalRank ? `${result.provisionalRank}位` : '-';
    document.getElementById('starterResultSplit').textContent = formatMs(result.splitMs);
    document.getElementById('starterResultGoal').textContent = formatMs(result.goalMs);

    if (lastSeenResultRunId === null) {
      lastSeenResultRunId = result.runId;
      hideResultPopup();
      return;
    }

    const isNewResult = result.runId !== lastSeenResultRunId;
    lastSeenResultRunId = result.runId;
    if (isNewResult) {
      dismissedResultRunId = null;
    }

    if (dismissedResultRunId === result.runId) {
      hideResultPopup();
      return;
    }
    showResultPopup();
  }

  function showResultPopup() {
    const popup = document.getElementById('starterResultPopup');
    if (popup) popup.hidden = false;
  }

  function hideResultPopup() {
    const popup = document.getElementById('starterResultPopup');
    if (popup) popup.hidden = true;
  }

  function closeResultPopup() {
    const runId = currentState?.latestResult?.runId;
    if (runId) dismissedResultRunId = runId;
    hideResultPopup();
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch (err) {
      console.error(err);
    }
  }

  function formatEntry(entry) {
    if (!entry?.id) return '-';
    return `No.${entry.bibNo} ${entry.name}`;
  }

  function formatMs(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    const totalMs = Number(value);
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const milliseconds = totalMs % 1000;
    if (minutes > 0) {
      return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }
    return `${seconds}.${String(milliseconds).padStart(3, '0')}`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
