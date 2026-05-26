const http = require('node:http');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { createDb, initDb } = require('./db');
const { createClientTracker } = require('./services/clientTracker');
const { createControlLockService } = require('./services/controlLockService');
const { shouldSkipRequestLog } = require('./services/serverLogService');
const { createWsHub } = require('./ws/hub');
const { createSettingsRouter } = require('./routes/settings');
const { createHeatsRouter } = require('./routes/heats');
const { createEntriesRouter } = require('./routes/entries');
const { createRunsRouter } = require('./routes/runs');
const { createDisplayRouter } = require('./routes/display');
const { createControlRouter } = require('./routes/control');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'soapbox.db'));

/** Mutable database holder – allows hot-swap without restarting the server. */
const dbHolder = {
  db: null,
  dbPath: DB_PATH,
  dataDir: DATA_DIR,
};

function openDatabase(dbPath) {
  const db = createDb(dbPath);
  initDb(db);
  return db;
}

dbHolder.db = openDatabase(DB_PATH);

const clientTracker = createClientTracker();
const controlLockService = createControlLockService();

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  clientTracker.recordHttp(req);
  next();
});
app.use(morgan('dev', {
  skip: (req, res) => shouldSkipRequestLog(dbHolder.db, req, res),
}));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath: dbHolder.dbPath });
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/display.html'));
});

app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/control.html'));
});

app.get('/starter', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/starter.html'));
});

app.get('/driver-overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/driver-overlay.html'));
});

app.get('/fastest', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/fastest.html'));
});

const server = http.createServer(app);
const wsHub = createWsHub(server, clientTracker);

/* Proxy object that always forwards to the current database instance.
   This lets all routers keep a single stable reference while the
   underlying db can be swapped at runtime. */
const dbProxy = new Proxy({}, {
  get(_target, prop, _receiver) {
    const db = dbHolder.db;
    const value = db[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});

app.use('/api/settings', createSettingsRouter(dbProxy, wsHub, clientTracker, dbHolder));
app.use('/api/heats', createHeatsRouter(dbProxy, wsHub));
app.use('/api/entries', createEntriesRouter(dbProxy, wsHub));
app.use('/api/runs', createRunsRouter(dbProxy, wsHub));
app.use('/api/display', createDisplayRouter(dbProxy));
app.use('/api/control', createControlRouter(dbProxy, wsHub, controlLockService));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});


server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
