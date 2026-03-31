let controlState = null;
let selectedEntry = null;
let pollTimer = null;
let pollRequestId = 0;
let currentPollController = null;
let preferredSelectedEntryId = null;
let ws = null;
let wsReconnectTimer = null;
let scheduledControlReloadTimer = null;
let wsConnected = false;
let externalTimerNoticeTimer = null;
let overlayPreviewSyncTimer = null;
let selectionPreviewSyncTimer = null;
let controlLockHeartbeatTimer = null;
let controlLockRetryTimer = null;
let controlLockOwned = false;
let controlSessionId = null;
let controlActivated = false;

const fmt = window.SoapboxCommon?.formatMs || ((v) => String(v ?? '-'));
const RUN_TYPE_STORAGE_KEY = 'soapbox:lastRunType';
const CONNECTED_POLL_MS = 4000;
const FALLBACK_POLL_MS = 1000;
const CONTROL_LOCK_SESSION_KEY = 'soapbox:control-session-id';
const CONTROL_LOCK_HEARTBEAT_MS = 5000;
const CONTROL_LOCK_RETRY_MS = 5000;

function cancelScheduledControlReload() {
  clearTimeout(scheduledControlReloadTimer);
  scheduledControlReloadTimer = null;
}

function scheduleControlReload(nextPreferredId, delay = 80) {
  if (!controlLockOwned) return;
  cancelScheduledControlReload();
  scheduledControlReloadTimer = setTimeout(() => {
    scheduledControlReloadTimer = null;
    loadControlState(nextPreferredId === undefined ? preferredSelectedEntryId : nextPreferredId);
  }, delay);
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  restoreRunType();
  initializeControlSession();
  ensureControlLock();
  window.addEventListener('pagehide', releaseControlLock);
  window.addEventListener('beforeunload', releaseControlLock);
});

function bindEvents() {
  document.getElementById('saveBtn')?.addEventListener('click', saveRun);
  document.getElementById('nextBtn')?.addEventListener('click', moveToNextDriver);
  document.getElementById('saveNextBtn')?.addEventListener('click', saveAndNext);
  document.getElementById('resetBtn')?.addEventListener('click', () => clearRunForm(false));
  document.getElementById('splitTime')?.addEventListener('input', scheduleOverlayPreviewSync);
  document.getElementById('goalTime')?.addEventListener('input', scheduleOverlayPreviewSync);
  document.getElementById('runStatus')?.addEventListener('change', scheduleOverlayPreviewSync);

  document.getElementById('nowCard')?.addEventListener('click', () => {
    if (controlState?.nowRunningEntry) setSelectedEntry(controlState.nowRunningEntry);
  });

  document.getElementById('nextCard')?.addEventListener('click', () => {
    if (controlState?.nextEntry) setSelectedEntry(controlState.nextEntry);
  });

  document.getElementById('moveNextBtn')?.addEventListener('click', async () => {
    await postJson('/api/control/action/move-next', {});
    const data = await loadControlState(controlState?.nowRunningEntry?.id ?? null);
    if (data?.nowRunningEntry) setSelectedEntry(data.nowRunningEntry);
  });

  document.getElementById('clearNowBtn')?.addEventListener('click', async () => {
    await postJson('/api/control/action/set-now', { entryId: null });
    await loadControlState();
  });

  document.getElementById('setNowBtn')?.addEventListener('click', async () => {
    if (!selectedEntry?.id) return alert('Select an entry first');
    await postJson('/api/control/action/set-now', { entryId: selectedEntry.id });
    await loadControlState(selectedEntry.id);
  });

  document.getElementById('setNextBtn')?.addEventListener('click', async () => {
    if (!selectedEntry?.id) return alert('Select an entry first');
    await postJson('/api/control/action/set-next', { entryId: selectedEntry.id });
    await loadControlState(selectedEntry.id);
  });

  document.getElementById('skipNextBtn')?.addEventListener('click', async () => {
    const entry = controlState?.nextEntry || selectedEntry;
    if (!entry?.id) return alert('No entry to skip');
    await postJson('/api/control/action/skip', { entryId: entry.id });
    await loadControlState();
  });

  document.getElementById('unskipBtn')?.addEventListener('click', async () => {
    if (!selectedEntry?.id) return alert('Select an entry first');
    await postJson('/api/control/action/unskip', { entryId: selectedEntry.id });
    await loadControlState(selectedEntry.id);
  });

  document.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await postJson('/api/control/action/status', { status: btn.dataset.status });
      await loadControlState();
    });
  });

  document.querySelectorAll('[data-run-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setRunType(btn.dataset.runType);
    });
  });

  document.getElementById('entrySearch')?.addEventListener('input', renderQueueList);
  document.getElementById('historyBody')?.addEventListener('click', onHistoryClick);
  document.getElementById('controlLockRetryBtn')?.addEventListener('click', () => {
    ensureControlLock({ manual: true });
  });
  document.getElementById('controlLockForceBtn')?.addEventListener('click', forceUnlockAndAcquire);
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

