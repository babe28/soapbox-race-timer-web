const { getSettings } = require('./settingsService');
const { formatMs } = require('./formatters');

function toIsoTimestamp(value) {
  if (!value) return null;
  const text = String(value);
  return text.endsWith('Z') ? text : `${text}Z`;
}

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

function getLatestDisplayRunByEntry(db, entryId, practiceOnly) {
  return db.prepare(`
    SELECT *
    FROM runs
    WHERE entry_id = ?
      AND valid_for_display = 1
      AND status = 'finished'
      AND goal_ms IS NOT NULL
      ${practiceOnly ? `AND run_type = 'practice'` : ''}
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
    LIMIT 1
  `).get(entryId);
}

function getBestDisplayRunByEntry(db, entryId, practiceOnly) {
  return db.prepare(`
    SELECT *
    FROM runs
    WHERE entry_id = ?
      AND valid_for_display = 1
      AND status = 'finished'
      AND goal_ms IS NOT NULL
      ${practiceOnly ? `AND run_type = 'practice'` : ''}
    ORDER BY goal_ms ASC, COALESCE(updated_at, created_at) DESC, id DESC
    LIMIT 1
  `).get(entryId);
}

function getLatestStatusRunByEntry(db, entryId, practiceOnly) {
  return db.prepare(`
    SELECT *
    FROM runs
    WHERE entry_id = ?
      AND valid_for_display = 1
      ${practiceOnly ? `AND run_type = 'practice'` : ''}
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
    LIMIT 1
  `).get(entryId);
}

function getRunStatusBadge(status) {
  switch (status) {
    case 'finished':
      return { code: 'Finish', tone: 'finished' };
    case 'pending':
      return { code: 'Ready', tone: 'pending' };
    case 'dq':
      return { code: 'DQ', tone: 'dq' };
    case 'dnf':
      return { code: 'DNF', tone: 'dnf' };
    case 'scratch':
      return { code: 'SCR', tone: 'scratch' };
    case 'void':
      return { code: 'Void', tone: 'void' };
    default:
      return { code: '', tone: 'empty' };
  }
}

