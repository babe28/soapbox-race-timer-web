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
  settingsEls.showSplit = document.getElementById('showSplit');
  settingsEls.showClock = document.getElementById('showClock');
  settingsEls.showLastUpdate = document.getElementById('showLastUpdate');
  settingsEls.showOverallBest = document.getElementById('showOverallBest');
  settingsEls.showEffects = document.getElementById('showEffects');
  settingsEls.currentSettings = document.getElementById('currentSettings');
  settingsEls.reloadSettingsBtn = document.getElementById('reloadSettingsBtn');
}

function bindSettingsEvents() {
  settingsEls.form?.addEventListener('submit', saveSettings);
  settingsEls.reloadSettingsBtn?.addEventListener('click', loadSettings);
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    const data = await res.json();
    applySettingsToForm(data);
    renderCurrentSettings(data);
  } catch (err) {
    console.error(err);
    alert('Settings の読み込みに失敗しました');
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
  settingsEls.showSplit.checked = Boolean(data.showSplit);
  settingsEls.showClock.checked = Boolean(data.showClock);
  settingsEls.showLastUpdate.checked = Boolean(data.showLastUpdate);
  settingsEls.showOverallBest.checked = Boolean(data.showOverallBest);
  settingsEls.showEffects.checked = Boolean(data.showEffects);
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
    showSplit: settingsEls.showSplit.checked,
    showClock: settingsEls.showClock.checked,
    showLastUpdate: settingsEls.showLastUpdate.checked,
    showOverallBest: settingsEls.showOverallBest.checked,
    showEffects: settingsEls.showEffects.checked,
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
      alert(data.error || '保存に失敗しました');
      return;
    }
    applySettingsToForm(data);
    renderCurrentSettings(data);
    alert('設定を保存しました');
  } catch (err) {
    console.error(err);
    alert('設定の保存に失敗しました');
  }
}

function renderCurrentSettings(data) {
  const rows = [
    ['イベント名', data.eventName ?? ''],
    ['クラス名', data.className ?? ''],
    ['言語', data.language ?? ''],
    ['表示行数', `${data.rowsPerPage ?? 20} 行`],
    ['かな表示', boolText(data.showKana)],
    ['車番表示', boolText(data.showCarNo)],
    ['練習タイム表示', boolText(data.showPractice)],
    ['中間タイム表示', boolText(data.showSplit)],
    ['時計表示', boolText(data.showClock)],
    ['更新時刻表示', boolText(data.showLastUpdate)],
    ['全体ベスト表示', boolText(data.showOverallBest)],
    ['演出表示', boolText(data.showEffects)],
    ['自動バックアップ', `${data.autoBackupIntervalMin ?? 5} 分`],
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
