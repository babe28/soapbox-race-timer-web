const express = require('express');
const { createAnonymousEntry } = require('../services/anonymousEntryService');

function createEntriesRouter(db, wsHub) {
  const router = express.Router();
  const insertEntryStmt = db.prepare(`
    INSERT INTO entries (bib_no, name, kana, car_no, start_order, effective_order, memo)
    VALUES (@bib_no, @name, @kana, @car_no, @start_order, @effective_order, @memo)
  `);

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

  router.post('/import', (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ error: 'No rows to import' });
    }

    const normalizedRows = [];
    const bibSet = new Set();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const bibNo = Number(row.bibNo);
      const startOrder = Number(row.startOrder);
      const effectiveOrder = Number(row.effectiveOrder ?? row.startOrder);
      const name = String(row.name || '').trim();
      const kana = row.kana == null ? null : String(row.kana).trim() || null;
      const carNo = row.carNo == null ? null : String(row.carNo).trim() || null;
      const memo = row.memo == null ? null : String(row.memo).trim() || null;

      if (!Number.isInteger(bibNo) || bibNo <= 0) {
        return res.status(400).json({ error: `Row ${index + 1}: Bib No must be a positive integer` });
      }
      if (bibSet.has(bibNo)) {
        return res.status(400).json({ error: `Row ${index + 1}: Duplicate Bib No ${bibNo} in CSV` });
      }
      if (!name) {
        return res.status(400).json({ error: `Row ${index + 1}: Name is required` });
      }
      if (!Number.isInteger(startOrder) || startOrder <= 0) {
        return res.status(400).json({ error: `Row ${index + 1}: Start Order must be a positive integer` });
      }
      if (!Number.isInteger(effectiveOrder) || effectiveOrder <= 0) {
        return res.status(400).json({ error: `Row ${index + 1}: Display Order must be a positive integer` });
      }

      bibSet.add(bibNo);
      normalizedRows.push({
        bib_no: bibNo,
        name,
        kana,
        car_no: carNo,
        start_order: startOrder,
        effective_order: effectiveOrder,
        memo,
      });
    }

    const existingBibRows = db.prepare('SELECT bib_no FROM entries WHERE bib_no IN (' + normalizedRows.map(() => '?').join(', ') + ')')
      .all(...normalizedRows.map((row) => row.bib_no));
    if (existingBibRows.length) {
      return res.status(400).json({
        error: `Duplicate Bib No already exists: ${existingBibRows.map((row) => row.bib_no).join(', ')}`,
      });
    }

    const tx = db.transaction((importRows) => {
      const insertedIds = [];
      for (const row of importRows) {
        const info = insertEntryStmt.run(row);
        insertedIds.push(Number(info.lastInsertRowid));
      }
      return insertedIds;
    });

    const insertedIds = tx(normalizedRows);
    const insertedRows = insertedIds.map((id) => db.prepare('SELECT * FROM entries WHERE id = ?').get(id));

    wsHub.broadcast('entry_updated');
    wsHub.broadcast('display_update');
    res.status(201).json({ count: insertedRows.length, rows: insertedRows });
  });

  router.post('/', (req, res) => {
    const body = req.body || {};
    const info = insertEntryStmt.run({
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

  router.post('/anonymous', (_req, res) => {
    const row = createAnonymousEntry(db);
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
