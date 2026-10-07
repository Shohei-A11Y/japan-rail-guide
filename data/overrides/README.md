# 補正表

自動取得データ（国土数値情報など）で足りない・誤っている項目を手元で補うCSV。
`scripts/build-data.ts` が読み込む。**各行に出典（source）を必ず書く。** `#` で始まる行はコメント。

| ファイル | 用途 | 列 |
|---|---|---|
| `n02_fixes.csv` | 元データの誤りの修正（事業者名と路線名の入れ替わり等） | company, line, to_company, to_line, source |
| `line_colors.csv` | 公式の路線カラー | company, line, color, source |
| `line_aliases.csv` | 表示名（愛称・系統名・通称） | company, line, display_name, source |
| `shinkansen_tags.csv` | 新幹線タグ（ミニ新幹線など、元データ上は在来線のもの） | company, line, source |

`company` と `line` は国土数値情報（鉄道）の「運営会社」「路線名」の表記どおりに書く（`n02_fixes.csv` で直した後の名前）。
補正表に無い路線は、事業者種別ごとの既定色で表示する（公式の色ではない）。
