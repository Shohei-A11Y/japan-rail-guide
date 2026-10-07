import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages のプロジェクトサイトは /<repo>/ 配下で配信される
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/japan-rail-guide/' : '/',
  plugins: [react()],
  build: {
    // 地図ライブラリ（約800KB）はアプリ本体と分けてキャッシュを効かせる
    chunkSizeWarningLimit: 1100,
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'] } } },
  },
  test: { environment: 'node' },
})
