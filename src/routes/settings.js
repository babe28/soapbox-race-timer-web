const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { getSettings, updateSettings } = require('../services/settingsService');
const { validateLanguage } = require('../services/validation');
const { VALID_REQUEST_LOG_MODES } = require('../services/serverLogService');
const { listServerIpv4Addresses } = require('../services/networkService');
const { createDb, initDb, resetDb, clearRunsOnly } = require('../db');
const { getDisplayCurrent } = require('../services/displayService');
const { listAuditLogs, clearAuditLogs } = require('../services/auditService');

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildResultsCsv(rows) {
  const headers = ['Status', 'Pos', 'No', 'Name', 'Kana', 'Car', 'Memo', 'Practice', 'R1 Split', 'R1 Goal', 'R2 Split', 'R2 Goal', 'Best'];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.status,
      row.rank ?? '',
      row.bibNo,
      row.name,
      row.kana,
      row.carNo,
      row.memo,
      row.practice,
      row.r1?.split,
      row.r1?.goal,
      row.r2?.split,
      row.r2?.goal,
      row.best,
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

/** Generate a DB filename like soapbox-260525-1133.db */
function generateDbName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yy = pad(now.getFullYear() % 100);
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return `soapbox-${yy}${MM}${dd}-${hh}${mm}.db`;
}

function getApiCatalog() {
  return [
    { method: 'GET', path: '/api/health', category: 'system', description: 'サーバーが動作しているか確認します。', notes: '疎通確認用の軽い API です。' },
    { method: 'GET', path: '/api/settings', category: 'settings', description: '現在の設定値を読み込みます。', notes: '設定画面の初期表示や再読込で使います。' },
    { method: 'PUT', path: '/api/settings', category: 'settings', description: '設定を更新します。', notes: '大会名、表示項目、ログ設定などを保存します。' },
    { method: 'POST', path: '/api/settings/reset-db', category: 'settings', description: 'データベースを初期化します。', notes: 'ヒート、エントリー、走行データをまとめて削除します。' },
    { method: 'POST', path: '/api/settings/clear-runs', category: 'runs', description: '走行タイムだけを削除します。', notes: 'エントリーやヒートは残したまま、結果だけリセットします。' },
    { method: 'GET', path: '/api/settings/export/results.csv', category: 'settings', description: '現在の結果を CSV で書き出します。', notes: '集計確認や外部保存用です。' },
    { method: 'GET', path: '/api/settings/logs', category: 'system', description: '操作ログを取得します。', notes: 'いつ何を操作したかを確認できます。' },
    { method: 'POST', path: '/api/settings/clear-logs', category: 'system', description: '操作ログだけを削除します。', notes: 'レースデータには影響しません。' },
    { method: 'GET', path: '/api/settings/clients', category: 'system', description: '接続中または最近アクセスした端末を取得します。', notes: '表示画面や操作端末の利用状況を確認できます。' },
    { method: 'GET', path: '/api/settings/server-addresses', category: 'system', description: 'サーバーの IPv4 アドレス一覧を取得します。', notes: 'LAN 内の別端末からアクセスする際の確認用です。' },
    { method: 'GET', path: '/api/settings/apis', category: 'system', description: 'API 一覧を取得します。', notes: 'この設定画面の API 一覧表示に使います。' },
    { method: 'GET', path: '/api/entries', category: 'entries', description: 'エントリー一覧を取得します。', notes: '選手情報や並び順の取得に使います。' },
    { method: 'POST', path: '/api/entries', category: 'entries', description: 'エントリーを追加します。', notes: '新しい選手や車両を登録します。' },
    { method: 'PUT', path: '/api/entries/:id', category: 'entries', description: 'エントリーを更新します。', notes: '名前、かな、車番、順番などを変更します。' },
    { method: 'DELETE', path: '/api/entries/:id', category: 'entries', description: 'エントリーを削除します。', notes: '対象の選手データを 1 件削除します。' },
    { method: 'GET', path: '/api/runs', category: 'runs', description: '走行データ一覧を取得します。', notes: '練習や本走行の記録確認に使います。' },
    { method: 'POST', path: '/api/runs', category: 'runs', description: '走行データを追加します。', notes: '外部計測や手動登録から記録を追加します。' },
    { method: 'PUT', path: '/api/runs/:id', category: 'runs', description: '走行データを更新します。', notes: 'タイムや状態の修正に使います。' },
    { method: 'DELETE', path: '/api/runs/:id', category: 'runs', description: '走行データを削除します。', notes: '誤記録の削除用です。' },
    { method: 'GET', path: '/api/display/current', category: 'display', description: '表示画面用の描画データを取得します。', notes: 'ランキング、見出し、現在走行情報をまとめて返します。' },
    { method: 'GET', path: '/api/control/state', category: 'control', description: 'レース操作画面の状態を取得します。', notes: '現在走行、次走、キュー状況などを含みます。' },
    { method: 'POST', path: '/api/control/external-time', category: 'control', description: '外部計測のタイムを操作画面へ反映します。', notes: '外部タイマー連携向けです。upper / lower に digit-only（例: 12345 → 12.345）または SS.sss（例: 12.345）を指定できます。' },
    { method: 'POST', path: '/api/control/action/set-now', category: 'control', description: '現在走行中の選手を設定します。', notes: '手動で現在走行枠を切り替えます。' },
    { method: 'POST', path: '/api/control/action/set-next', category: 'control', description: '次走の選手を設定します。', notes: '次に走る選手を手動で指定します。' },
    { method: 'POST', path: '/api/control/action/move-next', category: 'control', description: 'キューを次へ進めます。', notes: '現在走行と次走を順送りに更新します。' },
    { method: 'POST', path: '/api/control/action/skip', category: 'control', description: '選手をスキップ扱いにします。', notes: '順番を飛ばして後で戻せます。' },
    { method: 'POST', path: '/api/control/action/unskip', category: 'control', description: 'スキップを解除します。', notes: '飛ばした選手を通常状態へ戻します。' },
    { method: 'POST', path: '/api/control/action/status', category: 'control', description: 'レース状態を変更します。', notes: '待機中、準備中、走行中などを切り替えます。' },
    { method: 'GET', path: '/api/settings/databases', category: 'settings', description: 'data フォルダ内の DB ファイル一覧を返します。', notes: 'DB 切り替え画面で使用します。' },
    { method: 'POST', path: '/api/settings/switch-db', category: 'settings', description: '使用する DB ファイルを切り替えます。', notes: 'サーバー再起動なしで DB を切り替えます。' },
    { method: 'POST', path: '/api/settings/create-db', category: 'settings', description: '新しい DB ファイルを作成して切り替えます。', notes: 'soapbox-YYMMDD-HHMM.db 形式で自動命名します。' },
  ];
}

