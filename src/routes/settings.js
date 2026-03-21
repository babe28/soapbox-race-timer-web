const express = require('express');
const { getSettings, updateSettings } = require('../services/settingsService');
const { validateLanguage } = require('../services/validation');
const { resetDb, clearRunsOnly } = require('../db');
const { getDisplayCurrent } = require('../services/displayService');
const { listAuditLogs } = require('../services/auditService');

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildResultsCsv(rows) {
  const headers = ['Status', 'Pos', 'No', 'Name', 'Kana', 'Car', 'Memo', 'Practice', 'R1 Split', 'R1 Goal', 'R2 Split', 'R2 Goal', 'Best'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.status,
      row.rank ?? '',
      row.bibNo,
      row.name,
      row.kana,
      row.carNo,
      row.memo,
      row.practice,
      row.r1?.split,
      row.r1?.goal,
      row.r2?.split,
      row.r2?.goal,
      row.best,
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

function getApiCatalog() {
  return [
    { method: 'GET', path: '/api/health', description: 'Health check' },
    { method: 'GET', path: '/api/settings', description: 'Load current settings' },
    { method: 'PUT', path: '/api/settings', description: 'Update settings' },
    { method: 'POST', path: '/api/settings/reset-db', description: 'Initialize database' },
    { method: 'POST', path: '/api/settings/clear-runs', description: 'Delete runs only' },
    { method: 'GET', path: '/api/settings/export/results.csv', description: 'Export current results as CSV' },
    { method: 'GET', path: '/api/settings/logs', description: 'Read audit logs' },
    { method: 'GET', path: '/api/settings/apis', description: 'Read API catalog' },
    { method: 'GET', path: '/api/entries', description: 'List entries' },
    { method: 'POST', path: '/api/entries', description: 'Create entry' },
    { method: 'PUT', path: '/api/entries/:id', description: 'Update entry' },
    { method: 'DELETE', path: '/api/entries/:id', description: 'Delete entry' },
    { method: 'GET', path: '/api/runs', description: 'List runs' },
    { method: 'POST', path: '/api/runs', description: 'Create run' },
    { method: 'PUT', path: '/api/runs/:id', description: 'Update run' },
    { method: 'DELETE', path: '/api/runs/:id', description: 'Delete run' },
    { method: 'GET', path: '/api/display/current', description: 'Read display payload' },
    { method: 'GET', path: '/api/control/state', description: 'Read race control state' },
    { method: 'POST', path: '/api/control/action/set-now', description: 'Set now running entry' },
    { method: 'POST', path: '/api/control/action/set-next', description: 'Set next entry' },
    { method: 'POST', path: '/api/control/action/move-next', description: 'Advance queue' },
    { method: 'POST', path: '/api/control/action/skip', description: 'Skip entry' },
    { method: 'POST', path: '/api/control/action/unskip', description: 'Unskip entry' },
    { method: 'POST', path: '/api/control/action/status', description: 'Change race status' },
  ];
}

function createSettingsRouter(db, wsHub) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json(getSettings(db));
  });

  router.put('/', (req, res) => {
    if (req.body?.language !== undefined && !validateLanguage(req.body.language)) {
      return res.status(400).json({ error: 'language must be ja or en' });
    }
    const result = updateSettings(db, req.body || {});
    wsHub.broadcast('settings_updated');
    wsHub.broadcast('display_update');
    res.json(result);
  });

  router.get('/export/results.csv', (_req, res) => {
    const display = getDisplayCurrent(db);
    const csv = buildResultsCsv(display.rows || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="soapbox-results.csv"');
    res.send(`\uFEFF${csv}`);
  });

  router.get('/logs', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(listAuditLogs(db, limit));
  });

  router.get('/apis', (_req, res) => {
    res.json(getApiCatalog());
  });

  router.post('/reset-db', (_req, res) => {
    resetDb(db);
    wsHub.broadcast('settings_updated');
    wsHub.broadcast('entry_updated');
    wsHub.broadcast('heat_updated');
    wsHub.broadcast('run_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true, settings: getSettings(db) });
  });

  router.post('/clear-runs', (_req, res) => {
    clearRunsOnly(db);
    wsHub.broadcast('run_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true, settings: getSettings(db) });
  });

  return router;
}

module.exports = { createSettingsRouter };
