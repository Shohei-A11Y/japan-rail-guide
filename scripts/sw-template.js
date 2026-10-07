// 日本鉄道ガイドの Service Worker（ビルド時に scripts/vite-sw.ts が版とファイル一覧を埋め込む）
// - アプリ本体と鉄道データは最初に開いたときにまとめて保存し、以後は保存したものから表示する（オフラインでも見られる）
// - データ更新は新しい版の公開で届く。版が変わると保存し直し、古い版は消す
// - 地図・写真・解説文など他のサイトのものは保存しない
const VERSION = '__VERSION__'
const FILES = __FILES__
const CACHE = `japan-rail-guide-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('japan-rail-guide-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // ハッシュでルーティングしているので、ページの読み込みは常にトップの index.html
  const key = req.mode === 'navigate' ? './' : req
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(key, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || fetch(req)),
    ),
  )
})