function formatJstTime(value) {
  if (!value) return '-';
  const date = new Date(String(value).endsWith('Z') ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
//　日本語表示切り替え部分Unicodeエスケープしてます
function getLanguagePack(language, practiceOnly) {
  const isJa = language === 'ja';
  return {
    labels: {
      pos: practiceOnly ? (isJa ? '\u7df4\u7fd2\u8d70\u884c\u9806\u4f4d' : 'Practice Rank') : (isJa ? '\u9806\u4f4d' : 'Pos'),
      runStatus: isJa ? '\u72b6\u614b' : 'Status',
      no: 'No',
      name: isJa ? '\u9078\u624b\u540d' : 'Name',
      kana: isJa ? '\u304b\u306a' : 'Kana',
      car: isJa ? '\u8eca\u756a' : 'Car',
      memo: isJa ? '\u30e1\u30e2' : 'Memo',
      practice: isJa ? '\u7df4\u7fd2' : 'Practice',
      r1Split: isJa ? 'R1\u4e2d\u9593' : 'R1-Sec',
      r1Goal: isJa ? 'R1\u30b4\u30fc\u30eb' : 'R1-Goal',
      r2Split: isJa ? 'R2\u4e2d\u9593' : 'R2-Sec',
      r2Goal: isJa ? 'R2\u30b4\u30fc\u30eb' : 'R2-Goal',
      best: isJa ? '\u30d9\u30b9\u30c8' : 'Best',
      event: isJa ? '\u5927\u4F1A\u540D' : 'Event',
      heat: isJa ? '\u30d2\u30fc\u30c8' : 'Heat',
      status: isJa ? '\u72b6\u614b' : 'Status',
      lastUpdate: isJa ? '\u66f4\u65b0\u6642\u523b' : 'Last Update',
      clock: isJa ? '\u73fe\u5728\u6642\u523b' : 'Clock',
      overallBest: isJa ? '\u5168\u4f53\u30d9\u30b9\u30c8' : 'Overall Best',
      nowRunning: isJa ? '\u8d70\u884c\u4e2d' : 'Now Running',
      next: isJa ? '\u6b21\u8d70' : 'Next',
      connection: isJa ? '\u63a5\u7d9a' : 'Connection',
    },
    status: {
      waiting: isJa ? '\u5f85\u6a5f\u4e2d' : 'WAITING',
      preparing: isJa ? '\u6e96\u5099\u4e2d' : 'PREPARING',
      running: isJa ? '\u8d70\u884c\u4e2d' : 'RUNNING',
      finished: isJa ? '\u7d42\u4e86' : 'FINISHED',
    },
  };
}

function getDisplayCurrent(db) {
  const settings = getSettings(db);
  const state = db.prepare(`
    SELECT ds.*, h.heat_no, h.code AS heat_code
    FROM display_state ds
    LEFT JOIN heats h ON h.id = ds.current_heat_id
    WHERE ds.id = 1
  `).get();

  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM entries) AS total_entries,
      (SELECT COUNT(DISTINCT entry_id)
       FROM runs
       WHERE run_type = 'practice'
         AND status = 'finished'
         AND goal_ms IS NOT NULL) AS practice_entries,
      (SELECT COUNT(*)
       FROM runs
       WHERE run_type IN ('race1', 'race2', 'rerun')
         AND status = 'finished'
         AND goal_ms IS NOT NULL
         AND valid_for_display = 1) AS race_run_count
  `).get();

  const practiceOnly = totals.total_entries > 0
    && totals.practice_entries === totals.total_entries
    && totals.race_run_count === 0;
  const i18n = getLanguagePack(settings.language, practiceOnly);

  const rankingRows = db.prepare(practiceOnly ? `
    SELECT
      e.id,
      e.bib_no,
      e.name,
      e.kana,
      e.car_no,
      e.memo,
      MIN(r.goal_ms) AS best_goal_ms,
      ROW_NUMBER() OVER (ORDER BY MIN(r.goal_ms) ASC, e.effective_order ASC, e.bib_no ASC) AS rank_no
    FROM entries e
    JOIN runs r ON r.entry_id = e.id
    WHERE r.run_type = 'practice'
      AND r.status = 'finished'
      AND r.goal_ms IS NOT NULL
    GROUP BY e.id, e.bib_no, e.name, e.kana, e.car_no, e.memo, e.effective_order
    ORDER BY best_goal_ms ASC, e.effective_order ASC, e.bib_no ASC
  ` : `
    SELECT
      e.id,
      e.bib_no,
      e.name,
      e.kana,
      e.car_no,
      e.memo,
      MIN(r.goal_ms) AS best_goal_ms,
      ROW_NUMBER() OVER (ORDER BY MIN(r.goal_ms) ASC, e.effective_order ASC, e.bib_no ASC) AS rank_no
    FROM entries e
    JOIN runs r ON r.entry_id = e.id
    WHERE r.valid_for_ranking = 1
      AND r.status = 'finished'
      AND r.goal_ms IS NOT NULL
    GROUP BY e.id, e.bib_no, e.name, e.kana, e.car_no, e.memo, e.effective_order
    ORDER BY best_goal_ms ASC, e.effective_order ASC, e.bib_no ASC
  `).all();

  const unrunRows = db.prepare(practiceOnly ? `
    SELECT e.id, e.bib_no, e.name, e.kana, e.car_no, e.memo, e.effective_order
    FROM entries e
    WHERE e.id NOT IN (
      SELECT DISTINCT entry_id
      FROM runs
      WHERE run_type = 'practice'
        AND status = 'finished'
        AND goal_ms IS NOT NULL
    )
    ORDER BY e.effective_order ASC, e.bib_no ASC
  ` : `
    SELECT e.id, e.bib_no, e.name, e.kana, e.car_no, e.memo, e.effective_order
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
      ${practiceOnly
        ? `AND run_type = 'practice'`
        : settings.overallBestIncludePractice
          ? ''
          : `AND run_type <> 'practice'`}
    ORDER BY goal_ms ASC
    LIMIT 1
  `).get();

  const mapRow = (row) => {
    const practice = getBestRunByEntryAndType(db, row.id, 'practice');
    const r1 = getBestRunByEntryAndType(db, row.id, 'race1');
    const r2 = getBestRunByEntryAndType(db, row.id, 'race2');
    const latestRun = getLatestDisplayRunByEntry(db, row.id, practiceOnly);
    const bestRun = getBestDisplayRunByEntry(db, row.id, practiceOnly);
    const statusRun = getLatestStatusRunByEntry(db, row.id, practiceOnly);
    const statusBadge = row.rank_no ? getRunStatusBadge(statusRun?.status) : { code: '', tone: 'empty' };

    return {
      status: statusBadge.code,
      statusTone: statusBadge.tone,
      rank: row.rank_no ?? null,
      bibNo: row.bib_no,
      name: row.name,
      kana: row.kana,
      carNo: row.car_no,
      memo: row.memo,
      practice: (settings.showPractice || practiceOnly) ? formatMs(practice?.goal_ms) : null,
      r1: {
        split: settings.showSplit ? formatMs(r1?.split_ms) : null,
        goal: formatMs(r1?.goal_ms),
        updatedAt: toIsoTimestamp(r1?.updated_at || r1?.created_at),
      },
      r2: {
        split: settings.showSplit ? formatMs(r2?.split_ms) : null,
        goal: formatMs(r2?.goal_ms),
        updatedAt: toIsoTimestamp(r2?.updated_at || r2?.created_at),
      },
      best: row.best_goal_ms !== undefined ? formatMs(row.best_goal_ms) : '--.---',
      highlight: false,
      highlightUpdatedAt: toIsoTimestamp(latestRun?.updated_at || latestRun?.created_at),
      practiceUpdatedAt: toIsoTimestamp(practice?.updated_at || practice?.created_at),
      bestUpdatedAt: toIsoTimestamp(bestRun?.updated_at || bestRun?.created_at),
    };
  };

  const rows = [...rankingRows.map(mapRow), ...unrunRows.map(mapRow)];
  if (settings.displaySortMode === 'bib') {
    rows.sort((a, b) => Number(a.bibNo || 0) - Number(b.bibNo || 0));
  }
  const nowEntry = state?.now_running_entry_id
    ? db.prepare('SELECT bib_no, name FROM entries WHERE id = ?').get(state.now_running_entry_id)
    : null;
  const nextEntry = state?.next_entry_id
    ? db.prepare('SELECT bib_no, name FROM entries WHERE id = ?').get(state.next_entry_id)
    : null;

  return {
    header: {
      heat: state?.heat_code || state?.heat_no || null,
      status: i18n.status[state?.current_status || 'waiting'],
      lastUpdate: formatJstTime(state?.last_update_at),
      clock: new Date().toLocaleTimeString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour12: false,
      }),
      overallBest: formatMs(overallBest?.goal_ms),
      eventName: settings.eventName,
    },
    settings,
    mode: practiceOnly ? 'practice' : 'race',
    labels: i18n.labels,
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
    SELECT ds.*, h.heat_no, h.code AS heat_code
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
    eventName: settings.eventName || 'Soap Box Derby',
    heatId: state?.current_heat_id ?? null,
    heatNo: state?.heat_code || state?.heat_no || null,
    status: state?.current_status || 'waiting',
    overallBest: overallBest?.goal_ms ?? null,
    lastUpdate: formatJstTime(state?.last_update_at),

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