function initializeControlSession() {
  try {
    const existing = window.sessionStorage.getItem(CONTROL_LOCK_SESSION_KEY);
    if (existing) {
      controlSessionId = existing;
      return;
    }
    controlSessionId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(CONTROL_LOCK_SESSION_KEY, controlSessionId);
  } catch (_err) {
    controlSessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function showControlLockOverlay(message) {
  showControlLockNotice(
    message || '別のブラウザで Race Control が使用中です。そちらを閉じると、この画面は自動で有効になります。',
    'Race Control はすでに開かれています',
  );
}

function showControlLockNotice(message, title = 'Race Control はすでに開かれています') {
  document.body.classList.add('is-locked');
  const overlay = document.getElementById('controlLockOverlay');
  const titleEl = document.getElementById('controlLockTitle');
  const messageEl = document.getElementById('controlLockMessage');
  if (titleEl) titleEl.textContent = title;
  if (messageEl) {
    messageEl.textContent = message || '別のブラウザで Race Control が使用中です。そちらを閉じると、この画面は自動で有効になります。';
  }
  if (overlay) overlay.hidden = false;
}

function hideControlLockOverlay() {
  document.body.classList.remove('is-locked');
  const overlay = document.getElementById('controlLockOverlay');
  const titleEl = document.getElementById('controlLockTitle');
  const messageEl = document.getElementById('controlLockMessage');
  if (titleEl) titleEl.textContent = 'Race Control はすでに開かれています';
  if (messageEl) {
    messageEl.textContent = '別のブラウザで Race Control が使用中です。そちらを閉じると、この画面は自動で有効になります。';
  }
  if (overlay) overlay.hidden = true;
}

function stopControlActivity() {
  clearTimeout(pollTimer);
  clearTimeout(scheduledControlReloadTimer);
  clearTimeout(selectionPreviewSyncTimer);
  clearTimeout(overlayPreviewSyncTimer);
  clearTimeout(controlLockHeartbeatTimer);
  clearTimeout(wsReconnectTimer);
  pollTimer = null;
  scheduledControlReloadTimer = null;
  selectionPreviewSyncTimer = null;
  overlayPreviewSyncTimer = null;
  controlLockHeartbeatTimer = null;
  wsReconnectTimer = null;
  currentPollController?.abort();
  currentPollController = null;
  wsConnected = false;
  if (ws) {
    try {
      ws.close();
    } catch (_err) {
      // ignore close errors
    }
    ws = null;
  }
}

function startControlActivity() {
  hideControlLockOverlay();
  if (controlActivated) return;
  controlActivated = true;
  loadControlState();
  connectWs();
}

function scheduleControlLockRetry(delay = CONTROL_LOCK_RETRY_MS) {
  clearTimeout(controlLockRetryTimer);
  controlLockRetryTimer = setTimeout(() => {
    controlLockRetryTimer = null;
    ensureControlLock();
  }, delay);
}

function startControlLockHeartbeat() {
  clearTimeout(controlLockHeartbeatTimer);
  controlLockHeartbeatTimer = setTimeout(async () => {
    controlLockHeartbeatTimer = null;
    if (!controlLockOwned) return;
    try {
      const res = await fetch('/api/control/lock/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: controlSessionId }),
      });
      if (!res.ok) {
        controlLockOwned = false;
        controlActivated = false;
        stopControlActivity();
        showControlLockNotice(
          '別の画面が Race Control を使用しています。利用可能になり次第、この画面は自動で有効になります。',
          'Race Control のロックが失われました',
        );
        scheduleControlLockRetry();
        return;
      }
    } catch (_err) {
      // keep current lock and retry heartbeat
    }
    startControlLockHeartbeat();
  }, CONTROL_LOCK_HEARTBEAT_MS);
}

async function ensureControlLock(_options = {}) {
  clearTimeout(controlLockRetryTimer);
  try {
    const res = await fetch('/api/control/lock/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: controlSessionId }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      controlLockOwned = false;
      controlActivated = false;
      stopControlActivity();
      if (json?.locked === false) {
        showControlLockNotice(
          'ロック状態の確認が競合したため、再取得を試しています。',
          'Race Control を確認中です',
        );
        scheduleControlLockRetry(800);
        return;
      }
      showControlLockNotice(
        'すでに別のブラウザで Race Control が開かれています。必要なら「強制解放」で解除してください。',
        'Race Control はすでに開かれています',
      );
      scheduleControlLockRetry();
      return;
    }

    controlLockOwned = true;
    startControlActivity();
    startControlLockHeartbeat();
  } catch (_err) {
    controlLockOwned = false;
    controlActivated = false;
    stopControlActivity();
    showControlLockNotice(
      'Race Control のロック確認に失敗しました。サーバーに接続できているか確認してください。',
      'Race Control に接続できません',
    );
    scheduleControlLockRetry(3000);
  }
}

async function forceUnlockAndAcquire() {
  try {
    const res = await fetch('/api/control/lock/force-release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error('force release failed');
    }
    controlLockOwned = false;
    controlActivated = false;
    stopControlActivity();
    await ensureControlLock({ manual: true });
  } catch (_err) {
    showControlLockNotice(
      '強制解放に失敗しました。サーバー状態を確認してから再度お試しください。',
      'Race Control を解放できません',
    );
  }
}

function releaseControlLock() {
  if (!controlSessionId) return;
  clearTimeout(controlLockRetryTimer);
  clearTimeout(controlLockHeartbeatTimer);
  if (navigator.sendBeacon) {
    const payload = new Blob([JSON.stringify({ sessionId: controlSessionId })], { type: 'application/json' });
    navigator.sendBeacon('/api/control/lock/release', payload);
  }
}

async function loadControlState(nextPreferredId = preferredSelectedEntryId) {
  if (!controlLockOwned) return controlState;
  const requestId = ++pollRequestId;
  currentPollController?.abort();
  currentPollController = new AbortController();

  try {
    const res = await fetch('/api/control/state', {
      cache: 'no-store',
      signal: currentPollController.signal,
    });
    const data = await res.json();
    if (requestId !== pollRequestId) return controlState;

    controlState = data;
    render(data);

    const selectedId = nextPreferredId === null
      ? null
      : (nextPreferredId ?? selectedEntry?.id ?? null);
    const queueSelected = selectedId
      ? data.queue?.find((q) => q.id === selectedId)
      : null;

    if (queueSelected) {
      setSelectedEntry(queueSelected, false, false);
    } else if (data.selectedEntry?.id) {
      setSelectedEntry(data.selectedEntry, false, false);
    } else {
      clearSelectedEntry(false);
    }

    preferredSelectedEntryId = nextPreferredId === null
      ? (selectedEntry?.id ?? null)
      : (selectedEntry?.id ?? null);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
    }
  } finally {
    if (requestId === pollRequestId) {
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => loadControlState(), wsConnected ? CONNECTED_POLL_MS : FALLBACK_POLL_MS);
    }
  }
  return controlState;
}

