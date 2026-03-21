const express = require('express');
const { getSettings, updateSettings } = require('../services/settingsService');
const { validateLanguage } = require('../services/validation');
const { resetDb } = require('../db');

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

  return router;
}

module.exports = { createSettingsRouter };
