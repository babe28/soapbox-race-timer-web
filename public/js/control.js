let controlState = null;
let selectedEntry = null;
let pollTimer = null;

const fmt = window.SoapboxCommon?.formatMs || ((v) => String(v ?? '-'));

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  loadControlState();

  if (!pollTimer) {
    pollTimer = setInterval(loadControlState, 1000);
  }
});

function bindEvents() {
  document.getElementById('saveBtn')?.addEventListener('click', saveRun);
  document.getElementById('saveNextBtn')?.addEventListener('click', saveAndNext);
  document.getElementById('resetBtn')?.addEventListener('click', clearRunForm);

  document.getElementById('nowCard')?.addEventListener('click', () => {
    if (controlState?.nowRunningEntry) setSelectedEntry(controlState.nowRunningEntry);
  });

  document.getElementById('nextCard')?.addEventListener('click', () => {
    if (controlState?.nextEntry) setSelectedEntry(controlState.nextEntry);
  });

  document.getElementById('moveNextBtn')?.addEventListener('click', async () => {
    await postJson('/api/control/action/move-next', {});
    await loadControlState();
  });

  document.getElementById('clearNowBtn')?.addEventListener('click', async () => {
    await postJson('/api/control/action/set-now', { entryId: null });
    await loadControlState();
  });

  document.getElementById('setNowBtn')?.addEventListener('click', async () => {
    if (!selectedEntry?.id) return alert('Select an entry first');
    await postJson('/api/control/action/set-now', { entryId: selectedEntry.id });
    await loadControlState();
  });

  document.getElementById('setNextBtn')?.addEventListener('click', async () => {
    if (!selectedEntry?.id) return alert('Select an entry first');
    await postJson('/api/control/action/set-next', { entryId: selectedEntry.id });
    await loadControlState();
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
    await loadControlState();
  });

  document.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await postJson('/api/control/action/status', { status: btn.dataset.status });
      await loadControlState();
    });
  });

  document.getElementById('entrySearch')?.addEventListener('input', renderQueueList);
  document.getElementById('historyBody')?.addEventListener('click', onHistoryClick);
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

async function loadControlState() {
  try {
    const res = await fetch('/api/control/state', { cache: 'no-store' });
    const data = await res.json();
    controlState = data;
    render(data);

    const currentSelectedId = selectedEntry?.id;
    const queueSelected = currentSelectedId
      ? data.queue?.find((q) => q.id === currentSelectedId)
      : null;

    if (queueSelected) {
      setSelectedEntry(queueSelected, false);
    } else if (data.selectedEntry?.id) {
      setSelectedEntry(data.selectedEntry, false);
    } else {
      clearSelectedEntry();
    }
  } catch (err) {
    console.error(err);
  }
}

function render(data) {
  document.getElementById('ctrlEventName').textContent = data.eventName ?? '-';
  document.getElementById('ctrlHeatNo').textContent = data.heatNo ? String(data.heatNo) : '-';
  document.getElementById('ctrlStatus').textContent = String(data.status ?? '-').toUpperCase();
  document.getElementById('ctrlOverallBest').textContent = fmt(data.overallBest);
  document.getElementById('ctrlLastUpdate').textContent = data.lastUpdate ?? '-';

  document.getElementById('nowCard').textContent =
    data.nowRunningEntry ? `No.${data.nowRunningEntry.bibNo} ${data.nowRunningEntry.name}` : '-';
  document.getElementById('nextCard').textContent =
    data.nextEntry ? `No.${data.nextEntry.bibNo} ${data.nextEntry.name}` : '-';

  document.getElementById('sumTotal').textContent = data.summary?.total ?? 0;
  document.getElementById('sumRanked').textContent = data.summary?.ranked ?? 0;
  document.getElementById('sumUnrun').textContent = data.summary?.unrun ?? 0;
  document.getElementById('sumLast').textContent = data.summary?.lastEntry ?? '-';

  document.querySelectorAll('[data-status]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.status === data.status);
  });

  renderHistory(data.selectedEntryRuns || []);
  renderQueueList();
}

function setSelectedEntry(entry, fillForm = true) {
  if (!entry) return;

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

function clearSelectedEntry() {
  selectedEntry = null;
  document.getElementById('selName').textContent = '-';
  document.getElementById('selBib').textContent = 'No.-';
  document.getElementById('selKana').textContent = '-';
  document.getElementById('selCar').textContent = 'Car -';
  document.getElementById('selOrder').textContent = 'Order -';
  renderHistory([]);
  renderQueueList();
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
      <td><button type="button" class="table-btn warn" data-action="delete-run">Delete</button></td>
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
    await loadControlState();
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

async function saveRun() {
  if (!selectedEntry?.id) {
    alert('Select an entry first');
    return false;
  }

  const runType = document.getElementById('runType')?.value || 'race1';
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

  await loadControlState();
  return true;
}

async function saveAndNext() {
  const ok = await saveRun();
  if (!ok) return;
  await postJson('/api/control/action/move-next', {});
  clearRunForm();
  await loadControlState();
}

function clearRunForm() {
  ['splitTime', 'goalTime', 'runNote'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const status = document.getElementById('runStatus');
  if (status) status.value = 'finished';
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
