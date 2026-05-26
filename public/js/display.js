(async function () {
  const body = document.body;
  const app = document.getElementById('displayApp');
  const isLiteMode = new URLSearchParams(window.location.search).get('mode') === 'lite';
  const rowElements = new Map();
  let pollTimer = null;
  let pollRequestId = 0;
  let currentPollController = null;
  let clockTimer = null;
  let ws = null;
  let wsReconnectTimer = null;
  let scheduledLoadTimer = null;
  let wsConnected = false;
  let shouldPulseLiveState = false;
  let localConnectionOk = true;
  let currentPageIndex = 0;
  let lastPageSignature = '';
  let lastPageAdvanceAt = 0;

  // Durations are in milliseconds. 1000 = 1 second.
  const ROW_HIGHLIGHT_MS = 16000; //16sec
  const TIME_FLASH_MS = 20000; //20sec
  const BEST_MARK_MS = 30000; //30sec
  const SLIDE_MODE_PAGE_SIZE = 15;
  const DEFAULT_SLIDE_MODE_PAGE_MS = 7000;
  const CONNECTED_POLL_MS = 4000;
  const FALLBACK_POLL_MS = 1000;

  body.classList.toggle('bs-lite', isLiteMode);

  function scheduleLoadDisplay(delay = 80) {
    clearTimeout(scheduledLoadTimer);
    scheduledLoadTimer = setTimeout(() => {
      scheduledLoadTimer = null;
      loadDisplay();
    }, delay);
  }

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
      document.getElementById('displayLoadError')?.remove();
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
        pollTimer = setTimeout(loadDisplay, wsConnected ? CONNECTED_POLL_MS : FALLBACK_POLL_MS);
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
          || message.type === 'settings_updated'
          || message.type === 'state_update'
          || message.type === 'entry_updated') {
          shouldPulseLiveState = true;
          scheduleLoadDisplay();
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
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(connectWs, 1500);
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
    document.getElementById('thPractice1').textContent = labels.p1 || 'P1';
    document.getElementById('thPractice2').textContent = labels.p2 || 'P2';
    document.getElementById('thPractice3').textContent = labels.p3 || 'P3';
    document.getElementById('thPractice4').textContent = labels.p4 || 'P4';
    document.getElementById('thR1Split').textContent = labels.r1Split || 'R1-Sec';
    document.getElementById('thR1Goal').textContent = labels.r1Goal || 'R1-Goal';
    document.getElementById('thR2Split').textContent = labels.r2Split || 'R2-Sec';
    document.getElementById('thR2Goal').textContent = labels.r2Goal || 'R2-Goal';
    document.getElementById('thDelta').textContent = labels.delta || 'Diff';
    document.getElementById('thBest').textContent = labels.best || 'Best';

    document.getElementById('eventName').textContent = data.header?.eventName || '-';
    document.getElementById('className').textContent = data.header?.className || '';
    document.getElementById('heatNo').textContent = data.header?.heat ? String(data.header.heat) : '-';
    document.getElementById('statusText').textContent = data.header?.status || '-';
    document.getElementById('lastUpdate').textContent = data.header?.lastUpdate || '-';
    syncClock(data.header?.clock);
    document.getElementById('overallBest').textContent = data.header?.overallBest || '--.---';
    document.getElementById('nowRunning').textContent = data.nowRunning || '-';
    document.getElementById('nextRunning').textContent = data.next || '-';

    const liveState = document.getElementById('liveState');
    if (liveState && shouldPulseLiveState) {
      if (isLiteMode) {
        liveState.classList.remove('is-pulse');
      } else {
        liveState.classList.remove('is-pulse');
        void liveState.offsetWidth;
        liveState.classList.add('is-pulse');
      }
      shouldPulseLiveState = false;
    }

    renderConnection(localConnectionOk && !!data.connection?.connected);

    const urlParams = new URLSearchParams(window.location.search);
    const isPortrait = urlParams.get('layout') === 'portrait';
    const rowsPerPage = isPortrait ? 18 : Number(data.settings?.rowsPerPage || 20);
    body.classList.toggle('mode-15-slide', rowsPerPage === 15);
    body.classList.toggle('mode-30', rowsPerPage === 30);
    body.classList.toggle('mode-35', rowsPerPage === 35);
    body.classList.toggle('mode-40', rowsPerPage === 40);
    body.classList.toggle('mode-portrait', rowsPerPage === 18);
    body.classList.toggle('hide-split', !data.settings?.showSplit);
    body.classList.toggle('practice-only', data.mode === 'practice');
    body.classList.toggle('hide-kana', !data.settings?.showKana);
    body.classList.toggle('hide-car', !data.settings?.showCarNo);
    body.classList.toggle('hide-memo', !data.settings?.showMemo);
    body.classList.toggle('hide-practice', !data.settings?.showPractice && data.mode !== 'practice');
    body.classList.toggle('practice-history-mode', data.mode === 'practice');
    body.classList.toggle('hide-delta', !data.settings?.showDelta);
    body.classList.toggle('hide-clock', !data.settings?.showClock);
    body.classList.toggle('hide-last-update', !data.settings?.showLastUpdate);
    body.classList.toggle('hide-overall-best', !data.settings?.showOverallBest);

    syncRows(resolveVisibleRows(data.rows || [], rowsPerPage, Number(data.settings?.slidePageMs || DEFAULT_SLIDE_MODE_PAGE_MS)));
  }

  function resolveVisibleRows(rows, rowsPerPage, slidePageMs) {
    if (rowsPerPage !== SLIDE_MODE_PAGE_SIZE) {
      currentPageIndex = 0;
      lastPageSignature = '';
      lastPageAdvanceAt = 0;
      body.dataset.page = '1';
      body.dataset.pageCount = '1';
      return { rows, animatePage: false };
    }

    const pages = chunkRows(rows, SLIDE_MODE_PAGE_SIZE);
    if (!pages.length) {
      currentPageIndex = 0;
      lastPageSignature = '';
      lastPageAdvanceAt = 0;
      body.dataset.page = '1';
      body.dataset.pageCount = '1';
      return { rows: [], animatePage: false };
    }

    const signature = pages.map((page) => page.map((row) => row.bibNo).join(',')).join('|');
    let pageChanged = false;
    if (signature !== lastPageSignature) {
      currentPageIndex = 0;
      lastPageSignature = signature;
      lastPageAdvanceAt = Date.now();
      pageChanged = true;
    } else if (currentPageIndex >= pages.length) {
      currentPageIndex = 0;
      lastPageAdvanceAt = Date.now();
      pageChanged = true;
    } else if (pages.length > 1 && (Date.now() - lastPageAdvanceAt) >= slidePageMs) {
      currentPageIndex = (currentPageIndex + 1) % pages.length;
      lastPageAdvanceAt = Date.now();
      pageChanged = true;
    }

    body.dataset.page = String(currentPageIndex + 1);
    body.dataset.pageCount = String(pages.length);

    return {
      rows: pages[currentPageIndex],
      animatePage: pageChanged,
    };
  }

  function chunkRows(rows, size) {
    const pages = [];
    for (let index = 0; index < rows.length; index += size) {
      pages.push(rows.slice(index, index + size));
    }
    return pages;
  }

  function syncRows(view) {
    const rows = view.rows || [];
    const animatePage = Boolean(view.animatePage);
    const tbody = document.getElementById('resultsBody');
    const seenKeys = new Set();

    rows.forEach((row, index) => {
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
          <td class="cell-practice practice-best-col" data-cell="practice"></td>
          <td class="cell-practice-attempt practice-attempt-col" data-cell="practice1"></td>
          <td class="cell-practice-attempt practice-attempt-col" data-cell="practice2"></td>
          <td class="cell-practice-attempt practice-attempt-col" data-cell="practice3"></td>
          <td class="cell-practice-attempt practice-attempt-col" data-cell="practice4"></td>
          <td class="cell-split race-col" data-cell="r1split"></td>
          <td class="race-col" data-cell="r1goal"></td>
          <td class="cell-split race-col" data-cell="r2split"></td>
          <td class="race-col" data-cell="r2goal"></td>
          <td class="cell-delta race-col" data-cell="delta"></td>
          <td class="cell-best race-col" data-cell="best"></td>
        `;
        rowElements.set(key, tr);
      }

      updateRow(tr, row);
      tbody.appendChild(tr);
    });

    for (const [key, tr] of rowElements.entries()) {
      if (seenKeys.has(key)) continue;
      tr.remove();
      rowElements.delete(key);
    }

    if (animatePage) {
      if (isLiteMode) {
        tbody.classList.remove('page-slide-in');
      } else {
        tbody.classList.remove('page-slide-in');
        void tbody.offsetWidth;
        tbody.classList.add('page-slide-in');
      }
    } else {
      tbody.classList.remove('page-slide-in');
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
    const practiceBestGoal = row.practice?.goal || '--.---';
    const practiceBestText = row.practice?.split ? `${row.practice.split}\n${practiceBestGoal}` : practiceBestGoal;
    setCell(tr, 'practice', practiceBestText, enteredClass(row.practiceUpdatedAt));
    const practiceRuns = Array.isArray(row.practiceRuns) ? row.practiceRuns : [];
    for (let index = 0; index < 4; index += 1) {
      const practiceRun = practiceRuns[index] || null;
      const pGoal = practiceRun?.goal || '--.---';
      const pText = practiceRun?.split ? `${practiceRun.split}\n${pGoal}` : pGoal;
      setCell(tr, `practice${index + 1}`, pText, enteredClass(practiceRun?.updatedAt));
    }
    setCell(tr, 'r1split', row.r1?.split || '--.---', enteredClass(row.r1?.updatedAt));
    setCell(tr, 'r1goal', row.r1?.goal || '--.---', `${enteredClass(row.r1?.updatedAt)} ${row.r1?.faster ? 'time-faster' : ''}`.trim());
    setCell(tr, 'r2split', row.r2?.split || '--.---', enteredClass(row.r2?.updatedAt));
    setCell(tr, 'r2goal', row.r2?.goal || '--.---', `${enteredClass(row.r2?.updatedAt)} ${row.r2?.faster ? 'time-faster' : ''}`.trim());
    setCell(tr, 'delta', row.delta || '--.---', deltaClass(row.delta));
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

    if (name.startsWith('practice') && value.includes('\n')) {
      const parts = value.split('\n');
      td.innerHTML = `<span class="split-time">${parts[0]}</span><span class="goal-time">${parts[1]}</span>`;
    } else {
      td.textContent = value;
    }
    
    td.classList.toggle('time-entered', extraClass.includes('time-entered'));
    td.classList.toggle('time-best', extraClass.includes('time-best'));
    td.classList.toggle('time-faster', extraClass.includes('time-faster'));
    td.classList.toggle('delta-positive', extraClass.includes('delta-positive'));
    td.classList.toggle('delta-negative', extraClass.includes('delta-negative'));
  }

  function enteredClass(updatedAt) {
    return isRecent(updatedAt, TIME_FLASH_MS) ? 'time-entered' : '';
  }

  function bestClass(updatedAt) {
    return isRecent(updatedAt, BEST_MARK_MS) ? 'time-best' : '';
  }

  function deltaClass(value) {
    const text = String(value || '');
    if (text.startsWith('+')) return 'delta-positive';
    if (text.startsWith('-')) return 'delta-negative';
    return '';
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
  connectWs();
})();
