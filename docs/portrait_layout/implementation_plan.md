# 9:16縦長レイアウト（1人2行）の追加

現在のフルHD（16:9）横長レイアウトに加え、デジタルサイネージや縦置きモニターを想定した9:16（縦長）用のレイアウトを追加します。
ドライバー1人あたりの表示エリアを2行（2段）に分割することで、横幅が狭い画面でも文字を大きく、見やすく表示できるようにします。

## ユーザーレビューのお願い (User Review Required)

縦型レイアウト時の表示項目（2行の配置）についてご意見をお聞かせください。
現在以下のような配置を想定していますが、変更の希望はありますか？

**想定する2段レイアウト案（CSS Gridを利用）**
- **1段目:** ステータス(St), 順位(Pos), ゼッケン(No), 名前(Name), 全体ベストまたは目標タイム(Best)
- **2段目:** 車番(Car), メモ(Memo), 中間タイム(R1/R2 Sec), ゴールタイム(R1/R2 Goal), 差分(Diff)
※ 横幅が限られるため、Kanaなどの一部項目は非表示、またはNameと併記するなどの工夫が必要です。

## 変更計画 (Proposed Changes)

### 1. `public/settings.html` の改修
表示レイアウトの「表示サイズ」オプションに、縦長レイアウト用の項目を追加します。
内部的な値（`rowsPerPage`）としては、縦型用の識別として特定の行数（例: `16` または `18`）を割り当てます。

- `rowsPerPage`のラジオボタン一覧に `<label class="radio-card"><input type="radio" name="rowsPerPage" value="18" /> <span>縦型 (1人2行)</span></label>` を追加。

### 2. `public/js/display.js` の改修
追加した行数設定に応じて、`body` 要素に専用のCSSクラス（例: `mode-portrait`）を付与するように変更します。

- `rowsPerPage === 18` の場合に、`body.classList.toggle('mode-portrait', rowsPerPage === 18);` を実行する処理を追加。

### 3. `public/css/display.css` の改修
`mode-portrait` クラスが適用された場合のデザイン定義を追加します。

- `body.mode-portrait` 時の全体レイアウトを調整（縦長画面に合わせてヘッダー、フッターの比率や文字サイズを最適化）。
- テーブル（`table.results-table`）の表示を `display: block` または `display: grid` を活用したスタイルに変更。
- `tr`（各ドライバーの行）を `display: grid` とし、2段構成（`grid-template-rows: auto auto`）に設定。
- 各 `td` を `grid-area` に割り当てて、1段目と2段目に適切に配置。

## 確認計画 (Verification Plan)

1. 設定画面 (`/settings.html`) を開き、「表示サイズ」で「縦型 (1人2行)」が選択できることを確認。
2. 表示画面 (`/display.html`) を開き、ブラウザのウィンドウサイズを 1080x1920 (9:16) にリサイズ。
3. ドライバーの行が2段レイアウトで表示され、レイアウト崩れがないことを確認。
4. タイム更新時等のアニメーション（フラッシュ、スライド）が縦長レイアウトでも正しく機能するか確認。
