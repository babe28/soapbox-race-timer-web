function toBool(value) {
  return value === 1 || value === true;
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return '--.---';
  const totalMs = Number(ms);
  if (!Number.isFinite(totalMs) || totalMs < 0) return '--.---';

  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
  return `${seconds}.${String(millis).padStart(3, '0')}`;
}

module.exports = { toBool, formatMs };