function connectWs() {
  if (!controlLockOwned) return;
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
      if (message.type === 'state_update'
        || message.type === 'entry_updated'
        || message.type === 'run_updated'
        || message.type === 'overlay_preview_updated') {
        scheduleControlReload();
        return;
      }
      if (message.type === 'external_timer_input') {
        applyExternalTimerInput(message);
        return;
      }
      if (message.type === 'external_timer_error') {
        showExternalTimerStatus(message.message || 'External timer input was ignored', 'error');
      }
    } catch (_err) {
      // ignore invalid websocket payloads
    }
  });

  ws.addEventListener('open', () => {
    wsConnected = true;
  });
  ws.addEventListener('close', () => {
    wsConnected = false;
    scheduleWsReconnect();
  });

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
  if (!controlLockOwned) return;
  clearTimeout(wsReconnectTimer);
  wsReconnectTimer = setTimeout(connectWs, 1500);
}

function render(data) {
  document.getElementById('ctrlEventName').textContent = data.eventName ?? '-';
  document.getElementById('ctrlHeatNo').textContent = data.heatNo ? String(data.heatNo) : '-';
  document.getElementById('ctrlStatus').textContent = String(data.status ?? '-').toUpperCase();
  const starterReadyEl = document.getElementById('ctrlStarterReady');
  if (starterReadyEl) {
    starterReadyEl.textContent = data.starterReady ? 'READY' : 'WAITING';
    starterReadyEl.classList.toggle('is-ready', Boolean(data.starterReady));
    starterReadyEl.classList.toggle('is-waiting', !data.starterReady);
  }
  document.getElementById('ctrlOverallBest').textContent = fmt(data.overallBest);
  document.getElementById('ctrlLastUpdate').textContent = data.lastUpdate ?? '-';

  document.getElementById('nowCard').textContent =
    data.nowRunningEntry ? `No.${data.nowRunningEntry.bibNo} ${data.nowRunningEntry.name}` : '-';
  document.getElementById('nextCard').textContent =
    data.nextEntry ? `No.${data.nextEntry.bibNo} ${data.nextEntry.name}` : '';

  const moveNextBtn = document.getElementById('moveNextBtn');
  const hasNext = Boolean(data.nextEntry?.id);
  if (moveNextBtn) moveNextBtn.disabled = !hasNext;

  const nextCard = document.getElementById('nextCard');
  if (nextCard) nextCard.classList.toggle('is-empty', !hasNext);

  document.getElementById('sumTotal').textContent = data.summary?.total ?? 0;
  document.getElementById('sumRanked').textContent = data.summary?.ranked ?? 0;
  document.getElementById('sumUnrun').textContent = data.summary?.unrun ?? 0;
  document.getElementById('sumLast').textContent = data.summary?.lastEntry ?? '-';

  document.querySelectorAll('[data-status]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.status === data.status);
  });

  const nextBtn = document.getElementById('nextBtn');
  if (nextBtn) nextBtn.disabled = !selectedEntry?.id && !data.nextEntry?.id;
}

