# japan-rail-guide（日本鉄道ガイド）

全国の鉄道（事業者・路線・駅・車両形式）を、眺めて楽しめる基本情報データベースのPWA。
アカウント不要。データは公開オープンデータのみを使い、月1回程度、自動更新する。

- 設計書: [docs/DESIGN.md](docs/DESIGN.md)
- 公開URL: https://shohei-a11y.github.io/japan-rail-guide/
- 技術: TypeScript + React + Vite / MapLibre GL / GitHub Pages

## 開発
```
npm install
npm run dev          # 開発サーバー
npm run typecheck    # 型チェック
npm run lint
npm test
npm run build
npm run data:build   # 公開データ（public/data）を作り直す。-- --refresh で取得し直す
```

## データの流れ
1. `scripts/build-data.ts` が国土数値情報（鉄道・駅別乗降客数）をダウンロードし、`data/overrides/` の補正表を当てて、
   `public/data/`（`meta.json` / `lines.json` / `stations.json` / `network.geojson`）を作る。
   路線数・駅数などが想定外なら異常終了し、前回のデータを上書きしない。
2. GitHub Actions の `Update data` が毎月3日に 1. を実行し、データに変化があればコミットする。続けて `Deploy to GitHub Pages` が公開する。

## データの出典
- 「国土数値情報（鉄道データ）」「国土数値情報（駅別乗降客数データ）」（国土交通省）を加工して作成（CC BY 4.0）
- 背景地図: 地理院タイル（淡色地図）

詳しくはアプリ内の「出典・説明」ページを参照。
