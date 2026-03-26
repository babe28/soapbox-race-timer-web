const http = require('node:http');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { createDb, initDb } = require('./db');
const { createClientTracker } = require('./services/clientTracker');
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
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(process.cwd(), 'data', 'soapbox.db'));

const db = createDb(DB_PATH);
initDb(db);
const clientTracker = createClientTracker();

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  clientTracker.recordHttp(req);
  next();
});
app.use(morgan('dev', {
  skip: (req, res) => shouldSkipRequestLog(db, req, res),
}));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath: DB_PATH });
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/display.html'));
});

app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/control.html'));
});

app.get('/driver-overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/driver-overlay.html'));
});

app.get('/fastest', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/fastest.html'));
});

const server = http.createServer(app);
const wsHub = createWsHub(server, clientTracker);

app.use('/api/settings', createSettingsRouter(db, wsHub, clientTracker));
app.use('/api/heats', createHeatsRouter(db, wsHub));
app.use('/api/entries', createEntriesRouter(db, wsHub));
app.use('/api/runs', createRunsRouter(db, wsHub));
app.use('/api/display', createDisplayRouter(db));
app.use('/api/control', createControlRouter(db, wsHub));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});


server.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
