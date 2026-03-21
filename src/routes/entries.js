const express = require('express');

function createEntriesRouter(db, wsHub) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const includeRuns = req.query.includeRuns === 'true';
    const rows = db.prepare('SELECT * FROM entries ORDER BY effective_order ASC, bib_no ASC').all();
    if (!includeRuns) return res.json(rows);
    const runsStmt = db.prepare('SELECT * FROM runs WHERE entry_id = ? ORDER BY created_at DESC');
    res.json(rows.map((row) => ({ ...row, runs: runsStmt.all(row.id) })));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Entry not found' });
    const runs = db.prepare('SELECT * FROM runs WHERE entry_id = ? ORDER BY created_at DESC').all(row.id);
    res.json({ ...row, runs });
  });

  router.post('/', (req, res) => {
    const body = req.body || {};
    const info = db.prepare(`
      INSERT INTO entries (bib_no, name, kana, car_no, start_order, effective_order, memo)
      VALUES (@bib_no, @name, @kana, @car_no, @start_order, @effective_order, @memo)
    `).run({
      bib_no: body.bibNo,
      name: body.name,
      kana: body.kana || null,
      car_no: body.carNo || null,
      start_order: body.startOrder,
      effective_order: body.effectiveOrder ?? body.startOrder,
      memo: body.memo || null,
    });
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
    wsHub.broadcast('entry_updated');
    wsHub.broadcast('display_update');
    res.status(201).json(row);
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ error: 'Entry not found' });
    const body = req.body || {};
    db.prepare(`
      UPDATE entries SET
        bib_no = ?, name = ?, kana = ?, car_no = ?, start_order = ?, effective_order = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body.bibNo ?? current.bib_no,
      body.name ?? current.name,
      body.kana ?? current.kana,
      body.carNo ?? current.car_no,
      body.startOrder ?? current.start_order,
      body.effectiveOrder ?? current.effective_order,
      body.memo ?? current.memo,
      id
    );
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    wsHub.broadcast('entry_updated');
    wsHub.broadcast('display_update');
    res.json(row);
  });

  router.put('/:id/order', (req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ error: 'Entry not found' });
    const effectiveOrder = Number(req.body.effectiveOrder);
    db.prepare('UPDATE entries SET effective_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(effectiveOrder, id);
    db.prepare(`
      INSERT INTO entry_order_history (entry_id, old_effective_order, new_effective_order, reason)
      VALUES (?, ?, ?, ?)
    `).run(id, current.effective_order, effectiveOrder, req.body.reason || 'manual edit');
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    wsHub.broadcast('entry_updated');
    wsHub.broadcast('display_update');
    res.json(row);
  });

  router.post('/:id/skip', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('UPDATE entries SET is_skipped = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    wsHub.broadcast('entry_updated');
    res.json({ ok: true });
  });

  router.post('/:id/unskip', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('UPDATE entries SET is_skipped = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    wsHub.broadcast('entry_updated');
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ error: 'Entry not found' });

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM runs WHERE entry_id = ?').run(id);
      db.prepare('DELETE FROM entry_order_history WHERE entry_id = ?').run(id);
      db.prepare('DELETE FROM entries WHERE id = ?').run(id);
      db.prepare('UPDATE display_state SET now_running_entry_id = NULL WHERE now_running_entry_id = ?').run(id);
      db.prepare('UPDATE display_state SET next_entry_id = NULL WHERE next_entry_id = ?').run(id);
    });

    tx();
    wsHub.broadcast('entry_updated');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createEntriesRouter };
