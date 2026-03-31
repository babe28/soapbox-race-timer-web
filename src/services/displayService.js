const { getSettings } = require('./settingsService');
const { formatMs } = require('./formatters');
const { getOverlayPreview } = require('./overlayPreviewService');
const { getSelectionPreview } = require('./selectionPreviewService');

function toIsoTimestamp(value) {
  if (!value) return null;
  const text = String(value);
  return text.endsWith('Z') ? text : `${text}Z`;
}

function getRunTimestamp(run) {
  return String(run?.updated_at || run?.created_at || '');
}

function compareLatestRun(candidate, current) {
  const candidateStamp = getRunTimestamp(candidate);
  const currentStamp = getRunTimestamp(current);
  if (candidateStamp !== currentStamp) return candidateStamp > currentStamp ? -1 : 1;
  return Number(candidate?.id || 0) > Number(current?.id || 0) ? -1 : 1;
}

function pickLatestRun(current, candidate) {
  if (!current) return candidate;
  return compareLatestRun(candidate, current) < 0 ? candidate : current;
}

function pickBestRunForType(current, candidate) {
  if (!current) return candidate;

  const currentPriority = current.status === 'finished' && current.goal_ms !== null && current.goal_ms !== undefined ? 0 : 1;
  const candidatePriority = candidate.status === 'finished' && candidate.goal_ms !== null && candidate.goal_ms !== undefined ? 0 : 1;
  if (candidatePriority !== currentPriority) return candidatePriority < currentPriority ? candidate : current;

  const currentGoal = current.goal_ms ?? Number.POSITIVE_INFINITY;
  const candidateGoal = candidate.goal_ms ?? Number.POSITIVE_INFINITY;
  if (candidateGoal !== currentGoal) return candidateGoal < currentGoal ? candidate : current;

  return compareLatestRun(candidate, current) < 0 ? candidate : current;
}

function pickBestDisplayRun(current, candidate) {
  if (!current) return candidate;

  const currentGoal = Number(current.goal_ms ?? Number.POSITIVE_INFINITY);
  const candidateGoal = Number(candidate.goal_ms ?? Number.POSITIVE_INFINITY);
  if (candidateGoal !== currentGoal) return candidateGoal < currentGoal ? candidate : current;

  return compareLatestRun(candidate, current) < 0 ? candidate : current;
}

