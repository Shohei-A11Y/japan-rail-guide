import { useEffect, useState } from 'react'

// GitHub Pages（静的ホスト）でも共有URLが使えるよう、ハッシュでルーティングする
export type Route =
  | { page: 'home' }
  | { page: 'line'; id: string }
  | { page: 'station'; id: string }
  | { page: 'lines' }
  | { page: 'about' }
  | { page: 'notfound' }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length === 0) return { page: 'home' }
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
  about: () => '#/about',
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
