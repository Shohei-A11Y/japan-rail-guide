# 補正表

自動取得データ（国土数値情報など）で足りない・誤っている項目を手元で補うCSV。
`scripts/build-data.ts` が読み込む。**各行に出典（source）を必ず書く。** `#` で始まる行はコメント。

| ファイル | 用途 | 列 |
|---|---|---|
| `n02_fixes.csv` | 元データの誤りの修正（事業者名と路線名の入れ替わり等） | company, line, to_company, to_line, source |
| `wikidata_lines.csv` | Wikidataとの照合結果（表示名・路線色・開業日・軌間・電化方式・記事名・画像）。**手で編集しない**。`npm run data:wikidata` で作り直し、差分を確認してからコミットする | company, line, qid, label, color, opened, gauge_mm, electrification, match, source |
| `wikidata_stations.csv` | 同上（駅の読み仮名・ローマ字・開業日・記事名・画像）。駅IDは `public/data/stations.json` の ID | station_id, name, qid, kana, romaji, opened, wp, image, distance_m, source |
| `wikidata_companies.csv` | 同上（事業者の項目・記事名・画像・設立・本社・公式サイト） | company, qid, label, wp, image, inception, headquarters, website, source |
| `wikidata_vehicles.csv` | 同上（図鑑に載せる車両形式） | qid, name, kind, companies, operators, manufacturers, entry, retired, max_speed_kmh, wp, image, sitelinks, source |
| `line_colors.csv` | 路線カラー（Wikidataの値を上書きしたいとき） | company, line, color, source |
| `line_aliases.csv` | 表示名（Wikidataの値を上書きしたいとき） | company, line, display_name, source |
| `virtual_lines.csv` | 通称区間（ミニ新幹線など、既存路線の一部区間を別の路線として見せる）。同じ name の行は区間をつなげる | name, company, base_line, from, to, shinkansen(yes/no), color, wikidata, source |

`company` と `line`（`base_line`）は国土数値情報（鉄道）の「運営会社」「路線名」の表記どおりに書く（`n02_fixes.csv` で直した後の名前）。`from` / `to` は駅名（「駅」なし）。

表示名と路線色の優先順位: `line_aliases.csv` / `line_colors.csv` → `wikidata_lines.csv` → 元データの路線名／事業者種別ごとの既定色。
Wikidataの路線色は、事業者が定める色指定と細部が異なる場合がある。
