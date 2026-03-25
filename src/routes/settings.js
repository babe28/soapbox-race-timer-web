const express = require('express');
const { getSettings, updateSettings } = require('../services/settingsService');
const { validateLanguage } = require('../services/validation');
const { VALID_REQUEST_LOG_MODES } = require('../services/serverLogService');
const { listServerIpv4Addresses } = require('../services/networkService');
const { resetDb, clearRunsOnly } = require('../db');
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
    { method: 'POST', path: '/api/control/external-time', category: 'control', description: '外部計測のタイムを操作画面へ反映します。', notes: '外部タイマー連携向けです。' },
    { method: 'POST', path: '/api/control/action/set-now', category: 'control', description: '現在走行中の選手を設定します。', notes: '手動で現在走行枠を切り替えます。' },
    { method: 'POST', path: '/api/control/action/set-next', category: 'control', description: '次走の選手を設定します。', notes: '次に走る選手を手動で指定します。' },
    { method: 'POST', path: '/api/control/action/move-next', category: 'control', description: 'キューを次へ進めます。', notes: '現在走行と次走を順送りに更新します。' },
    { method: 'POST', path: '/api/control/action/skip', category: 'control', description: '選手をスキップ扱いにします。', notes: '順番を飛ばして後で戻せます。' },
    { method: 'POST', path: '/api/control/action/unskip', category: 'control', description: 'スキップを解除します。', notes: '飛ばした選手を通常状態へ戻します。' },
    { method: 'POST', path: '/api/control/action/status', category: 'control', description: 'レース状態を変更します。', notes: '待機中、準備中、走行中などを切り替えます。' },
  ];
}

function createSettingsRouter(db, wsHub, clientTracker) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json(getSettings(db));
  });

  router.put('/', (req, res) => {
    if (req.body?.language !== undefined && !validateLanguage(req.body.language)) {
      return res.status(400).json({ error: 'language must be ja or en' });
    }
    if (req.body?.requestLogMode !== undefined && !VALID_REQUEST_LOG_MODES.has(req.body.requestLogMode)) {
      return res.status(400).json({ error: 'requestLogMode is invalid' });
    }
    const result = updateSettings(db, req.body || {});
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

  router.get('/server-addresses', (_req, res) => {
    res.json({
      host: req.get('host') || '',
      origin: `${req.protocol}://${req.get('host') || ''}`,
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
    resetDb(db);
    wsHub.broadcast('settings_updated');
    wsHub.broadcast('entry_updated');
    wsHub.broadcast('heat_updated');
    wsHub.broadcast('run_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true, settings: getSettings(db) });
  });

  router.post('/clear-runs', (_req, res) => {
    clearRunsOnly(db);
    wsHub.broadcast('run_updated');
    wsHub.broadcast('state_update');
    wsHub.broadcast('display_update');
    res.json({ ok: true, settings: getSettings(db) });
  });

  return router;
}

module.exports = { createSettingsRouter };
