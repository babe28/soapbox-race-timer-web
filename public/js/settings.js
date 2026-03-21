const settingsEls = {};

document.addEventListener('DOMContentLoaded', () => {
  bindSettingsElements();
  bindSettingsEvents();
  loadSettings();
});

function bindSettingsElements() {
  settingsEls.form = document.getElementById('settingsForm');
  settingsEls.eventName = document.getElementById('eventName');
  settingsEls.className = document.getElementById('className');
  settingsEls.language = document.getElementById('language');
  settingsEls.autoBackupIntervalMin = document.getElementById('autoBackupIntervalMin');
  settingsEls.showKana = document.getElementById('showKana');
  settingsEls.showCarNo = document.getElementById('showCarNo');
  settingsEls.showPractice = document.getElementById('showPractice');
  settingsEls.showMemo = document.getElementById('showMemo');
  settingsEls.showSplit = document.getElementById('showSplit');
  settingsEls.showClock = document.getElementById('showClock');
  settingsEls.showLastUpdate = document.getElementById('showLastUpdate');
  settingsEls.showOverallBest = document.getElementById('showOverallBest');
  settingsEls.showEffects = document.getElementById('showEffects');
  settingsEls.memoTitle = document.getElementById('memoTitle');
  settingsEls.currentSettings = document.getElementById('currentSettings');
  settingsEls.reloadSettingsBtn = document.getElementById('reloadSettingsBtn');
  settingsEls.resetDbBtn = document.getElementById('resetDbBtn');
}

function bindSettingsEvents() {
  settingsEls.form?.addEventListener('submit', saveSettings);
  settingsEls.reloadSettingsBtn?.addEventListener('click', loadSettings);
  settingsEls.resetDbBtn?.addEventListener('click', resetDatabase);
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    const data = await res.json();
    applySettingsToForm(data);
    renderCurrentSettings(data);
  } catch (err) {
    console.error(err);
    alert('Failed to load settings');
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

  settingsEls.showKana.checked = Boolean(data.showKana);
  settingsEls.showCarNo.checked = Boolean(data.showCarNo);
  settingsEls.showPractice.checked = Boolean(data.showPractice);
  settingsEls.showMemo.checked = Boolean(data.showMemo);
  settingsEls.showSplit.checked = Boolean(data.showSplit);
  settingsEls.showClock.checked = Boolean(data.showClock);
  settingsEls.showLastUpdate.checked = Boolean(data.showLastUpdate);
  settingsEls.showOverallBest.checked = Boolean(data.showOverallBest);
  settingsEls.showEffects.checked = Boolean(data.showEffects);
  settingsEls.memoTitle.value = data.memoTitle ?? 'Memo';
}

async function saveSettings(event) {
  event.preventDefault();

  const payload = {
    eventName: settingsEls.eventName.value.trim(),
    className: settingsEls.className.value.trim(),
    language: settingsEls.language.value,
    rowsPerPage: Number(document.querySelector('input[name="rowsPerPage"]:checked')?.value || 20),
    showKana: settingsEls.showKana.checked,
    showCarNo: settingsEls.showCarNo.checked,
    showPractice: settingsEls.showPractice.checked,
    showMemo: settingsEls.showMemo.checked,
    showSplit: settingsEls.showSplit.checked,
    showClock: settingsEls.showClock.checked,
    showLastUpdate: settingsEls.showLastUpdate.checked,
    showOverallBest: settingsEls.showOverallBest.checked,
    showEffects: settingsEls.showEffects.checked,
    memoTitle: settingsEls.memoTitle.value.trim() || 'Memo',
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
      alert(data.error || 'Failed to save settings');
      return;
    }
    applySettingsToForm(data);
    renderCurrentSettings(data);
    alert('Settings saved');
  } catch (err) {
    console.error(err);
    alert('Failed to save settings');
  }
}

async function resetDatabase() {
  if (!window.confirm('Initialize the database? All heats, entries, and runs will be deleted.')) {
    return;
  }

  try {
    const res = await fetch('/api/settings/reset-db', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Failed to initialize database');
      return;
    }
    applySettingsToForm(data.settings || {});
    renderCurrentSettings(data.settings || {});
    alert('Database initialized');
  } catch (err) {
    console.error(err);
    alert('Failed to initialize database');
  }
}

function renderCurrentSettings(data) {
  const rows = [
    ['Event Name', data.eventName ?? ''],
    ['Class Name', data.className ?? ''],
    ['Language', data.language ?? ''],
    ['Rows Per Page', `${data.rowsPerPage ?? 20}`],
    ['Show Kana', boolText(data.showKana)],
    ['Show Car No', boolText(data.showCarNo)],
    ['Show Practice', boolText(data.showPractice)],
    ['Show Memo', boolText(data.showMemo)],
    ['Show Split', boolText(data.showSplit)],
    ['Show Clock', boolText(data.showClock)],
    ['Show Last Update', boolText(data.showLastUpdate)],
    ['Show Overall Best', boolText(data.showOverallBest)],
    ['Show Effects', boolText(data.showEffects)],
    ['Memo Column Title', data.memoTitle ?? 'Memo'],
    ['Auto Backup Interval', `${data.autoBackupIntervalMin ?? 5} min`],
  ];

  settingsEls.currentSettings.innerHTML = rows.map(([label, value]) => `
    <div class="current-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join('');
}

function boolText(value) {
  return value ? 'ON' : 'OFF';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
