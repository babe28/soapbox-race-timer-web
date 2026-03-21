window.SoapboxCommon = {
  formatMs(value) {
    if (value === null || value === undefined || value === '') return '--.---';
    const ms = Number(value);
    if (Number.isNaN(ms) || ms < 0) return '--.---';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    if (minutes > 0) {
      return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    }
    return `${seconds}.${String(millis).padStart(3, '0')}`;
  }
};
