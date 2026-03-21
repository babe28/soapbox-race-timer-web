(async function () {
  const common = window.SoapboxCommon;
  const body = document.body;
  const app = document.getElementById('displayApp');
  let pollTimer = null;
  const ROW_HIGHLIGHT_MS = 30000;
  const TIME_FLASH_MS = 30000;
  const BEST_MARK_MS = 30000;

  async function loadDisplay() {
    try {
      const res = await fetch('/api/display/current', { cache: 'no-store' });
      const data = await res.json();
      render(data);
    } catch (err) {
      console.error(err);
      if (!document.getElementById('displayLoadError')) {
        app.insertAdjacentHTML('beforeend', '<div id="displayLoadError" style="padding:20px;color:#ff6a7d;">Failed to load display data</div>');
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
    document.getElementById('thPos').textContent = labels.pos || 'Pos';
    document.getElementById('thNo').textContent = labels.no || 'No';
    document.getElementById('thName').textContent = labels.name || 'Name';
    document.getElementById('thKana').textContent = labels.kana || 'Kana';
    document.getElementById('thCar').textContent = labels.car || 'Car';
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
    document.getElementById('clockText').textContent = data.header?.clock || '-';
    document.getElementById('overallBest').textContent = data.header?.overallBest || '--.---';
    document.getElementById('nowRunning').textContent = data.nowRunning || '-';
    document.getElementById('nextRunning').textContent = data.next || '-';

    const connectionEl = document.getElementById('connectionState');
    const connected = !!data.connection?.connected;
    connectionEl.textContent = connected ? 'CONNECTED' : 'DISCONNECTED';
    connectionEl.className = connected ? 'footer-value connection-ok' : 'footer-value connection-ng';

    body.classList.toggle('mode-30', data.settings?.rowsPerPage === 30);
    body.classList.toggle('hide-split', !data.settings?.showSplit);
    body.classList.toggle('practice-only', data.mode === 'practice');
    body.classList.toggle('hide-kana', !data.settings?.showKana);
    body.classList.toggle('hide-car', !data.settings?.showCarNo);
    body.classList.toggle('hide-practice', !data.settings?.showPractice && data.mode !== 'practice');
    body.classList.toggle('hide-clock', !data.settings?.showClock);
    body.classList.toggle('hide-last-update', !data.settings?.showLastUpdate);
    body.classList.toggle('hide-overall-best', !data.settings?.showOverallBest);

    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';

    for (const row of data.rows || []) {
      const tr = document.createElement('tr');
      if (row.highlight || isRecent(row.highlightUpdatedAt, ROW_HIGHLIGHT_MS)) tr.classList.add('highlight');
      if (!row.rank) tr.classList.add('unrun');
      tr.innerHTML = `
        <td>${escapeHtml(row.rank || '')}</td>
        <td>${escapeHtml(row.bibNo || '')}</td>
        <td class="cell-name">${escapeHtml(row.name || '')}</td>
        <td class="cell-kana">${escapeHtml(row.kana || '')}</td>
        <td class="cell-car">${escapeHtml(row.carNo || '')}</td>
        <td class="cell-practice ${enteredClass(row.practiceUpdatedAt)}">${escapeHtml(row.practice || '--.---')}</td>
        <td class="cell-split race-col ${enteredClass(row.r1?.updatedAt)}">${escapeHtml(row.r1?.split || '--.---')}</td>
        <td class="race-col ${enteredClass(row.r1?.updatedAt)}">${escapeHtml(row.r1?.goal || '--.---')}</td>
        <td class="cell-split race-col ${enteredClass(row.r2?.updatedAt)}">${escapeHtml(row.r2?.split || '--.---')}</td>
        <td class="race-col ${enteredClass(row.r2?.updatedAt)}">${escapeHtml(row.r2?.goal || '--.---')}</td>
        <td class="cell-best race-col ${bestClass(row.bestUpdatedAt)}">${escapeHtml(row.best || '--.---')}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function enteredClass(updatedAt) {
    if (!isRecent(updatedAt, TIME_FLASH_MS)) return '';
    return 'time-entered';
  }

  function bestClass(updatedAt) {
    if (!isRecent(updatedAt, BEST_MARK_MS)) return '';
    return 'time-best';
  }

  function isRecent(updatedAt, windowMs) {
    const ts = parseTimestamp(updatedAt);
    return ts !== null && (Date.now() - ts) >= 0 && (Date.now() - ts) <= windowMs;
  }

  function parseTimestamp(value) {
    if (!value) return null;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  await loadDisplay();
  if (!pollTimer) pollTimer = setInterval(loadDisplay, 1000);
})();
