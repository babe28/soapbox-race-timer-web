(function () {
  const el = document.getElementById('serverAddressText');
  if (!el) return;
  const info = window.SoapboxCommon?.getServerAddressInfo?.();
  el.textContent = info?.origin || window.location.origin || window.location.host || 'Unknown';
})();