function createSettingsRouter(db, wsHub, clientTracker, dbHolder) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    const settings = getSettings(db);
    settings.currentDb = dbHolder ? path.basename(dbHolder.dbPath) : '';
    res.json(settings);
  });

  router.put('/', (req, res) => {
    if (req.body?.language !== undefined && !validateLanguage(req.body.language)) {
      return res.status(400).json({ error: 'language must be ja or en' });
    }
    if (req.body?.rowsPerPage !== undefined && ![15, 18, 20, 30, 35, 40].includes(Number(req.body.rowsPerPage))) {
      return res.status(400).json({ error: 'rowsPerPage is invalid' });
    }
    if (req.body?.slidePageMs !== undefined) {
      const slidePageMs = Number(req.body.slidePageMs);
      if (!Number.isFinite(slidePageMs) || slidePageMs < 2000 || slidePageMs > 30000) {
        return res.status(400).json({ error: 'slidePageMs must be between 2000 and 30000' });
      }
    }
    if (req.body?.requestLogMode !== undefined && !VALID_REQUEST_LOG_MODES.has(req.body.requestLogMode)) {
      return res.status(400).json({ error: 'requestLogMode is invalid' });
    }
    const result = updateSettings(db, req.body || {});
    result.currentDb = dbHolder ? path.basename(dbHolder.dbPath) : '';
    wsHub.broadcast('settings_updated');
    wsHub.broadcast('display_update');
    res.json(result);
  });

  router.get('/export/results.csv', (_req, res) => {
    const display = getDisplayCurrent(db);
    const csv = buildResultsCsv(display.rows || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="soapbox-results.csv"');
    res.send(`\uFEFF${csv}`);
  });

  router.get('/logs', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(listAuditLogs(db, limit));
  });

  router.get('/clients', (_req, res) => {
    res.json(clientTracker?.listClients?.() || []);
  });

  router.get('/server-addresses', (req, res) => {
    res.json({
      host: req.get('host') || '',
      origin: `${req.protocol}://${req.get('host') || ''}`,
      listenHost: process.env.HOST || '0.0.0.0',
      ipv4: listServerIpv4Addresses(),
    });
  });

  router.post('/clear-logs', (_req, res) => {
    clearAuditLogs(db);
    res.json({ ok: true });
  });

  router.get('/apis', (_req, res) => {
    res.json(getApiCatalog());
  });

  router.post('/reset-db', (_req, res) => {
    if (dbHolder) {
      // Close old DB and create a new one with timestamped name
      try {
        dbHolder.db.close();
      } catch (_err) { /* ignore */ }
      const newName = generateDbName();
      const newPath = path.join(dbHolder.dataDir, newName);
      const newDb = createDb(newPath);
      initDb(newDb);
      dbHolder.db = newDb;
      dbHolder.dbPath = newPath;
      console.log(`Database reset → ${newPath}`);
    } else {
      resetDb(db);
    }
    wsHub.broadcast('settings_updated');
    wsHub.broadcast('entry_updated');
    wsHub.broadcast('heat_updated');
    wsHub.broadcast('run_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true, settings: getSettings(db), currentDb: dbHolder ? path.basename(dbHolder.dbPath) : '' });
  });

  router.post('/clear-runs', (_req, res) => {
    clearRunsOnly(db);
    wsHub.broadcast('run_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true, settings: getSettings(db) });
  });

  /* ── Database management APIs ──────────────────────── */

  /** List .db files in data directory */
  router.get('/databases', (_req, res) => {
    if (!dbHolder) {
      return res.status(500).json({ error: 'Database management is not available' });
    }
    try {
      const files = fs.readdirSync(dbHolder.dataDir)
        .filter((f) => f.endsWith('.db'))
        .map((f) => {
          const fullPath = path.join(dbHolder.dataDir, f);
          const stat = fs.statSync(fullPath);
          return {
            name: f,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            active: path.basename(dbHolder.dbPath) === f,
          };
        })
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
      res.json({ databases: files, current: path.basename(dbHolder.dbPath) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to list databases' });
    }
  });

  /** Switch to an existing .db file */
  router.post('/switch-db', (req, res) => {
    if (!dbHolder) {
      return res.status(500).json({ error: 'Database management is not available' });
    }
    const filename = req.body?.filename;
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'filename is required' });
    }
    // Security: only allow .db files directly in data dir (no path traversal)
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || !filename.endsWith('.db')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const targetPath = path.join(dbHolder.dataDir, filename);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }
    try {
      // Close current DB
      try {
        dbHolder.db.close();
      } catch (_err) { /* ignore */ }
      // Open new DB
      const newDb = createDb(targetPath);
      initDb(newDb);
      dbHolder.db = newDb;
      dbHolder.dbPath = targetPath;
      console.log(`Database switched → ${targetPath}`);

      wsHub.broadcast('settings_updated');
      wsHub.broadcast('entry_updated');
      wsHub.broadcast('heat_updated');
      wsHub.broadcast('run_updated');
      wsHub.broadcast('state_update');
      wsHub.broadcast('display_update');
      res.json({ ok: true, current: filename, settings: getSettings(db) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to switch database' });
    }
  });

  /** Create a new DB file and switch to it */
  router.post('/create-db', (req, res) => {
    if (!dbHolder) {
      return res.status(500).json({ error: 'Database management is not available' });
    }
    try {
      const newName = req.body?.filename || generateDbName();
      // Validate
      if (newName.includes('/') || newName.includes('\\') || newName.includes('..') || !newName.endsWith('.db')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const newPath = path.join(dbHolder.dataDir, newName);
      if (fs.existsSync(newPath)) {
        return res.status(409).json({ error: 'Database file already exists' });
      }
      // Close current DB
      try {
        dbHolder.db.close();
      } catch (_err) { /* ignore */ }
      // Create and open new DB
      const newDb = createDb(newPath);
      initDb(newDb);
      dbHolder.db = newDb;
      dbHolder.dbPath = newPath;
      console.log(`New database created → ${newPath}`);

      wsHub.broadcast('settings_updated');
      wsHub.broadcast('entry_updated');
      wsHub.broadcast('heat_updated');
      wsHub.broadcast('run_updated');
      wsHub.broadcast('state_update');
      wsHub.broadcast('display_update');
      res.json({ ok: true, current: newName, settings: getSettings(db) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create database' });
    }
  });

  return router;
}

module.exports = { createSettingsRouter };
