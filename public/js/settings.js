const settingsEls = {};

const API_CATEGORY_LABELS = {
  system: 'システム',
  settings: '設定',
  entries: 'エントリー',
  runs: '走行データ',
  display: '表示',
  control: 'レース操作',
};

document.addEventListener('DOMContentLoaded', () => {
  bindSettingsElements();
  bindSettingsEvents();
  loadAll();
});

function bindSettingsElements() {
  settingsEls.form = document.getElementById('settingsForm');
  settingsEls.eventName = document.getElementById('eventName');
  settingsEls.className = document.getElementById('className');
  settingsEls.language = document.getElementById('language');
  settingsEls.autoBackupIntervalMin = document.getElementById('autoBackupIntervalMin');
  settingsEls.slidePageSeconds = document.getElementById('slidePageSeconds');
  settingsEls.clearRunsBtn = document.getElementById('clearRunsBtn');
  settingsEls.clearLogsBtn = document.getElementById('clearLogsBtn');
  settingsEls.showKana = document.getElementById('showKana');
  settingsEls.showCarNo = document.getElementById('showCarNo');
  settingsEls.showPractice = document.getElementById('showPractice');
  settingsEls.showMemo = document.getElementById('showMemo');
  settingsEls.showSplit = document.getElementById('showSplit');
  settingsEls.showDelta = document.getElementById('showDelta');
  settingsEls.showClock = document.getElementById('showClock');
  settingsEls.showLastUpdate = document.getElementById('showLastUpdate');
  settingsEls.showOverallBest = document.getElementById('showOverallBest');
  settingsEls.overallBestIncludePractice = document.getElementById('overallBestIncludePractice');
  settingsEls.showEffects = document.getElementById('showEffects');
  settingsEls.anonymousEntryMode = document.getElementById('anonymousEntryMode');
  settingsEls.memoTitle = document.getElementById('memoTitle');
  settingsEls.clientList = document.getElementById('clientList');
  settingsEls.auditLogs = document.getElementById('auditLogs');
  settingsEls.apiCatalog = document.getElementById('apiCatalog');
  settingsEls.reloadSettingsBtn = document.getElementById('reloadSettingsBtn');
  settingsEls.resetDbBtn = document.getElementById('resetDbBtn');
  settingsEls.exportCsvBtn = document.getElementById('exportCsvBtn');
  settingsEls.reloadLogsBtn = document.getElementById('reloadLogsBtn');
  settingsEls.reloadApisBtn = document.getElementById('reloadApisBtn');
  settingsEls.serverAddress = document.getElementById('settingsServerAddress');
  settingsEls.serverAddressList = document.getElementById('settingsServerAddressList');
  settingsEls.serverOrigin = document.getElementById('settingsServerOrigin');
}

function bindSettingsEvents() {
  settingsEls.form?.addEventListener('submit', saveSettings);
  settingsEls.reloadSettingsBtn?.addEventListener('click', loadSettings);
  settingsEls.resetDbBtn?.addEventListener('click', resetDatabase);
  settingsEls.exportCsvBtn?.addEventListener('click', exportCsv);
  settingsEls.clearRunsBtn?.addEventListener('click', clearRunsOnly);
  settingsEls.clearLogsBtn?.addEventListener('click', clearLogsOnly);
  settingsEls.reloadLogsBtn?.addEventListener('click', loadAuditLogs);
  settingsEls.reloadApisBtn?.addEventListener('click', loadApiCatalog);
  settingsEls.anonymousEntryMode?.addEventListener('change', syncAnonymousModeUi);
}

async function loadAll() {
  renderServerAddress();
  await Promise.all([loadSettings(), loadAuditLogs(), loadApiCatalog(), loadClients()]);
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    const data = await res.json();
    applySettingsToForm(data);
    syncAnonymousModeUi();
  } catch (err) {
    console.error(err);
    alert('設定の読み込みに失敗しました');
  }
}