function applyExternalTimerInput(message) {
  if (!selectedEntry?.id) {
    showExternalTimerStatus('外部タイムを受信しましたが、選択中の選手がいないため入力しませんでした。', 'warn');
    return;
  }

  const splitInput = document.getElementById('splitTime');
  const goalInput = document.getElementById('goalTime');
  if (splitInput) splitInput.value = message.splitTime || '';
  if (goalInput) goalInput.value = message.goalTime || '';
  scheduleOverlayPreviewSync();
  showExternalTimerStatus(
    `No.${selectedEntry.bibNo ?? '-'} ${selectedEntry.name ?? ''} に外部タイムを入力しました。 Split ${message.splitTime} / Goal ${message.goalTime}`,
    'success',
  );
}

function showExternalTimerStatus(message, tone = 'success') {
  const el = document.getElementById('externalTimerStatus');
  if (!el) return;
  clearTimeout(externalTimerNoticeTimer);
  el.hidden = false;
  el.textContent = message;
  el.className = `external-timer-status is-${tone}`;
  externalTimerNoticeTimer = setTimeout(() => {
    el.hidden = true;
  }, 7000);
}

function setSelectedEntry(entry, fillForm = true, syncPreview = true) {
  if (!entry) return;

  preferredSelectedEntryId = entry.id;
  selectedEntry = entry;
  document.getElementById('selName').textContent = entry.name ?? '-';
  document.getElementById('selBib').textContent = `No.${entry.bibNo ?? '-'}`;
  document.getElementById('selKana').textContent = entry.kana ?? '-';
  document.getElementById('selCar').textContent = `Car ${entry.carNo ?? '-'}`;
  document.getElementById('selOrder').textContent = `Order ${entry.order ?? entry.effectiveOrder ?? '-'}`;

  const knownRuns = controlState?.selectedEntryRuns && controlState?.selectedEntry?.id === entry.id
    ? controlState.selectedEntryRuns
    : null;

  if (knownRuns) {
    renderHistory(knownRuns);
  } else {
    loadEntryHistory(entry.id);
  }

  renderQueueList();

  if (fillForm) {
    const carInput = document.getElementById('carNoAtRun');
    if (carInput) carInput.value = entry.carNo ?? '';
  }

  if (syncPreview) scheduleOverlayPreviewSync();
  scheduleSelectionPreviewSync();
}

async function loadEntryHistory(entryId) {
  try {
    const res = await fetch(`/api/runs?entryId=${entryId}`, { cache: 'no-store' });
    const runs = await res.json();
    if (selectedEntry?.id === entryId) renderHistory(runs || []);
  } catch (err) {
    console.error(err);
    if (selectedEntry?.id === entryId) renderHistory([]);
  }
}

