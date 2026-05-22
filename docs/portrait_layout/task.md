# 縦長用レイアウト（1人2行）追加タスク

- [x] `public/settings.html` に「縦長 (1人2行)」(value: 18) のラジオボタンを追加
- [x] `public/js/display.js` で、`rowsPerPage === 18` の場合に `mode-portrait` クラスを付与
- [x] `public/css/display.css` で `body.mode-portrait` のスタイルを定義
  - [x] 画面全体のヘッダー・フッターサイズ調整
  - [x] テーブルと行 (`tr`) をCSS Grid化（2段構成）
  - [x] NameとKanaの併記（CSS Gridでの近接配置またはJSでの結合）
  - [x] 1段目: ステータス、順位、ゼッケン、名前＋カナ、ベスト
  - [x] 2段目: 車番、メモ、中間・ゴールタイム、差分
- [x] 動作確認（ブラウザで縦長サイズにして確認）
