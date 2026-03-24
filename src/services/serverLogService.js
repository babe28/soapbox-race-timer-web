const VALID_REQUEST_LOG_MODES = new Set(['off', 'errors', 'writes', 'all']);

function getRequestLogMode(db) {
  const row = db.prepare('SELECT request_log_mode FROM settings WHERE id = 1').get();
  const mode = String(row?.request_log_mode || 'writes');
  return VALID_REQUEST_LOG_MODES.has(mode) ? mode : 'writes';
}

function shouldSkipRequestLog(db, req, res) {
  const mode = getRequestLogMode(db);
  if (mode === 'off') return true;
  if (mode === 'all') return false;

  const isError = Number(res.statusCode) >= 400;
  if (mode === 'errors') return !isError;

  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase());
  if (mode === 'writes') return !isWrite && !isError;

  return false;
}

module.exports = {
  VALID_REQUEST_LOG_MODES,
  getRequestLogMode,
  shouldSkipRequestLog,
};