function clearSelectedEntry(syncPreview = true) {
  selectedEntry = null;
  preferredSelectedEntryId = null;
  document.getElementById('selName').textContent = '-';
  document.getElementById('selBib').textContent = 'No.-';
  document.getElementById('selKana').textContent = '-';
  document.getElementById('selCar').textContent = 'Car -';
  document.getElementById('selOrder').textContent = 'Order -';
  renderHistory([]);
  renderQueueList();
  if (syncPreview) scheduleOverlayPreviewSync();
  scheduleSelectionPreviewSync();
}

function renderHistory(runs) {
  const tbody = document.getElementById('historyBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!runs.length) {
    tbody.innerHTML = '<tr><td colspan="5">No runs yet</td></tr>';
    return;
  }

  for (const run of runs) {
    const tr = document.createElement('tr');
    tr.dataset.runId = run.id;
    tr.innerHTML = `
      <td>${escapeHtml(labelRunType(run.run_type))}</td>
      <td>${escapeHtml(fmt(run.split_ms))}</td>
      <td>${escapeHtml(fmt(run.goal_ms))}</td>
      <td>${escapeHtml(String(run.status || '-').toUpperCase())}</td>
      <td><button type="button" class="table-btn danger" data-action="delete-run">Delete</button></td>
    `;
    tbody.appendChild(tr);
  }
}

