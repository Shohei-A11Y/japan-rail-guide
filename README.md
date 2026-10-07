# japan-rail-guide（日本鉄道ガイド）

全国の鉄道（事業者・路線・駅・車両形式）を、眺めて楽しめる基本情報データベースのPWA。
アカウント不要。データは公開オープンデータのみを使い、月1回程度、自動更新する。

- 設計書: [docs/DESIGN.md](docs/DESIGN.md)
- 技術: TypeScript + React + Vite / MapLibre + PMTiles（予定）/ GitHub Pages

## 開発
```
npm install
npm run dev        # 開発サーバー
npm run typecheck  # 型チェック
npm run lint
npm test
npm run build
```

## データの出典
取得元・ライセンスの一覧は、データ取り込み実装時に追記する。
