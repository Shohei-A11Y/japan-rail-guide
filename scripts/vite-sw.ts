import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'

/** public 以下のファイル（Service Worker 自身を除く）を、配信時のパスで列挙する */
export function listPublicFiles(dir: string, root = dir): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? listPublicFiles(path, root) : [relative(root, path).split('\\').join('/')]
    })
    .filter((f) => f !== 'sw.js')
    .sort()
}

/** 保存するファイル一覧と、その中身から作る版。中身が変わらなければ版も変わらない */
export function precacheManifest(files: Map<string, string | Uint8Array>): { version: string; urls: string[] } {
  const hash = createHash('sha256')
  const names = [...files.keys()].sort()
  for (const name of names) hash.update(name).update('\0').update(files.get(name)!).update('\0')
  return { version: hash.digest('hex').slice(0, 12), urls: ['./', ...names.map((n) => `./${n}`)] }
}

/** ビルド結果と public のファイルから sw.js を作る Vite プラグイン */
export function serviceWorker(publicDir: string, templatePath: string): Plugin {
  return {
    name: 'japan-rail-guide-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = new Map<string, string | Uint8Array>()
      for (const [name, out] of Object.entries(bundle)) {
        files.set(name, out.type === 'chunk' ? out.code : out.source)
      }
      for (const name of listPublicFiles(publicDir)) files.set(name, readFileSync(join(publicDir, name)))
      const { version, urls } = precacheManifest(files)
      const source = readFileSync(templatePath, 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(urls, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