async function onHistoryClick(event) {
  const button = event.target.closest('button[data-action="delete-run"]');
  if (!button) return;

  const tr = event.target.closest('tr[data-run-id]');
  if (!tr) return;

  const runId = Number(tr.dataset.runId);
  if (!runId) return;
  if (!window.confirm('Delete this run?')) return;

  try {
    const res = await fetch(`/api/runs/${runId}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Failed to delete run');
      return;
    }
    await loadControlState(selectedEntry?.id ?? null);
  } catch (err) {
    console.error(err);
    alert('Failed to delete run');
  }
}

function renderQueueList() {
  const list = document.getElementById('queueList');
  if (!list) return;
  list.innerHTML = '';

  const keyword = (document.getElementById('entrySearch')?.value || '').trim().toLowerCase();
  const rows = (controlState?.queue || []).filter((row) => {
    if (!keyword) return true;
    return String(row.bibNo).includes(keyword)
      || String(row.name || '').toLowerCase().includes(keyword)
      || String(row.kana || '').toLowerCase().includes(keyword);
  });

  if (!rows.length) {
    list.innerHTML = '<li><span>-</span><strong>No match</strong></li>';
    return;
  }

  for (const row of rows) {
    const li = document.createElement('li');
    if (row.id === selectedEntry?.id) li.classList.add('active');
    if (row.isSkipped) li.classList.add('skipped');
    li.innerHTML = `<span>No.${escapeHtml(row.bibNo)}</span><strong>${escapeHtml(row.name || '-')}</strong>`;
    li.addEventListener('click', () => setSelectedEntry(row));
    list.appendChild(li);
  }
}

async function saveRun(options = {}) {
  const keepSelection = options.keepSelection !== false;

  if (!selectedEntry?.id) {
    alert('Select an entry first');
    return false;
  }

  const runType = getRunType();
  const splitResult = parseTimeInput(document.getElementById('splitTime')?.value ?? '', 'Split Time');
  if (splitResult.error) {
    alert(splitResult.error);
    return false;
  }

  const goalResult = parseTimeInput(document.getElementById('goalTime')?.value ?? '', 'Goal Time');
  if (goalResult.error) {
    alert(goalResult.error);
    return false;
  }

  if (splitResult.ms !== null && goalResult.ms !== null && splitResult.ms > goalResult.ms) {
    alert('Split Time must be less than or equal to Goal Time');
    return false;
  }

  const payload = {
    entryId: selectedEntry.id,
    heatId: controlState?.heatId ?? null,
    runType,
    splitMs: splitResult.ms,
    goalMs: goalResult.ms,
    status: document.getElementById('runStatus')?.value || 'finished',
    carNoAtRun: normalizeEmpty(document.getElementById('carNoAtRun')?.value),
    validForRanking: runType !== 'practice',
    validForDisplay: 1,
    note: normalizeEmpty(document.getElementById('runNote')?.value),
    replacesRunType: normalizeEmpty(document.getElementById('replaceTarget')?.value),
  };

  const res = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(json.error || 'Failed to save run');
    return false;
  }

  setRunType(runType);
  await loadControlState(keepSelection ? selectedEntry.id : null);
  scheduleOverlayPreviewSync();
  return true;
}

async function saveAndNext() {
  const currentEntryId = selectedEntry?.id ?? null;
  cancelScheduledControlReload();
  preferredSelectedEntryId = null;
  const ok = await saveRun({ keepSelection: false });
  if (!ok) return;
  await moveToNextDriver(currentEntryId);
}

function clearRunForm(resetRunType = false) {
  ['splitTime', 'goalTime', 'runNote'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const status = document.getElementById('runStatus');
  if (status) status.value = 'finished';
  if (resetRunType) setRunType('race1');
  scheduleOverlayPreviewSync();
}

function parseTimeInput(value, label) {
  const text = String(value || '').trim();
  if (!text) return { ms: null, error: null };
  if (!/^\d+(?::[0-5]?\d)?(?:\.\d{1,3})?$/.test(text)) {
    return { ms: null, error: `${label} must be ss.mmm or m:ss.mmm` };
  }
  if (text.includes(':')) {
    const [m, rest] = text.split(':');
    const [s, ms = '0'] = String(rest || '').split('.');
    return {
      ms: (Number(m) * 60 * 1000) + (Number(s) * 1000) + Number(String(ms).padEnd(3, '0').slice(0, 3)),
      error: null,
    };
  }
  const [s, ms = '0'] = text.split('.');
  return {
    ms: (Number(s) * 1000) + Number(String(ms).padEnd(3, '0').slice(0, 3)),
    error: null,
  };
}

function normalizeEmpty(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function labelRunType(value) {
  return ({ practice: 'Practice', race1: 'Race1', race2: 'Race2', rerun: 'Rerun' })[value] || value || '-';
}

function setRunType(value) {
  const nextValue = ({ practice: true, race1: true, race2: true, rerun: true })[value] ? value : 'race1';
  document.querySelectorAll('[data-run-type]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.runType === nextValue);
  });
  const hidden = document.getElementById('runType');
  if (hidden) hidden.value = nextValue;
  try {
    localStorage.setItem(RUN_TYPE_STORAGE_KEY, nextValue);
  } catch (_err) {
    // ignore storage failures
  }
}

function getRunType() {
  return document.getElementById('runType')?.value || 'race1';
}

function restoreRunType() {
  let stored = 'race1';
  try {
    stored = localStorage.getItem(RUN_TYPE_STORAGE_KEY) || 'race1';
  } catch (_err) {
    stored = 'race1';
  }
  setRunType(stored);
}

function scheduleOverlayPreviewSync() {
  clearTimeout(overlayPreviewSyncTimer);
  overlayPreviewSyncTimer = setTimeout(() => {
    syncOverlayPreview().catch((err) => {
      console.error(err);
    });
  }, 120);
}

function scheduleSelectionPreviewSync() {
  clearTimeout(selectionPreviewSyncTimer);
  selectionPreviewSyncTimer = setTimeout(() => {
    syncSelectionPreview().catch((err) => {
      console.error(err);
    });
  }, 180);
}

async function syncOverlayPreview() {
  if (!selectedEntry?.id) {
    await postJson('/api/control/overlay-preview', {});
    return;
  }

  const splitResult = parseTimeInput(document.getElementById('splitTime')?.value ?? '', 'Split Time');
  const goalResult = parseTimeInput(document.getElementById('goalTime')?.value ?? '', 'Goal Time');

  if (splitResult.error || goalResult.error) return;

  const hasAnyValue = splitResult.ms !== null || goalResult.ms !== null;
  await postJson('/api/control/overlay-preview', hasAnyValue ? {
    entryId: selectedEntry.id,
    splitMs: splitResult.ms,
    goalMs: goalResult.ms,
    status: document.getElementById('runStatus')?.value || 'finished',
  } : {});
}

async function syncSelectionPreview() {
  await postJson('/api/control/selection-preview', selectedEntry?.id ? {
    entryId: selectedEntry.id,
  } : {});
}

async function moveToNextDriver(currentEntryId = selectedEntry?.id ?? null) {
  cancelScheduledControlReload();
  preferredSelectedEntryId = null;
  if (currentEntryId) {
    await postJson('/api/control/action/set-now', { entryId: currentEntryId });
  }
  await postJson('/api/control/action/move-next', {});
  clearRunForm(false);
  const data = await loadControlState(null);
  const nextTarget = data?.nowRunningEntry?.id && data.nowRunningEntry.id !== currentEntryId
    ? data.nowRunningEntry
    : data?.nextEntry || data?.nowRunningEntry || null;
  if (nextTarget) setSelectedEntry(nextTarget);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
