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
