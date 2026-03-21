const { getSettings } = require('./settingsService');
const { formatMs } = require('./formatters');

function getBestRunByEntryAndType(db, entryId, runType) {
  return db.prepare(`
    SELECT *
    FROM runs
    WHERE entry_id = ?
      AND run_type = ?
      AND valid_for_display = 1
    ORDER BY
      CASE WHEN status = 'finished' AND goal_ms IS NOT NULL THEN 0 ELSE 1 END,
      goal_ms ASC,
      created_at DESC
    LIMIT 1
  `).get(entryId, runType);
}

function getDisplayCurrent(db) {
  const settings = getSettings(db);
  const state = db.prepare(`
    SELECT ds.*, h.heat_no
    FROM display_state ds
    LEFT JOIN heats h ON h.id = ds.current_heat_id
    WHERE ds.id = 1
  `).get();

  const rankingRows = db.prepare(`
    SELECT
      e.id,
      e.bib_no,
      e.name,
      e.kana,
      e.car_no,
      MIN(r.goal_ms) AS best_goal_ms,
      ROW_NUMBER() OVER (ORDER BY MIN(r.goal_ms) ASC, e.effective_order ASC, e.bib_no ASC) AS rank_no
    FROM entries e
    JOIN runs r ON r.entry_id = e.id
    WHERE r.valid_for_ranking = 1
      AND r.status = 'finished'
      AND r.goal_ms IS NOT NULL
    GROUP BY e.id, e.bib_no, e.name, e.kana, e.car_no, e.effective_order
    ORDER BY best_goal_ms ASC, e.effective_order ASC, e.bib_no ASC
  `).all();

  const unrunRows = db.prepare(`
    SELECT e.id, e.bib_no, e.name, e.kana, e.car_no, e.effective_order
    FROM entries e
    WHERE e.id NOT IN (
      SELECT DISTINCT entry_id
      FROM runs
      WHERE valid_for_ranking = 1
        AND status = 'finished'
        AND goal_ms IS NOT NULL
    )
    ORDER BY e.effective_order ASC, e.bib_no ASC
  `).all();

  const overallBest = db.prepare(`
    SELECT goal_ms
    FROM runs
    WHERE valid_for_display = 1
      AND status = 'finished'
      AND goal_ms IS NOT NULL
    ORDER BY goal_ms ASC
    LIMIT 1
  `).get();

  const mapRow = (row) => {
    const p = getBestRunByEntryAndType(db, row.id, 'practice');
    const r1 = getBestRunByEntryAndType(db, row.id, 'race1');
    const r2 = getBestRunByEntryAndType(db, row.id, 'race2');
    return {
      rank: row.rank_no ?? null,
      bibNo: row.bib_no,
      name: row.name,
      kana: row.kana,
      carNo: row.car_no,
      practice: settings.showPractice ? formatMs(p?.goal_ms) : null,
      r1: {
        split: settings.showSplit ? formatMs(r1?.split_ms) : null,
        goal: formatMs(r1?.goal_ms),
      },
      r2: {
        split: settings.showSplit ? formatMs(r2?.split_ms) : null,
        goal: formatMs(r2?.goal_ms),
      },
      best: row.best_goal_ms !== undefined ? formatMs(row.best_goal_ms) : '--.---',
      highlight: false,
    };
  };

  const rows = [...rankingRows.map(mapRow), ...unrunRows.map(mapRow)];
  const nowEntry = state?.now_running_entry_id
    ? db.prepare('SELECT bib_no, name FROM entries WHERE id = ?').get(state.now_running_entry_id)
    : null;
  const nextEntry = state?.next_entry_id
    ? db.prepare('SELECT bib_no, name FROM entries WHERE id = ?').get(state.next_entry_id)
    : null;

  return {
    header: {
      heat: state?.heat_no ?? null,
      status: (state?.current_status || 'waiting').toUpperCase(),
      lastUpdate: state?.last_update_at,
      clock: new Date().toLocaleTimeString('ja-JP', { hour12: false }),
      overallBest: formatMs(overallBest?.goal_ms),
      eventName: settings.eventName,
    },
    settings,
    rows,
    nowRunning: nowEntry ? `No.${nowEntry.bib_no} ${nowEntry.name}` : '-',
    next: nextEntry ? `No.${nextEntry.bib_no} ${nextEntry.name}` : '-',
    connection: {
      connected: (state?.connection_state || 'connected') === 'connected',
    },
  };
}

