const express = require('express');

function createHeatsRouter(db, wsHub) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    const rows = db.prepare('SELECT * FROM heats ORDER BY heat_no ASC, id ASC').all();
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const body = req.body || {};
    const info = db.prepare(`
      INSERT INTO heats (heat_no, title, status)
      VALUES (@heat_no, @title, @status)
    `).run({
      heat_no: body.heatNo,
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
    db.prepare(`
      UPDATE heats SET
        heat_no = ?,
        title = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body.heatNo ?? current.heat_no,
      body.title ?? current.title,
      body.status ?? current.status,
      id
    );

    const row = db.prepare('SELECT * FROM heats WHERE id = ?').get(id);
    wsHub.broadcast('heat_updated');
    res.json(row);
  });

  return router;
}

module.exports = { createHeatsRouter };