function applySettingsToForm(data) {
  settingsEls.eventName.value = data.eventName ?? '';
  settingsEls.className.value = data.className ?? '';
  settingsEls.language.value = data.language ?? 'ja';
  settingsEls.autoBackupIntervalMin.value = data.autoBackupIntervalMin ?? 5;

  const rowsPerPage = String(data.rowsPerPage ?? 20);
  document.querySelectorAll('input[name="rowsPerPage"]').forEach((radio) => {
    radio.checked = radio.value === rowsPerPage;
  });
  settingsEls.slidePageSeconds.value = String(((Number(data.slidePageMs) || 7000) / 1000));
  const displaySortMode = String(data.displaySortMode ?? 'time');
  document.querySelectorAll('input[name="displaySortMode"]').forEach((radio) => {
    radio.checked = radio.value === displaySortMode;
  });
  const requestLogMode = String(data.requestLogMode ?? 'writes');
  document.querySelectorAll('input[name="requestLogMode"]').forEach((radio) => {
    radio.checked = radio.value === requestLogMode;
  });

  settingsEls.showKana.checked = Boolean(data.showKana);
  settingsEls.showCarNo.checked = Boolean(data.showCarNo);
  settingsEls.showPractice.checked = Boolean(data.showPractice);
  settingsEls.showMemo.checked = Boolean(data.showMemo);
  settingsEls.showSplit.checked = Boolean(data.showSplit);
  settingsEls.showDelta.checked = Boolean(data.showDelta);
  settingsEls.showClock.checked = Boolean(data.showClock);
  settingsEls.showLastUpdate.checked = Boolean(data.showLastUpdate);
  settingsEls.showOverallBest.checked = Boolean(data.showOverallBest);
  settingsEls.overallBestIncludePractice.checked = Boolean(data.overallBestIncludePractice);
  settingsEls.showEffects.checked = Boolean(data.showEffects);
  if (settingsEls.anonymousEntryMode) settingsEls.anonymousEntryMode.checked = Boolean(data.anonymousEntryMode);
  settingsEls.memoTitle.value = data.memoTitle ?? 'メモ';
}

async function saveSettings(event) {
  event.preventDefault();

  const payload = {
    eventName: settingsEls.eventName.value.trim(),
    className: settingsEls.className.value.trim(),
    language: settingsEls.language.value,
    rowsPerPage: Number(document.querySelector('input[name="rowsPerPage"]:checked')?.value || 20),
    slidePageMs: Math.round(Number(settingsEls.slidePageSeconds.value || 7) * 1000),
    displaySortMode: document.querySelector('input[name="displaySortMode"]:checked')?.value || 'time',
    requestLogMode: document.querySelector('input[name="requestLogMode"]:checked')?.value || 'writes',
    showKana: settingsEls.showKana.checked,
    showCarNo: settingsEls.showCarNo.checked,
    showPractice: settingsEls.showPractice.checked,
    showMemo: settingsEls.showMemo.checked,
    showSplit: settingsEls.showSplit.checked,
    showDelta: settingsEls.showDelta.checked,
    showClock: settingsEls.showClock.checked,
    showLastUpdate: settingsEls.showLastUpdate.checked,
    showOverallBest: settingsEls.showOverallBest.checked,
    overallBestIncludePractice: settingsEls.overallBestIncludePractice.checked,
    showEffects: settingsEls.showEffects.checked,
    anonymousEntryMode: settingsEls.anonymousEntryMode?.checked ?? false,
    memoTitle: settingsEls.memoTitle.value.trim() || 'メモ',
    autoBackupIntervalMin: Number(settingsEls.autoBackupIntervalMin.value || 5),
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || '設定の保存に失敗しました');
      return;
    }
    applySettingsToForm(data);
    alert('設定を保存しました');
  } catch (err) {
    console.error(err);
    alert('設定の保存に失敗しました');
  }
}

async function resetDatabase() {
  if (!window.confirm('データベースを初期化しますか？ ヒート、エントリー、走行データが削除されます。')) {
    return;
  }

  try {
    const res = await fetch('/api/settings/reset-db', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'データベースの初期化に失敗しました');
      return;
    }
    applySettingsToForm(data.settings || {});
    await loadAuditLogs();
    alert('データベースを初期化しました');
  } catch (err) {
    console.error(err);
    alert('データベースの初期化に失敗しました');
  }
}

async function clearRunsOnly() {
  if (!window.confirm('走行タイムだけを削除しますか？ エントリーとヒートは残ります。')) {
    return;
  }

  try {
    const res = await fetch('/api/settings/clear-runs', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'タイムの削除に失敗しました');
      return;
    }
    applySettingsToForm(data.settings || {});
    await loadAuditLogs();
    alert('走行タイムを削除しました');
  } catch (err) {
    console.error(err);
    alert('タイムの削除に失敗しました');
  }
}

async function clearLogsOnly() {
  if (!window.confirm('操作ログだけを削除しますか？')) {
    return;
  }

  try {
    const res = await fetch('/api/settings/clear-logs', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || '操作ログの削除に失敗しました');
      return;
    }
    await loadAuditLogs();
    alert('操作ログを削除しました');
  } catch (err) {
    console.error(err);
    alert('操作ログの削除に失敗しました');
  }
}

function exportCsv() {
  window.location.href = '/api/settings/export/results.csv';
}

async function loadAuditLogs() {
  try {
    const res = await fetch('/api/settings/logs?limit=100', { cache: 'no-store' });
    const data = await res.json();
    renderAuditLogs(data || []);
  } catch (err) {
    console.error(err);
    settingsEls.auditLogs.innerHTML = '<div class="log-row"><span>操作ログの読み込みに失敗しました</span></div>';
  }
}

