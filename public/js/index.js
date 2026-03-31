(function () {
  const valueEl = document.getElementById('serverAddressText');
  const listEl = document.getElementById('serverAddressList');
  const lockStatusEl = document.getElementById('controlLockStatus');
  const lockDetailEl = document.getElementById('controlLockDetail');
  const forceUnlockBtn = document.getElementById('forceUnlockBtn');
  if (!valueEl) return;

  async function render() {
    try {
      const data = await window.SoapboxCommon?.loadAssignedServerAddresses?.();
      const ipv4 = data?.ipv4 || [];
      if (ipv4.length) {
        valueEl.textContent = ipv4.map((row) => row.address).join(', ');
        if (listEl) {
          listEl.hidden = false;
          listEl.innerHTML = ipv4.map((row) => `
            <div class="server-address-item">
              <span>${escapeHtml(row.name || 'LAN')}</span>
              <strong>${escapeHtml(row.address || '-')}</strong>
            </div>
          `).join('');
        }
        return;
      }
      valueEl.textContent = data?.origin || window.location.origin || 'Unknown';
    } catch (_err) {
      const info = window.SoapboxCommon?.getServerAddressInfo?.();
      valueEl.textContent = info?.origin || window.location.origin || window.location.host || 'Unknown';
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function updateLockUi(data) {
    if (!lockStatusEl || !lockDetailEl || !forceUnlockBtn) return;

    if (!data?.locked) {
      lockStatusEl.textContent = 'Unlocked';
      lockDetailEl.textContent = 'Race Control は現在ロックされていません。';
      forceUnlockBtn.disabled = true;
      return;
    }

    const acquiredAt = data.acquiredAt
      ? new Date(data.acquiredAt).toLocaleString('ja-JP')
      : 'unknown';
    const expiresAt = data.expiresAt
      ? new Date(data.expiresAt).toLocaleString('ja-JP')
      : 'unknown';

    lockStatusEl.textContent = 'Locked';
    lockDetailEl.textContent = `別ブラウザのロックが残っています。取得: ${acquiredAt} / 期限: ${expiresAt}`;
    forceUnlockBtn.disabled = false;
  }

  async function loadLockStatus() {
    if (!lockStatusEl || !lockDetailEl || !forceUnlockBtn) return;

    try {
      const res = await fetch('/api/control/lock', { cache: 'no-store' });
      const data = await res.json();
      updateLockUi(data);
    } catch (_err) {
      lockStatusEl.textContent = 'Unknown';
      lockDetailEl.textContent = 'ロック状態を取得できませんでした。';
      forceUnlockBtn.disabled = false;
    }
  }

  async function forceUnlock() {
    if (!forceUnlockBtn) return;
    forceUnlockBtn.disabled = true;

    try {
      const res = await fetch('/api/control/lock/force-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error('Failed to release lock');
      }
      await loadLockStatus();
    } catch (_err) {
      lockStatusEl.textContent = 'Unlock Failed';
      lockDetailEl.textContent = '強制解放に失敗しました。サーバー状態を確認してください。';
      forceUnlockBtn.disabled = false;
    }
  }

  forceUnlockBtn?.addEventListener('click', forceUnlock);

  render();
  loadLockStatus();
})();
