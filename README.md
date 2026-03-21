# soapbox-timer-skeleton

ソープボックスダービー向けのタイム表示・運営制御サーバーの雛形です。

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

## Windowsでも動くか
動きます。Node.js 20系以降が無難です。

### Windowsだけで始めるなら
1. Node.js LTS を入れる
2. このフォルダで `npm install`
3. `npm run init-db`
4. `npm run dev`
5. ブラウザで `http://localhost:3000`

### Linuxサーバーに移すなら
- DBは `data/soapbox.db`
- このプロジェクト一式をコピーすれば起動できます
- 将来は systemd や PM2 で常駐させればよいです

## API入口
- `/api/health`
- `/api/settings`
- `/api/display/current`
- `/api/control/state`

## 注意
この段階ではあくまで雛形です。
フロント画面、CSV出力、認証、バリデーション強化は未実装です。
