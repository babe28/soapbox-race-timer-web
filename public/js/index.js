(function () {
  const valueEl = document.getElementById('serverAddressText');
  const listEl = document.getElementById('serverAddressList');
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

  render();
})();
