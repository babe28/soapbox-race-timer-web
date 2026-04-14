# soapbox-timer-skeleton

ソープボックスダービー向けのタイム表示・運営制御サーバーです。
リザルト表示に特化しています。

## 構成
- Node.js + Express
- SQLite (better-sqlite3)
- WebSocket (`/ws`)
- REST API (`/api/...`)

## できること
- DB初期化
- 設定取得/更新
- ヒート作成/更新
- 選手登録/更新/順序変更/スキップ
- 走行記録登録/更新/rerun作成
- 表示画面向け集計API
- Race Control向け集計API
- WebSocket通知
- OBS向けHTML出力（ベストタイム・走行者）

## セットアップ

```bash
npm install
npm run init-db
npm run dev
```

本番起動:

```bash
npm start
```

## 環境変数
`.env.example` を参考にしてください。

- `PORT`
- `HOST`
- `DB_PATH`

## Windowsでも動くようにしました
Node.js 20系以降推奨


## API入口
- `/api/health`
- `/api/settings`
- `/api/display/current`
- `/api/control/state`
