(async function () {
  const { formatMs } = window.SoapboxCommon;
  const tbody = document.getElementById('overviewBody');
  const sumTotal = document.getElementById('sumTotal');
  const connectionState = document.getElementById('connectionState');
  let ws = null;
  let wsReconnectTimer = null;
  let reloadTimer = null;

  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadData, 100);
  }

  async function loadData() {
    try {
      const [entriesRes, displayRes] = await Promise.all([
        fetch('/api/entries?includeRuns=true', { cache: 'no-store' }),
        fetch('/api/display/current', { cache: 'no-store' })
      ]);
      const entries = await entriesRes.json();
      const displayData = await displayRes.json();
      render(entries, displayData);
    } catch (err) {
      console.error(err);
      tbody.innerHTML = '<tr><td colspan="16" class="empty-cell" style="color:#e53e3e;">Failed to load data</td></tr>';
    }
  }

  function render(entries, displayData) {
    const labels = displayData.labels || {};
    const practiceDisplayMode = displayData.mode === 'practice';
    
    // Update headers based on localization
    document.getElementById('thGroupPractice1').textContent = labels.p1 || 'Practice 1';
    document.getElementById('thGroupPractice2').textContent = labels.p2 || 'Practice 2';
    document.getElementById('thGroupPractice3').textContent = labels.p3 || 'Practice 3';
    document.getElementById('thGroupPractice4').textContent = labels.p4 || 'Practice 4';
    document.getElementById('thR1Split').textContent = labels.r1Split || 'R1-Sec';
    document.getElementById('thR1Goal').textContent = labels.r1Goal || 'R1-Goal';
    document.getElementById('thR2Split').textContent = labels.r2Split || 'R2-Sec';
    document.getElementById('thR2Goal').textContent = labels.r2Goal || 'R2-Goal';
    document.getElementById('thBest').textContent = labels.best || 'Best Time';

    sumTotal.textContent = entries.length;

    // Process entries and their runs
    const processedEntries = entries.map(entry => {
      const runs = (entry.runs || []).filter(r => r.status === 'finished' && r.goal_ms !== null);
      
      // Sort practice runs chronologically (oldest first)
      const practiceRuns = runs.filter(r => r.run_type === 'practice').sort((a, b) => {
        return new Date(a.created_at) - new Date(b.created_at);
      });
      // Get the latest valid race1/race2 run
      const r1 = runs.filter(r => r.run_type === 'race1').sort((a, b) => b.id - a.id)[0] || null;
      const r2 = runs.filter(r => r.run_type === 'race2').sort((a, b) => b.id - a.id)[0] || null;

      let bestMs = Infinity;
      if (practiceDisplayMode) {
        for (const pr of practiceRuns) {
          if (pr.goal_ms < bestMs) bestMs = pr.goal_ms;
        }
      } else {
        const validRaceRuns = runs.filter(r => r.valid_for_ranking === 1);
        for (const r of validRaceRuns) {
          if (r.goal_ms < bestMs) bestMs = r.goal_ms;
        }
      }
      
      return {
        ...entry,
        practiceRuns: practiceRuns.slice(0, 4), // max 4 for the table columns
        r1,
        r2,
        bestMs: bestMs === Infinity ? null : bestMs
      };
    });

    // Sort by best time, then effective_order
    processedEntries.sort((a, b) => {
      if (a.bestMs === null && b.bestMs !== null) return 1;
      if (b.bestMs === null && a.bestMs !== null) return -1;
      if (a.bestMs !== b.bestMs) return a.bestMs - b.bestMs;
      return a.effective_order - b.effective_order;
    });

    if (processedEntries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="16" class="empty-cell">No entries found</td></tr>';
      return;
    }

    const html = processedEntries.map((entry, index) => {
      let rank = entry.bestMs !== null ? index + 1 : '-';
      
      const p1 = entry.practiceRuns[0] || {};
      const p2 = entry.practiceRuns[1] || {};
      const p3 = entry.practiceRuns[2] || {};
      const p4 = entry.practiceRuns[3] || {};

      const renderTime = (val) => {
        if (val == null) return `<span class="time-empty">--.---</span>`;
        return `<span class="time-value">${formatMs(val)}</span>`;
      };

      return `
        <tr>
          <td class="col-rank">${rank}</td>
          <td class="col-bib">${entry.bib_no}</td>
          <td class="col-name">${escapeHtml(entry.name)}</td>
          <td>${renderTime(p1.split_ms)}</td>
          <td>${renderTime(p1.goal_ms)}</td>
          <td>${renderTime(p2.split_ms)}</td>
          <td>${renderTime(p2.goal_ms)}</td>
          <td>${renderTime(p3.split_ms)}</td>
          <td>${renderTime(p3.goal_ms)}</td>
          <td>${renderTime(p4.split_ms)}</td>
          <td>${renderTime(p4.goal_ms)}</td>
          <td>${renderTime(entry.r1?.split_ms)}</td>
          <td>${renderTime(entry.r1?.goal_ms)}</td>
          <td>${renderTime(entry.r2?.split_ms)}</td>
          <td>${renderTime(entry.r2?.goal_ms)}</td>
          <td class="col-best">${renderTime(entry.bestMs)}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
        if (message.type === 'run_updated' || message.type === 'entry_updated' || message.type === 'display_update') {
          scheduleReload();
        }
      } catch (_err) {
        // ignore
      }
    });

    ws.addEventListener('open', () => {
      connectionState.textContent = 'Connected';
      connectionState.className = 'connection-status connected';
      scheduleReload();
    });

    ws.addEventListener('close', () => {
      connectionState.textContent = 'Disconnected';
      connectionState.className = 'connection-status';
      scheduleWsReconnect();
    });

    ws.addEventListener('error', () => {
      try { ws?.close(); } catch (_err) { /* ignore */ }
    });
  }

  function scheduleWsReconnect() {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectWs, 1500);
  }

  connectWs();
  loadData();
})();
