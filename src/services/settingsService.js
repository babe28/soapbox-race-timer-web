const { toBool } = require('./formatters');

function getSettings(db) {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  return {
    eventName: row.event_name,
    className: row.class_name,
    language: row.language,
    rowsPerPage: row.rows_per_page,
    showKana: toBool(row.show_kana),
    showCarNo: toBool(row.show_car_no),
    showPractice: toBool(row.show_practice),
    showMemo: toBool(row.show_memo),
    showSplit: toBool(row.show_split),
    showClock: toBool(row.show_clock),
    showLastUpdate: toBool(row.show_last_update),
    showOverallBest: toBool(row.show_overall_best),
    showEffects: toBool(row.show_effects),
    memoTitle: row.memo_title,
    autoBackupIntervalMin: row.auto_backup_interval_min,
  };
}

function updateSettings(db, payload) {
  const current = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  const next = {
    event_name: payload.eventName ?? current.event_name,
    class_name: payload.className ?? current.class_name,
    language: payload.language ?? current.language,
    rows_per_page: payload.rowsPerPage ?? current.rows_per_page,
    show_kana: payload.showKana === undefined ? current.show_kana : Number(Boolean(payload.showKana)),
    show_car_no: payload.showCarNo === undefined ? current.show_car_no : Number(Boolean(payload.showCarNo)),
    show_practice: payload.showPractice === undefined ? current.show_practice : Number(Boolean(payload.showPractice)),
    show_memo: payload.showMemo === undefined ? current.show_memo : Number(Boolean(payload.showMemo)),
    show_split: payload.showSplit === undefined ? current.show_split : Number(Boolean(payload.showSplit)),
    show_clock: payload.showClock === undefined ? current.show_clock : Number(Boolean(payload.showClock)),
    show_last_update: payload.showLastUpdate === undefined ? current.show_last_update : Number(Boolean(payload.showLastUpdate)),
    show_overall_best: payload.showOverallBest === undefined ? current.show_overall_best : Number(Boolean(payload.showOverallBest)),
    show_effects: payload.showEffects === undefined ? current.show_effects : Number(Boolean(payload.showEffects)),
    memo_title: payload.memoTitle ?? current.memo_title,
    auto_backup_interval_min: payload.autoBackupIntervalMin ?? current.auto_backup_interval_min,
  };

  db.prepare(`
    UPDATE settings SET
      event_name = @event_name,
      class_name = @class_name,
      language = @language,
      rows_per_page = @rows_per_page,
      show_kana = @show_kana,
      show_car_no = @show_car_no,
      show_practice = @show_practice,
      show_memo = @show_memo,
      show_split = @show_split,
      show_clock = @show_clock,
      show_last_update = @show_last_update,
      show_overall_best = @show_overall_best,
      show_effects = @show_effects,
      memo_title = @memo_title,
      auto_backup_interval_min = @auto_backup_interval_min,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(next);

  return getSettings(db);
}

module.exports = { getSettings, updateSettings };
