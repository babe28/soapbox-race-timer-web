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
  });
  applySchema();
}

module.exports = { createDb, initDb };
