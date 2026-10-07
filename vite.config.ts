import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages のプロジェクトサイトは /<repo>/ 配下で配信される
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/japan-rail-guide/' : '/',
  plugins: [react()],
  test: { environment: 'node' },
})
