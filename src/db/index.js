const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { schemaStatements, seedStatements } = require('./schema');

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function createDb(dbPath) {
  ensureDirForFile(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initDb(db) {
  const applySchema = db.transaction(() => {
    for (const sql of schemaStatements) db.exec(sql);
    for (const sql of seedStatements) db.exec(sql);
    const heatColumns = db.prepare('PRAGMA table_info(heats)').all();
    if (!heatColumns.some((column) => column.name === 'code')) {
      db.exec('ALTER TABLE heats ADD COLUMN code TEXT');
    }
    const settingsColumns = db.prepare('PRAGMA table_info(settings)').all();
    if (!settingsColumns.some((column) => column.name === 'show_memo')) {
      db.exec('ALTER TABLE settings ADD COLUMN show_memo INTEGER NOT NULL DEFAULT 0');
    }
    if (!settingsColumns.some((column) => column.name === 'memo_title')) {
      db.exec("ALTER TABLE settings ADD COLUMN memo_title TEXT NOT NULL DEFAULT 'Memo'");
    }
    if (!settingsColumns.some((column) => column.name === 'overall_best_include_practice')) {
      db.exec('ALTER TABLE settings ADD COLUMN overall_best_include_practice INTEGER NOT NULL DEFAULT 0');
    }

    const settingsTable = db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'settings'
    `).get();
    if (settingsTable?.sql && settingsTable.sql.includes('rows_per_page IN (20, 30)')) {
      db.exec(`
        ALTER TABLE settings RENAME TO settings_old;
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          event_name TEXT NOT NULL DEFAULT 'Soap Box Derby',
          class_name TEXT NOT NULL DEFAULT 'Super Stock',
          language TEXT NOT NULL DEFAULT 'en',
          rows_per_page INTEGER NOT NULL DEFAULT 20 CHECK (rows_per_page IN (20, 30, 40)),
          show_kana INTEGER NOT NULL DEFAULT 1,
          show_car_no INTEGER NOT NULL DEFAULT 1,
          show_practice INTEGER NOT NULL DEFAULT 1,
          show_memo INTEGER NOT NULL DEFAULT 0,
          show_split INTEGER NOT NULL DEFAULT 1,
          show_clock INTEGER NOT NULL DEFAULT 1,
          show_last_update INTEGER NOT NULL DEFAULT 1,
          show_overall_best INTEGER NOT NULL DEFAULT 1,
          overall_best_include_practice INTEGER NOT NULL DEFAULT 0,
          show_effects INTEGER NOT NULL DEFAULT 1,
          memo_title TEXT NOT NULL DEFAULT 'Memo',
          auto_backup_interval_min INTEGER NOT NULL DEFAULT 5,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO settings (
          id, event_name, class_name, language, rows_per_page,
          show_kana, show_car_no, show_practice, show_memo, show_split,
          show_clock, show_last_update, show_overall_best, overall_best_include_practice,
          show_effects, memo_title, auto_backup_interval_min, created_at, updated_at
        )
        SELECT
          id, event_name, class_name, language, rows_per_page,
          show_kana, show_car_no, show_practice,
          COALESCE(show_memo, 0), show_split,
          show_clock, show_last_update, show_overall_best,
          COALESCE(overall_best_include_practice, 0),
          show_effects, COALESCE(memo_title, 'Memo'), auto_backup_interval_min, created_at, updated_at
        FROM settings_old;
        DROP TABLE settings_old;
      `);
    }
  });
  applySchema();
}

function resetDb(db) {
  const reset = db.transaction(() => {
    db.exec('DELETE FROM display_state');
    db.exec('DELETE FROM runs');
    db.exec('DELETE FROM entry_order_history');
    db.exec('DELETE FROM audit_logs');
    db.exec('DELETE FROM entries');
    db.exec('DELETE FROM heats');
    db.exec('DELETE FROM settings');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('runs', 'entry_order_history', 'audit_logs', 'entries', 'heats')");
    for (const sql of seedStatements) db.exec(sql);
  });
  reset();
}

module.exports = { createDb, initDb, resetDb };
