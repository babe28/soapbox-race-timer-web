const path = require('node:path');
const { createDb, initDb } = require('../src/db');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), 'data/soapbox.db');

const db = createDb(dbPath);
initDb(db);
console.log(`Initialized database: ${dbPath}`);
