import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { serviceWorker } from './scripts/vite-sw'

// GitHub Pages のプロジェクトサイトは /<repo>/ 配下で配信される
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/japan-rail-guide/' : '/',
  plugins: [react(), serviceWorker('public', 'scripts/sw-template.js')],
  build: {
    // 地図ライブラリ（約800KB）はアプリ本体と分けてキャッシュを効かせる
    chunkSizeWarningLimit: 1100,
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'] } } },
  },
  test: { environment: 'node' },
})