function getControlState(db) {
  const settings = getSettings(db);

  const state = db.prepare(`
    SELECT ds.*, h.heat_no
    FROM display_state ds
    LEFT JOIN heats h ON h.id = ds.current_heat_id
    WHERE ds.id = 1
  `).get();

  const nowRunning = state?.now_running_entry_id
    ? db.prepare(`
        SELECT id, bib_no, name, kana, car_no, effective_order
        FROM entries
        WHERE id = ?
      `).get(state.now_running_entry_id)
    : null;

  const next = state?.next_entry_id
    ? db.prepare(`
        SELECT id, bib_no, name, kana, car_no, effective_order
        FROM entries
        WHERE id = ?
      `).get(state.next_entry_id)
    : null;

  const queue = db.prepare(`
    SELECT id, bib_no, name, kana, car_no, effective_order, is_skipped
    FROM entries
    ORDER BY effective_order ASC, bib_no ASC
  `).all();

  const overallBest = db.prepare(`
    SELECT goal_ms
    FROM runs
    WHERE valid_for_display = 1
      AND status = 'finished'
      AND goal_ms IS NOT NULL
    ORDER BY goal_ms ASC
    LIMIT 1
  `).get();

  const summary = {
    total: db.prepare('SELECT COUNT(*) AS c FROM entries').get().c,
    ranked: db.prepare(`
      SELECT COUNT(DISTINCT entry_id) AS c
      FROM runs
      WHERE valid_for_ranking = 1
        AND status = 'finished'
        AND goal_ms IS NOT NULL
    `).get().c,
    unrun: db.prepare(`
      SELECT COUNT(*) AS c
      FROM entries
      WHERE id NOT IN (
        SELECT DISTINCT entry_id
        FROM runs
        WHERE valid_for_ranking = 1
          AND status = 'finished'
          AND goal_ms IS NOT NULL
      )
    `).get().c,
    overallBest: formatMs(overallBest?.goal_ms),
    lastEntry: nowRunning ? `No.${nowRunning.bib_no} ${nowRunning.name}` : '-',
  };

  const selectedEntry = nowRunning || next || queue.find((q) => !q.is_skipped) || queue[0] || null;

  const selectedEntryRuns = selectedEntry
    ? db.prepare(`
        SELECT *
        FROM runs
        WHERE entry_id = ?
        ORDER BY created_at DESC, id DESC
      `).all(selectedEntry.id)
    : [];

  return {
    eventName: settings.eventName || settings.event_name || 'Soap Box Derby',
    heatId: state?.current_heat_id ?? null,
    heatNo: state?.heat_no ?? null,
    status: state?.current_status || 'waiting',
    overallBest: overallBest?.goal_ms ?? null,
    lastUpdate: state?.last_update_at ?? null,

    nowRunning: nowRunning ? `No.${nowRunning.bib_no} ${nowRunning.name}` : '-',
    next: next ? `No.${next.bib_no} ${next.name}` : '-',

    nowRunningEntry: nowRunning ? {
      id: nowRunning.id,
      bibNo: nowRunning.bib_no,
      name: nowRunning.name,
      kana: nowRunning.kana,
      carNo: nowRunning.car_no,
      order: nowRunning.effective_order,
      effectiveOrder: nowRunning.effective_order,
    } : null,

    nextEntry: next ? {
      id: next.id,
      bibNo: next.bib_no,
      name: next.name,
      kana: next.kana,
      carNo: next.car_no,
      order: next.effective_order,
      effectiveOrder: next.effective_order,
    } : null,

    queue: queue.map((q) => ({
      id: q.id,
      bibNo: q.bib_no,
      name: q.name,
      kana: q.kana,
      carNo: q.car_no,
      order: q.effective_order,
      effectiveOrder: q.effective_order,
      isSkipped: q.is_skipped,
    })),

    selectedEntry: selectedEntry ? {
      id: selectedEntry.id,
      bibNo: selectedEntry.bib_no ?? selectedEntry.bibNo,
      name: selectedEntry.name,
      kana: selectedEntry.kana,
      carNo: selectedEntry.car_no ?? selectedEntry.carNo,
      order: selectedEntry.effective_order ?? selectedEntry.order,
      effectiveOrder: selectedEntry.effective_order ?? selectedEntry.order,
    } : null,

    selectedEntryRuns,
    summary,
  };
}

module.exports = { getDisplayCurrent, getControlState };
