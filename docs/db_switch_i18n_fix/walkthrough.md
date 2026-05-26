# Walkthrough: DB切り替え・i18n・リザルト画面修正

## 変更概要

3つの機能を実装しました：

1. **results-overview.html の色合い修正**
2. **レースコントロール画面の日本語化（i18n対応）**
3. **データベース切り替え機能**

---

## 1. results-overview.html の色合い修正

### 問題
ライトテーマ（白背景）のページで、ダークテーマ用の `ghost-button`（暗い背景＋白テキスト）がそのまま適用されており、ボタンのテキストが見えにくい状態だった。

### 修正内容
`results-overview.css` にライトテーマ用のオーバーライドスタイルを追加。

- `.overview-body .ghost-button` → 白背景、ダーク文字、ボーダー付き
- `.overview-body .panel` → 白背景
- `.overview-body .page-header h1` → ダークカラー
- ホバー時のインタラクション追加

### 変更ファイル
- `public/css/results-overview.css`

---

## 2. レースコントロール画面の日本語化

### 設計方針
- **control-i18n.js** を新規作成し、翻訳辞書と適用関数を分離
- HTMLの各要素に `data-i18n` 属性を追加して翻訳対象を明示
- `control.js` では最小限の変更で、`DOMContentLoaded` 時に `/api/settings` から言語設定を取得し `applyControlLanguage()` を呼び出す
- WebSocket経由で `settings_updated` イベント受信時にも言語を再読み込み

### 日本語化対象
- ページタイトル・サブタイトル
- ヘッダーのリンクボタン（表示画面を開く、スターター等）
- セクションタイトル（ヒート / ステータス、キュー操作等）
- ステータスボタン（待機、準備中、走行中、終了）
- キュー操作ボタン（次走→走行中、スキップ等）
- 走行種別ボタン（練習、1本目、2本目、再走）
- タイム入力ラベル（中間タイム、ゴールタイム）
- ステータスオプション（完走、失格、DNF等）
- アクションボタン（保存、次へ、保存して次へ、リセット等）
- 履歴テーブルヘッダー
- alert/confirmメッセージ
- ロック画面テキスト

### 変更ファイル
- `public/js/control-i18n.js` （新規）
- `public/js/control.js`
- `public/control.html`

---

## 3. データベース切り替え機能

### 設計

#### サーバー側
- `server.js` に `dbHolder` オブジェクトを導入し、`Proxy` を使って全ルーターに動的なDB参照を提供
- これにより、DBインスタンスを差し替えてもルーター側のコード変更が不要
- `createSettingsRouter` に `dbHolder` を第4引数として追加

#### API追加
| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/settings/databases` | data フォルダ内の .db ファイル一覧を返す |
| `POST` | `/api/settings/switch-db` | 指定DBファイルに切り替え |
| `POST` | `/api/settings/create-db` | 新規DBを `soapbox-YYMMDD-HHMM.db` 形式で作成し切り替え |

#### DB初期化（リセット）時の変更
- 従来: テーブルの中身を削除
- 変更後: 新しいDBファイル（`soapbox-YYMMDD-HHMM.db`）を作成して切り替え。元のDBファイルは保存される

#### セキュリティ
- ファイル名にパストラバーサル文字(`/`, `\`, `..`)を含む場合はエラー
- `.db` 拡張子のみ受け付け
- data ディレクトリ直下のファイルのみ操作可能

#### UI
- 設定画面の右パネル「メンテナンス」セクションの上に「データベース管理」セクションを追加
- 現在使用中のDB名を表示
- DB一覧表示（ファイル名、サイズ、更新日時、使用中の表示）
- 「切り替え」ボタンで即座にDBを切り替え
- 「新規DB作成」ボタンで新しいDBを作成して切り替え

### 変更ファイル
- `src/server.js`
- `src/routes/settings.js`
- `public/settings.html`
- `public/js/settings.js`
- `public/css/settings.css`
