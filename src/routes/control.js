const express = require('express');
const { getControlState } = require('../services/displayService');
const { logAudit } = require('../services/auditService');
const { clearOverlayPreview, setOverlayPreview } = require('../services/overlayPreviewService');
const { clearSelectionPreview, setSelectionPreview } = require('../services/selectionPreviewService');

function normalizeExternalTimerValue(value, label) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { error: `${label} is required` };
  }
  if (text.includes('?')) {
    return { error: `${label} contains unreadable digits` };
  }
  if (!/^\d+$/.test(text)) {
    return { error: `${label} must contain digits only` };
  }

  const padded = text.padStart(4, '0');
  const secondsText = padded.slice(0, -3) || '0';
  const millisecondsText = padded.slice(-3);
  return {
    raw: text,
    formatted: `${Number(secondsText)}.${millisecondsText}`,
  };
}

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

function getFollowingAvailableEntryId(db, referenceEntryId, excludedIds = []) {
  const ids = excludedIds.filter((id) => Number.isInteger(id) && id > 0);
  const referenceId = Number(referenceEntryId);
  if (!referenceId) return getNextAvailableEntryId(db, ids);

  const reference = db.prepare(`
    SELECT effective_order, bib_no
    FROM entries
    WHERE id = ?
  `).get(referenceId);

  if (!reference) return getNextAvailableEntryId(db, ids);

  const placeholders = ids.map(() => '?').join(', ');
  const filterSql = ids.length ? `AND id NOT IN (${placeholders})` : '';
  const nextRow = db.prepare(`
    SELECT id
    FROM entries
    WHERE is_skipped = 0
      ${filterSql}
      AND (
        effective_order > ?
        OR (effective_order = ? AND bib_no > ?)
      )
    ORDER BY effective_order ASC, bib_no ASC
    LIMIT 1
  `).get(...ids, reference.effective_order, reference.effective_order, reference.bib_no);

  if (nextRow?.id) return nextRow.id;
  return null;
}

