import { useEffect, useRef, useState } from 'react'

// GitHub Pages（静的ホスト）でも共有URLが使えるよう、ハッシュでルーティングする
export type Route =
  | { page: 'home' }
  | { page: 'line'; id: string }
  | { page: 'station'; id: string }
  | { page: 'lines' }
  | { page: 'search'; q: string }
  | { page: 'prefs' }
  | { page: 'pref'; name: string }
  | { page: 'rankings' }
  | { page: 'company'; name: string }
  | { page: 'vehicles' }
  | { page: 'vehicle'; id: string }
  | { page: 'favorites' }
  | { page: 'route'; from: string; to: string }
  | { page: 'play' }
  | { page: 'about' }
  | { page: 'notfound' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const params = new URLSearchParams(query)
  if (parts.length === 0) return { page: 'home' }
  if (parts[0] === 'search' && parts.length === 1) return { page: 'search', q: params.get('q') ?? '' }
  if (parts[0] === 'prefs' && parts.length === 1) return { page: 'prefs' }
  if (parts[0] === 'pref' && parts[1]) return { page: 'pref', name: parts[1] }
  if (parts[0] === 'rankings' && parts.length === 1) return { page: 'rankings' }
  if (parts[0] === 'company' && parts[1]) return { page: 'company', name: parts[1] }
  if (parts[0] === 'vehicles' && parts.length === 1) return { page: 'vehicles' }
  if (parts[0] === 'favorites' && parts.length === 1) return { page: 'favorites' }
  if (parts[0] === 'play' && parts.length === 1) return { page: 'play' }
  if (parts[0] === 'route' && parts.length === 1) return { page: 'route', from: params.get('from') ?? '', to: params.get('to') ?? '' }
  if (parts[0] === 'vehicle' && parts[1]) return { page: 'vehicle', id: parts[1] }
  if (parts[0] === 'line' && parts[1]) return { page: 'line', id: parts[1] }
  if (parts[0] === 'station' && parts[1]) return { page: 'station', id: parts[1] }
  if (parts[0] === 'lines' && parts.length === 1) return { page: 'lines' }
  if (parts[0] === 'about' && parts.length === 1) return { page: 'about' }
  return { page: 'notfound' }
}

export const href = {
  home: () => '#/',
  line: (id: string) => `#/line/${encodeURIComponent(id)}`,
  station: (id: string) => `#/station/${encodeURIComponent(id)}`,
  lines: () => '#/lines',
  search: (q = '') => (q ? `#/search?q=${encodeURIComponent(q)}` : '#/search'),
  prefs: () => '#/prefs',
  pref: (name: string) => `#/pref/${encodeURIComponent(name)}`,
  rankings: () => '#/rankings',
  company: (name: string) => `#/company/${encodeURIComponent(name)}`,
  vehicles: () => '#/vehicles',
  favorites: () => '#/favorites',
  route: (from = '', to = '') => {
    const q = new URLSearchParams()
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    const qs = q.toString()
    return qs ? `#/route?${qs}` : '#/route'
  },
  vehicle: (id: string) => `#/vehicle/${encodeURIComponent(id)}`,
  about: () => '#/about',
  play: () => '#/play',
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  const current = useRef(route)
  useEffect(() => {
    const onChange = () => {
      const next = parseRoute(window.location.hash)
      // 検索語の入力中（同じ検索ページ内）はスクロール位置を保つ
      if (!(current.current.page === 'search' && next.page === 'search')) window.scrollTo(0, 0)
      current.current = next
      setRoute(next)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