function buildRunIndexes(runs, practiceOnly) {
  const bestByEntryAndType = new Map();
  const latestDisplayByEntry = new Map();
  const bestDisplayByEntry = new Map();
  const latestStatusByEntry = new Map();

  for (const run of runs) {
    const entryId = Number(run.entry_id);
    const typeKey = `${entryId}:${run.run_type}`;
    bestByEntryAndType.set(typeKey, pickBestRunForType(bestByEntryAndType.get(typeKey), run));

    if (practiceOnly && run.run_type !== 'practice') {
      continue;
    }

    latestStatusByEntry.set(entryId, pickLatestRun(latestStatusByEntry.get(entryId), run));

    if (run.status === 'finished' && run.goal_ms !== null && run.goal_ms !== undefined) {
      latestDisplayByEntry.set(entryId, pickLatestRun(latestDisplayByEntry.get(entryId), run));
      bestDisplayByEntry.set(entryId, pickBestDisplayRun(bestDisplayByEntry.get(entryId), run));
    }
  }

  return {
    bestByEntryAndType,
    latestDisplayByEntry,
    bestDisplayByEntry,
    latestStatusByEntry,
  };
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

function formatSignedDeltaMs(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '--.---';
  const ms = Number(value);
  const sign = ms >= 0 ? '+' : '-';
  return `${sign}${formatMs(Math.abs(ms))}`;
}

function getFollowingAvailableEntry(db, referenceEntryId) {
  const referenceId = Number(referenceEntryId);
  if (!referenceId) return null;

  const reference = db.prepare(`
    SELECT effective_order, bib_no
    FROM entries
    WHERE id = ?
      AND is_skipped = 0
  `).get(referenceId);

  if (!reference) return null;

  const nextEntry = db.prepare(`
    SELECT id, bib_no, name
    FROM entries
    WHERE is_skipped = 0
      AND id <> ?
      AND (
        effective_order > ?
        OR (effective_order = ? AND bib_no > ?)
      )
    ORDER BY effective_order ASC, bib_no ASC
    LIMIT 1
  `).get(referenceId, reference.effective_order, reference.effective_order, reference.bib_no);

  if (nextEntry) return nextEntry;

  return db.prepare(`
    SELECT id, bib_no, name
    FROM entries
    WHERE is_skipped = 0
      AND id <> ?
    ORDER BY effective_order ASC, bib_no ASC
    LIMIT 1
  `).get(referenceId);
}
// 日本語表示は UTF-8 の生文字を使い、Unicode エスケープを避ける。
function getLanguagePack(language, practiceOnly) {
  const isJa = language === 'ja';
  return {
    labels: {
      pos: practiceOnly ? (isJa ? '練習走行順位' : 'Practice Rank') : (isJa ? '順位' : 'Pos'),
      runStatus: isJa ? '状態' : 'Status',
      no: 'No',
      name: isJa ? '選手名' : 'Name',
      kana: isJa ? 'かな' : 'Kana',
      car: isJa ? '車番' : 'Car',
      memo: isJa ? 'メモ' : 'Memo',
      practice: isJa ? '練習タイム' : 'Practice',
      r1Split: isJa ? 'R1中間' : 'R1-Sec',
      r1Goal: isJa ? 'R1タイム' : 'R1-Goal',
      r2Split: isJa ? 'R2中間' : 'R2-Sec',
      r2Goal: isJa ? 'R2タイム' : 'R2-Goal',
      delta: isJa ? '差分' : 'Diff',
      best: isJa ? 'ベスト' : 'Best',
      event: isJa ? '大会名' : 'Event',
      heat: isJa ? 'ヒート' : 'Heat',
      status: isJa ? '状態' : 'Status',
      lastUpdate: isJa ? '更新時刻' : 'Last Update',
      clock: isJa ? '現在時刻' : 'Clock',
      overallBest: isJa ? '全体ベスト' : 'Overall Best',
      nowRunning: isJa ? '走行中' : 'Now Running',
      next: isJa ? '次走' : 'Next',
      connection: isJa ? '接続' : 'Connection',
    },
    status: {
      waiting: isJa ? '待機中' : 'WAITING',
      preparing: isJa ? '準備中' : 'PREPARING',
      running: isJa ? '走行中' : 'RUNNING',
      finished: isJa ? '終了' : 'FINISHED',
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

  const allEntryRows = [...rankingRows, ...unrunRows];
  const entryIds = allEntryRows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  const runIndexes = entryIds.length
    ? buildRunIndexes(db.prepare(`
        SELECT id, entry_id, run_type, status, split_ms, goal_ms, updated_at, created_at
        FROM runs
        WHERE valid_for_display = 1
          AND entry_id IN (${entryIds.map(() => '?').join(', ')})
      `).all(...entryIds), practiceOnly)
    : buildRunIndexes([], practiceOnly);

  const mapRow = (row) => {
    const entryId = Number(row.id);
    const practice = runIndexes.bestByEntryAndType.get(`${entryId}:practice`);
    const r1 = runIndexes.bestByEntryAndType.get(`${entryId}:race1`);
    const r2 = runIndexes.bestByEntryAndType.get(`${entryId}:race2`);
    const hasBothGoals = r1?.goal_ms !== null && r1?.goal_ms !== undefined
      && r2?.goal_ms !== null && r2?.goal_ms !== undefined;
    const deltaMs = hasBothGoals ? Number(r2.goal_ms) - Number(r1.goal_ms) : null;
    const latestRun = runIndexes.latestDisplayByEntry.get(entryId);
    const bestRun = runIndexes.bestDisplayByEntry.get(entryId);
    const statusRun = runIndexes.latestStatusByEntry.get(entryId);
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
        faster: hasBothGoals ? Number(r1.goal_ms) < Number(r2.goal_ms) : false,
      },
      r2: {
        split: settings.showSplit ? formatMs(r2?.split_ms) : null,
        goal: formatMs(r2?.goal_ms),
        updatedAt: toIsoTimestamp(r2?.updated_at || r2?.created_at),
        faster: hasBothGoals ? Number(r2.goal_ms) < Number(r1.goal_ms) : false,
      },
      delta: formatSignedDeltaMs(deltaMs),
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
  const selectionPreview = getSelectionPreview();
  const previewNowEntry = selectionPreview.entryId
    ? db.prepare(`
        SELECT id, bib_no, name
        FROM entries
        WHERE id = ?
          AND is_skipped = 0
      `).get(selectionPreview.entryId)
    : null;
  const previewNextEntry = previewNowEntry ? getFollowingAvailableEntry(db, previewNowEntry.id) : null;
  const shouldShowQueueNames = (state?.current_status || 'waiting') === 'running';
  const displayNowEntry = shouldShowQueueNames ? (previewNowEntry || nowEntry) : null;
  const displayNextEntry = shouldShowQueueNames ? (previewNextEntry || nextEntry) : null;

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
      className: settings.className,
    },
    settings,
    mode: practiceOnly ? 'practice' : 'race',
    labels: i18n.labels,
    rows,
    nowRunning: displayNowEntry ? `No.${displayNowEntry.bib_no} ${displayNowEntry.name}` : '',
    next: displayNextEntry ? `No.${displayNextEntry.bib_no} ${displayNextEntry.name}` : '',
    connection: {
      connected: (state?.connection_state || 'connected') === 'connected',
    },
    overlayPreview: getOverlayPreview(),
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
    starterReady: Boolean(state?.starter_ready),
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
    overlayPreview: getOverlayPreview(),
    summary,
  };
}

function getStarterState(db) {
  const controlState = getControlState(db);
  return {
    eventName: controlState.eventName,
    heatNo: controlState.heatNo,
    status: controlState.status,
    starterReady: controlState.starterReady,
    nowRunningEntry: controlState.nowRunningEntry,
    nextEntry: controlState.nextEntry,
    lastUpdate: controlState.lastUpdate,
  };
}

module.exports = { getDisplayCurrent, getControlState, getStarterState };