function createControlRouter(db, wsHub) {
  const router = express.Router();

  router.get('/state', (_req, res) => {
    res.json(getControlState(db));
  });

  router.post('/external-time', (req, res) => {
    const upperResult = normalizeExternalTimerValue(req.body?.upper, 'upper');
    const lowerResult = normalizeExternalTimerValue(req.body?.lower, 'lower');
    const error = upperResult.error || lowerResult.error;

    if (error) {
      wsHub.broadcast('external_timer_error', { message: error });
      return res.status(400).json({ error });
    }

    const payload = {
      upper: upperResult.raw,
      lower: lowerResult.raw,
      splitTime: upperResult.formatted,
      goalTime: lowerResult.formatted,
      receivedAt: new Date().toISOString(),
    };
    wsHub.broadcast('external_timer_input', payload);
    res.json({ ok: true, ...payload });
  });

  router.post('/action/set-now', (req, res) => {
    const entryId = req.body.entryId || null;
    const before = db.prepare('SELECT * FROM display_state WHERE id = 1').get();
    const nextId = getFollowingAvailableEntryId(db, entryId, [entryId]);
    db.prepare(`
      UPDATE display_state SET
        now_running_entry_id = ?,
        next_entry_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(entryId, nextId);
    clearOverlayPreview();
    clearSelectionPreview();
    const after = db.prepare('SELECT * FROM display_state WHERE id = 1').get();
    logAudit(db, {
      actionType: 'set_now_running',
      targetType: 'display_state',
      targetId: 1,
      before,
      after,
    });
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  router.post('/action/set-next', (req, res) => {
    const before = db.prepare('SELECT * FROM display_state WHERE id = 1').get();
    db.prepare('UPDATE display_state SET next_entry_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(req.body.entryId || null);
    clearSelectionPreview();
    const after = db.prepare('SELECT * FROM display_state WHERE id = 1').get();
    logAudit(db, {
      actionType: 'set_next',
      targetType: 'display_state',
      targetId: 1,
      before,
      after,
    });
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  router.post('/action/move-next', (_req, res) => {
    const before = db.prepare('SELECT * FROM display_state WHERE id = 1').get();
    const state = db.prepare('SELECT now_running_entry_id, next_entry_id FROM display_state WHERE id = 1').get();
    const newNowId = state?.next_entry_id || getNextAvailableEntryId(db, []);
    const newNextId = getFollowingAvailableEntryId(db, newNowId, [newNowId]);

    db.prepare(`
      UPDATE display_state SET
        now_running_entry_id = ?,
        next_entry_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(newNowId, newNextId);
    clearOverlayPreview();
    clearSelectionPreview();
    const after = db.prepare('SELECT * FROM display_state WHERE id = 1').get();
    logAudit(db, {
      actionType: 'set_now_running',
      targetType: 'display_state',
      targetId: 1,
      before,
      after,
    });
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  router.post('/action/skip', (req, res) => {
    const entryId = Number(req.body.entryId);
    const beforeEntry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
    db.prepare('UPDATE entries SET is_skipped = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(entryId);

    const state = db.prepare('SELECT now_running_entry_id, next_entry_id FROM display_state WHERE id = 1').get();
    let nextId = state?.next_entry_id ?? null;
    if (nextId === entryId) {
      const referenceId = state?.now_running_entry_id ?? entryId;
      nextId = getFollowingAvailableEntryId(db, referenceId, [referenceId]);
      db.prepare('UPDATE display_state SET next_entry_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(nextId);
    }
    clearSelectionPreview();

    wsHub.broadcast('entry_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    const afterEntry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
    logAudit(db, {
      actionType: 'skip_entry',
      targetType: 'entry',
      targetId: entryId,
      before: beforeEntry,
      after: afterEntry,
    });
    res.json({ ok: true, nextEntryId: nextId });
  });

  router.post('/action/unskip', (req, res) => {
    const entryId = Number(req.body.entryId);
    const beforeEntry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
    db.prepare('UPDATE entries SET is_skipped = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(entryId);

    const state = db.prepare('SELECT now_running_entry_id, next_entry_id FROM display_state WHERE id = 1').get();
    if (!state?.next_entry_id && entryId !== state?.now_running_entry_id) {
      db.prepare('UPDATE display_state SET next_entry_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(entryId);
    }
    clearSelectionPreview();

    wsHub.broadcast('entry_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    const afterEntry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
    logAudit(db, {
      actionType: 'unskip_entry',
      targetType: 'entry',
      targetId: entryId,
      before: beforeEntry,
      after: afterEntry,
    });
    res.json({ ok: true });
  });

  router.post('/action/status', (req, res) => {
    const before = db.prepare('SELECT * FROM display_state WHERE id = 1').get();
    db.prepare('UPDATE display_state SET current_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(req.body.status);
    const after = db.prepare('SELECT * FROM display_state WHERE id = 1').get();
    logAudit(db, {
      actionType: 'change_status',
      targetType: 'display_state',
      targetId: 1,
      before,
      after,
    });
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true });
  });

  router.post('/selection-preview', (req, res) => {
    const entryId = Number(req.body?.entryId) || null;
    const preview = entryId ? setSelectionPreview(entryId) : clearSelectionPreview();
    wsHub.broadcast('display_update');
    res.json({ ok: true, preview });
  });

  router.post('/overlay-preview', (req, res) => {
    const body = req.body || {};
    const hasPreview = Number(body.entryId)
      && (body.splitMs !== null || body.goalMs !== null || body.status);

    const preview = hasPreview
      ? setOverlayPreview({
        entryId: body.entryId,
        splitMs: body.splitMs,
        goalMs: body.goalMs,
        status: body.status,
      })
      : clearOverlayPreview();

    wsHub.broadcast('overlay_preview_updated', preview);
    res.json({ ok: true, preview });
  });

  return router;
}

module.exports = { createControlRouter };
