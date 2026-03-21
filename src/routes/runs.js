const express = require('express');

function createRunsRouter(db, wsHub) {
  const router = express.Router();

  router.get('/', (req, res) => {
    if (req.query.entryId) {
      return res.json(
        db.prepare('SELECT * FROM runs WHERE entry_id = ? ORDER BY created_at DESC').all(Number(req.query.entryId))
      );
    }
    res.json(db.prepare('SELECT * FROM runs ORDER BY created_at DESC').all());
  });

  router.post('/', (req, res) => {
    const body = req.body || {};
    if (!body.entryId) {
      return res.status(400).json({ error: 'entryId is required' });
    }
    if (!body.runType) {
      return res.status(400).json({ error: 'runType is required' });
    }    

    const info = db.prepare(`
      INSERT INTO runs (
        entry_id, heat_id, run_type, attempt_no, rerun_of_run_id, replaces_run_type,
        car_no_at_run, split_ms, goal_ms, status, valid_for_ranking, valid_for_display, note
      ) VALUES (
        @entry_id, @heat_id, @run_type, @attempt_no, @rerun_of_run_id, @replaces_run_type,
        @car_no_at_run, @split_ms, @goal_ms, @status, @valid_for_ranking, @valid_for_display, @note
      )
    `).run({
      entry_id: body.entryId,
      heat_id: body.heatId || null,
      run_type: body.runType,
      attempt_no: body.attemptNo || 1,
      rerun_of_run_id: body.rerunOfRunId || null,
      replaces_run_type: body.replacesRunType || null,
      car_no_at_run: body.carNoAtRun || null,
      split_ms: body.splitMs ?? null,
      goal_ms: body.goalMs ?? null,
      status: body.status || 'pending',
      valid_for_ranking: Number(Boolean(body.validForRanking)),
      valid_for_display: body.validForDisplay === undefined ? 1 : Number(Boolean(body.validForDisplay)),
      note: body.note || null,
    });

    db.prepare('UPDATE display_state SET last_update_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run();

    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(info.lastInsertRowid);
    wsHub.broadcast('run_updated');
    wsHub.broadcast('display_update');
    res.status(201).json(row);
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    if (!current) return res.status(404).json({ error: 'Run not found' });
    const body = req.body || {};

    db.prepare(`
      UPDATE runs SET
        split_ms = ?, goal_ms = ?, status = ?, valid_for_ranking = ?, valid_for_display = ?,
        car_no_at_run = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      body.splitMs ?? current.split_ms,
      body.goalMs ?? current.goal_ms,
      body.status ?? current.status,
      body.validForRanking === undefined ? current.valid_for_ranking : Number(Boolean(body.validForRanking)),
      body.validForDisplay === undefined ? current.valid_for_display : Number(Boolean(body.validForDisplay)),
      body.carNoAtRun ?? current.car_no_at_run,
      body.note ?? current.note,
      id
    );

    db.prepare('UPDATE display_state SET last_update_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run();

    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
    wsHub.broadcast('run_updated');
    wsHub.broadcast('display_update');
    res.json(row);
  });

  router.post('/rerun', (req, res) => {
    const body = req.body || {};
    const info = db.prepare(`
      INSERT INTO runs (entry_id, heat_id, run_type, replaces_run_type, status, valid_for_ranking, valid_for_display)
      VALUES (?, ?, 'rerun', ?, 'pending', 0, 1)
    `).run(body.entryId, body.heatId || null, body.replacesRunType);
    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(info.lastInsertRowid);
    wsHub.broadcast('run_updated');
    res.status(201).json(row);
  });

  return router;
}

module.exports = { createRunsRouter };
