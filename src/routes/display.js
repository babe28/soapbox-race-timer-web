const express = require('express');
const { getDisplayCurrent } = require('../services/displayService');

function createDisplayRouter(db) {
  const router = express.Router();
  router.get('/current', (_req, res) => {
    res.json(getDisplayCurrent(db));
  });
  return router;
}

module.exports = { createDisplayRouter };