async function loadApiCatalog() {
  try {
    const res = await fetch('/api/settings/apis', { cache: 'no-store' });
    const data = await res.json();
    renderApiCatalog(data || []);
  } catch (err) {
    console.error(err);
    settingsEls.apiCatalog.innerHTML = '<div class="api-row"><span>API一覧の読み込みに失敗しました</span></div>';
  }
}

async function loadClients() {
  try {
    const res = await fetch('/api/settings/clients', { cache: 'no-store' });
    const data = await res.json();
    renderClients(data || []);
  } catch (err) {
    console.error(err);
    settingsEls.clientList.innerHTML = '<div class="api-row"><span>接続クライアントの読み込みに失敗しました</span></div>';
  }
}

function renderServerAddress() {
  if (!settingsEls.serverAddress) return;

  window.SoapboxCommon?.loadAssignedServerAddresses?.()
    .then((data) => {
      const ipv4 = Array.isArray(data?.ipv4) ? data.ipv4 : [];
      const addresses = ipv4.map((row) => row.address).filter(Boolean);

      if (addresses.length) {
        settingsEls.serverAddress.textContent = addresses.join(', ');
        if (settingsEls.serverAddressList) {
          settingsEls.serverAddressList.hidden = false;
          settingsEls.serverAddressList.innerHTML = ipv4.map((row) => `
            <div class="server-address-item">
              <span>${escapeHtml(row.name || 'LAN')}</span>
              <strong>${escapeHtml(row.address || '-')}</strong>
            </div>
          `).join('');
        }
      } else {
        settingsEls.serverAddress.textContent = '利用可能な IPv4 アドレスが見つかりません';
        if (settingsEls.serverAddressList) {
          settingsEls.serverAddressList.hidden = true;
          settingsEls.serverAddressList.innerHTML = '';
        }
      }

      if (settingsEls.serverOrigin) {
        const hostText = data?.listenHost ? `待受ホスト: ${data.listenHost}` : '';
        const originText = data?.origin ? `アクセス元: ${data.origin}` : '';
        settingsEls.serverOrigin.textContent = [originText, hostText].filter(Boolean).join(' / ') || 'アクセス元を確認できませんでした';
      }
    })
    .catch(() => {
      const info = window.SoapboxCommon?.getServerAddressInfo?.();
      settingsEls.serverAddress.textContent = 'IPv4 アドレスの取得に失敗しました';
      if (settingsEls.serverAddressList) {
        settingsEls.serverAddressList.hidden = true;
        settingsEls.serverAddressList.innerHTML = '';
      }
      if (settingsEls.serverOrigin) {
        settingsEls.serverOrigin.textContent = `アクセス元: ${info?.origin || window.location.origin || window.location.host || '不明'}`;
      }
    });
}

function renderAuditLogs(rows) {
  if (!rows.length) {
    settingsEls.auditLogs.innerHTML = '<div class="log-row"><span>まだ操作ログはありません</span></div>';
    return;
  }

  settingsEls.auditLogs.innerHTML = rows.map((row) => `
    <div class="log-row">
      <strong>${escapeHtml(row.action_type)} / ${escapeHtml(row.target_type)} #${escapeHtml(String(row.target_id ?? '-'))}</strong>
      <span>${escapeHtml(row.created_at || '-')}</span>
    </div>
  `).join('');
}

function renderApiCatalog(rows) {
  if (!rows.length) {
    settingsEls.apiCatalog.innerHTML = '<div class="api-row"><span>APIは見つかりませんでした</span></div>';
    return;
  }

  settingsEls.apiCatalog.innerHTML = rows.map((row) => `
    <div class="api-row">
      <div class="api-summary">
        <strong><span class="api-method">${escapeHtml(row.method)}</span> <code>${escapeHtml(row.path)}</code></strong>
        <span class="api-note">${escapeHtml(API_CATEGORY_LABELS[row.category] || 'その他')}</span>
      </div>
      <span>${escapeHtml(row.description || '')}</span>
      <span>${escapeHtml(row.notes || '')}</span>
    </div>
  `).join('');
}

function renderClients(rows) {
  if (!settingsEls.clientList) return;
  if (!rows.length) {
    settingsEls.clientList.innerHTML = '<div class="api-row"><span>まだ接続クライアントはありません</span></div>';
    return;
  }

  settingsEls.clientList.innerHTML = rows.map((row) => `
    <div class="api-row">
      <strong>${escapeHtml(row.ip || '-')} <code>${escapeHtml((row.transports || []).join(', ') || '-')}</code></strong>
      <span>${escapeHtml(row.lastSeenAt || '-')} / ${escapeHtml(row.lastPath || '-')}</span>
      <span>${escapeHtml(row.userAgent || '-')}</span>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function syncAnonymousModeUi() {
  const anonymousMode = Boolean(settingsEls.anonymousEntryMode?.checked);
  if (!settingsEls.showPractice) return;
  if (anonymousMode) settingsEls.showPractice.checked = true;
  settingsEls.showPractice.disabled = anonymousMode;
}
