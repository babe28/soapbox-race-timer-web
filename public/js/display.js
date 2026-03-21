(async function () {
  const common = window.SoapboxCommon;
  const body = document.body;
  const app = document.getElementById('displayApp');
  let pollTimer = null;

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
    document.getElementById('eventName').textContent = data.header?.eventName || '-';
    document.getElementById('heatNo').textContent = data.header?.heat ? `HEAT ${data.header.heat}` : 'HEAT -';
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

    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';

    for (const row of data.rows || []) {
      const tr = document.createElement('tr');
      if (row.highlight) tr.classList.add('highlight');
      if (!row.rank) tr.classList.add('unrun');
      tr.innerHTML = `
        <td>${escapeHtml(row.rank || '')}</td>
        <td>${escapeHtml(row.bibNo || '')}</td>
        <td class="cell-name">${escapeHtml(row.name || '')}</td>
        <td class="cell-kana">${escapeHtml(row.kana || '')}</td>
        <td>${escapeHtml(row.carNo || '')}</td>
        <td>${escapeHtml(row.practice || '--.---')}</td>
        <td class="cell-split">${escapeHtml(row.r1?.split || '--.---')}</td>
        <td>${escapeHtml(row.r1?.goal || '--.---')}</td>
        <td class="cell-split">${escapeHtml(row.r2?.split || '--.---')}</td>
        <td>${escapeHtml(row.r2?.goal || '--.---')}</td>
        <td class="cell-best">${escapeHtml(row.best || '--.---')}</td>
      `;
      tbody.appendChild(tr);
    }
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
