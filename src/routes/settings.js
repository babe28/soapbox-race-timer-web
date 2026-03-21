const express = require('express');
const { getSettings, updateSettings } = require('../services/settingsService');

function createSettingsRouter(db, wsHub) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json(getSettings(db));
  });

  router.put('/', (req, res) => {
    const result = updateSettings(db, req.body || {});
    wsHub.broadcast('settings_updated');
    wsHub.broadcast('display_update');
    res.json(result);
  });

  return router;
}

module.exports = { createSettingsRouter };
