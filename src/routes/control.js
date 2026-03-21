const express = require('express');
const { getControlState } = require('../services/displayService');

function getNextAvailableEntryId(db, excludedIds = []) {
  const ids = excludedIds.filter((id) => Number.isInteger(id) && id > 0);
  const placeholders = ids.map(() => '?').join(', ');
  const sql = `
    SELECT id
    FROM entries
    WHERE is_skipped = 0
    ${ids.length ? `AND id NOT IN (${placeholders})` : ''}
    ORDER BY effective_order ASC, bib_no ASC
    LIMIT 1
  `;
  const row = db.prepare(sql).get(...ids);
  return row?.id ?? null;
}

function createControlRouter(db, wsHub) {
  const router = express.Router();

  router.get('/state', (_req, res) => {
    res.json(getControlState(db));
  });

  router.post('/action/set-now', (req, res) => {
    const entryId = req.body.entryId || null;
    const nextId = getNextAvailableEntryId(db, [entryId]);
    db.prepare(`
      UPDATE display_state SET
        now_running_entry_id = ?,
        next_entry_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(entryId, nextId);
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  router.post('/action/set-next', (req, res) => {
    db.prepare('UPDATE display_state SET next_entry_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(req.body.entryId || null);
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  router.post('/action/move-next', (_req, res) => {
    const state = db.prepare('SELECT now_running_entry_id, next_entry_id FROM display_state WHERE id = 1').get();
    const newNowId = state?.next_entry_id || getNextAvailableEntryId(db, []);
    const newNextId = getNextAvailableEntryId(db, [newNowId]);

    db.prepare(`
      UPDATE display_state SET
        now_running_entry_id = ?,
        next_entry_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(newNowId, newNextId);
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  router.post('/action/skip', (req, res) => {
    const entryId = Number(req.body.entryId);
    db.prepare('UPDATE entries SET is_skipped = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(entryId);

    const state = db.prepare('SELECT now_running_entry_id, next_entry_id FROM display_state WHERE id = 1').get();
    let nextId = state?.next_entry_id ?? null;
    if (nextId === entryId) {
      nextId = getNextAvailableEntryId(db, [state?.now_running_entry_id ?? null]);
      db.prepare('UPDATE display_state SET next_entry_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(nextId);
    }

    wsHub.broadcast('entry_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true, nextEntryId: nextId });
  });

  router.post('/action/unskip', (req, res) => {
    const entryId = Number(req.body.entryId);
    db.prepare('UPDATE entries SET is_skipped = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(entryId);

    const state = db.prepare('SELECT now_running_entry_id, next_entry_id FROM display_state WHERE id = 1').get();
    if (!state?.next_entry_id && entryId !== state?.now_running_entry_id) {
      db.prepare('UPDATE display_state SET next_entry_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(entryId);
    }

    wsHub.broadcast('entry_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  router.post('/action/status', (req, res) => {
    db.prepare('UPDATE display_state SET current_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(req.body.status);
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createControlRouter };
