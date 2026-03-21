const express = require('express');
const { normalizeHeatCode, validateHeatCode } = require('../services/validation');

function createHeatsRouter(db, wsHub) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    const rows = db.prepare('SELECT * FROM heats ORDER BY COALESCE(code, ""), heat_no ASC, id ASC').all();
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const body = req.body || {};
    const code = normalizeHeatCode(body.code);
    if (!validateHeatCode(code)) {
      return res.status(400).json({ error: 'Heat code must be 1-2 alphanumeric characters' });
    }
    const existing = db.prepare('SELECT id FROM heats WHERE UPPER(code) = ?').get(code);
    if (existing) {
      return res.status(400).json({ error: 'Heat code already exists' });
    }
    const info = db.prepare(`
      INSERT INTO heats (heat_no, code, title, status)
      VALUES (@heat_no, @code, @title, @status)
    `).run({
      heat_no: Number(body.heatNo) || 0,
      code,
      title: body.title || null,
      status: body.status || 'waiting',
    });
    const row = db.prepare('SELECT * FROM heats WHERE id = ?').get(info.lastInsertRowid);
    wsHub.broadcast('heat_updated');
    res.status(201).json(row);
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM heats WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ error: 'Heat not found' });

    const body = req.body || {};
    const nextCode = body.code === undefined ? current.code : normalizeHeatCode(body.code);
    if (!validateHeatCode(nextCode)) {
      return res.status(400).json({ error: 'Heat code must be 1-2 alphanumeric characters' });
    }
    const duplicate = db.prepare('SELECT id FROM heats WHERE UPPER(code) = ? AND id <> ?').get(nextCode, id);
    if (duplicate) {
      return res.status(400).json({ error: 'Heat code already exists' });
    }
    db.prepare(`
      UPDATE heats SET
        heat_no = ?,
        code = ?,
        title = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body.heatNo ?? current.heat_no,
      nextCode,
      body.title ?? current.title,
      body.status ?? current.status,
      id
    );

    const row = db.prepare('SELECT * FROM heats WHERE id = ?').get(id);
    wsHub.broadcast('heat_updated');
    res.json(row);
  });

  router.put('/current/:id', (req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM heats WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ error: 'Heat not found' });

    db.prepare(`
      UPDATE display_state
      SET current_heat_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(id);

    wsHub.broadcast('heat_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true, heat: current });
  });

  return router;
}

module.exports = { createHeatsRouter };
