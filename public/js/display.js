(async function () {
  const body = document.body;
  const app = document.getElementById('displayApp');
  const rowElements = new Map();
  let pollTimer = null;
  let pollRequestId = 0;
  let currentPollController = null;
  let clockTimer = null;
  let localConnectionOk = true;
  const ROW_HIGHLIGHT_MS = 100000;
  const TIME_FLASH_MS = 40000;
  const BEST_MARK_MS = 30000;

  async function loadDisplay() {
    const requestId = ++pollRequestId;
    currentPollController?.abort();
    currentPollController = new AbortController();

    try {
      const res = await fetch('/api/display/current', {
        cache: 'no-store',
        signal: currentPollController.signal,
      });
      const data = await res.json();
      if (requestId !== pollRequestId) return;
      localConnectionOk = true;
      render(data);
    } catch (err) {
      if (err.name === 'AbortError') return;
      localConnectionOk = false;
      renderConnection(false);
      console.error(err);
      if (!document.getElementById('displayLoadError')) {
        app.insertAdjacentHTML('beforeend', '<div id="displayLoadError" style="padding:20px;color:#ff6a7d;">Failed to load display data</div>');
      }
    } finally {
      if (requestId === pollRequestId) {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(loadDisplay, 1000);
      }
    }
  }

  function render(data) {
    const labels = data.labels || {};
    document.getElementById('labelEvent').textContent = labels.event || 'Event';
    document.getElementById('labelHeat').textContent = labels.heat || 'Heat';
    document.getElementById('labelStatus').textContent = labels.status || 'Status';
    document.getElementById('labelLastUpdate').textContent = labels.lastUpdate || 'Last Update';
    document.getElementById('labelClock').textContent = labels.clock || 'Clock';
    document.getElementById('labelOverallBest').textContent = labels.overallBest || 'Overall Best';
    document.getElementById('labelNowRunning').textContent = labels.nowRunning || 'Now Running';
    document.getElementById('labelNext').textContent = labels.next || 'Next';
    document.getElementById('labelConnection').textContent = labels.connection || 'Connection';
    document.getElementById('thRunStatus').textContent = labels.runStatus || 'Status';
    document.getElementById('thPos').textContent = labels.pos || 'Pos';
    document.getElementById('thNo').textContent = labels.no || 'No';
    document.getElementById('thName').textContent = labels.name || 'Name';
    document.getElementById('thKana').textContent = labels.kana || 'Kana';
    document.getElementById('thCar').textContent = labels.car || 'Car';
    document.getElementById('thMemo').textContent = data.settings?.memoTitle || labels.memo || 'Memo';
    document.getElementById('thPractice').textContent = labels.practice || 'Practice';
    document.getElementById('thR1Split').textContent = labels.r1Split || 'R1-Sec';
    document.getElementById('thR1Goal').textContent = labels.r1Goal || 'R1-Goal';
    document.getElementById('thR2Split').textContent = labels.r2Split || 'R2-Sec';
    document.getElementById('thR2Goal').textContent = labels.r2Goal || 'R2-Goal';
    document.getElementById('thBest').textContent = labels.best || 'Best';

    document.getElementById('eventName').textContent = data.header?.eventName || '-';
    document.getElementById('heatNo').textContent = data.header?.heat ? String(data.header.heat) : '-';
    document.getElementById('statusText').textContent = data.header?.status || '-';
    document.getElementById('lastUpdate').textContent = data.header?.lastUpdate || '-';
    syncClock(data.header?.clock);
    document.getElementById('overallBest').textContent = data.header?.overallBest || '--.---';
    document.getElementById('nowRunning').textContent = data.nowRunning || '-';
    document.getElementById('nextRunning').textContent = data.next || '-';

    const liveState = document.getElementById('liveState');
    if (liveState) {
      liveState.classList.remove('is-pulse');
      void liveState.offsetWidth;
      liveState.classList.add('is-pulse');
    }

    renderConnection(localConnectionOk && !!data.connection?.connected);

    body.classList.toggle('mode-30', data.settings?.rowsPerPage === 30);
    body.classList.toggle('hide-split', !data.settings?.showSplit);
    body.classList.toggle('practice-only', data.mode === 'practice');
    body.classList.toggle('hide-kana', !data.settings?.showKana);
    body.classList.toggle('hide-car', !data.settings?.showCarNo);
    body.classList.toggle('hide-memo', !data.settings?.showMemo);
    body.classList.toggle('hide-practice', !data.settings?.showPractice && data.mode !== 'practice');
    body.classList.toggle('hide-clock', !data.settings?.showClock);
    body.classList.toggle('hide-last-update', !data.settings?.showLastUpdate);
    body.classList.toggle('hide-overall-best', !data.settings?.showOverallBest);

    syncRows(data.rows || []);
  }

  function syncRows(rows) {
    const tbody = document.getElementById('resultsBody');
    const seenKeys = new Set();

    for (const row of rows) {
      const key = String(row.bibNo ?? row.name ?? '');
      seenKeys.add(key);

      let tr = rowElements.get(key);
      if (!tr) {
        tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="cell-run-status" data-cell="status"><span class="status-flag status-empty"></span></td>
          <td data-cell="rank"></td>
          <td data-cell="bibNo"></td>
          <td class="cell-name" data-cell="name"></td>
          <td class="cell-kana" data-cell="kana"></td>
          <td class="cell-car" data-cell="carNo"></td>
          <td class="cell-memo" data-cell="memo"></td>
          <td class="cell-practice" data-cell="practice"></td>
          <td class="cell-split race-col" data-cell="r1split"></td>
          <td class="race-col" data-cell="r1goal"></td>
          <td class="cell-split race-col" data-cell="r2split"></td>
          <td class="race-col" data-cell="r2goal"></td>
          <td class="cell-best race-col" data-cell="best"></td>
        `;
        rowElements.set(key, tr);
      }

      updateRow(tr, row);
      tbody.appendChild(tr);
    }

    for (const [key, tr] of rowElements.entries()) {
      if (seenKeys.has(key)) continue;
      tr.remove();
      rowElements.delete(key);
    }
  }

  function updateRow(tr, row) {
    tr.classList.toggle('highlight', row.highlight || isRecent(row.highlightUpdatedAt, ROW_HIGHLIGHT_MS));
    tr.classList.toggle('unrun', !row.rank);

    setCell(tr, 'status', row.status || '', '', row.statusTone ? `status-${row.statusTone}` : 'status-empty');
    setCell(tr, 'rank', row.rank || '');
    setCell(tr, 'bibNo', row.bibNo || '');
    setCell(tr, 'name', row.name || '');
    setCell(tr, 'kana', row.kana || '');
    setCell(tr, 'carNo', row.carNo || '');
    setCell(tr, 'memo', row.memo || '');
    setCell(tr, 'practice', row.practice || '--.---', enteredClass(row.practiceUpdatedAt));
    setCell(tr, 'r1split', row.r1?.split || '--.---', enteredClass(row.r1?.updatedAt));
    setCell(tr, 'r1goal', row.r1?.goal || '--.---', enteredClass(row.r1?.updatedAt));
    setCell(tr, 'r2split', row.r2?.split || '--.---', enteredClass(row.r2?.updatedAt));
    setCell(tr, 'r2goal', row.r2?.goal || '--.---', enteredClass(row.r2?.updatedAt));
    setCell(tr, 'best', row.best || '--.---', bestClass(row.bestUpdatedAt));
  }

  function setCell(tr, name, value, extraClass = '', toneClass = '') {
    const td = tr.querySelector(`[data-cell="${name}"]`);
    if (!td) return;

    if (name === 'status') {
      const flag = td.querySelector('.status-flag');
      if (!flag) return;
      flag.textContent = value;
      flag.className = `status-flag ${toneClass || 'status-empty'}`.trim();
      return;
    }

    td.textContent = value;
    td.classList.toggle('time-entered', extraClass === 'time-entered');
    td.classList.toggle('time-best', extraClass === 'time-best');
  }

  function enteredClass(updatedAt) {
    return isRecent(updatedAt, TIME_FLASH_MS) ? 'time-entered' : '';
  }

  function bestClass(updatedAt) {
    return isRecent(updatedAt, BEST_MARK_MS) ? 'time-best' : '';
  }

  function isRecent(updatedAt, windowMs) {
    const ts = parseTimestamp(updatedAt);
    const age = ts === null ? Number.POSITIVE_INFINITY : Date.now() - ts;
    return age >= 0 && age <= windowMs;
  }

  function parseTimestamp(value) {
    if (!value) return null;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }

  function syncClock(fallbackText) {
    updateClock(fallbackText);
    if (clockTimer) return;
    clockTimer = setInterval(() => updateClock(fallbackText), 1000);
  }

  function updateClock(fallbackText) {
    const now = new Date();
    const text = now.toLocaleTimeString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    document.getElementById('clockText').textContent = text || fallbackText || '-';
  }

  function renderConnection(connected) {
    const connectionEl = document.getElementById('connectionState');
    if (!connectionEl) return;
    connectionEl.textContent = connected ? 'CONNECTED' : 'DISCONNECTED';
    connectionEl.className = connected ? 'footer-value connection-ok' : 'footer-value connection-ng';
  }

  await loadDisplay();
})();
