import { useSyncExternalStore } from 'react'

// お気に入りは利用者の端末（localStorage）にだけ保存する。サーバーには送らない

export type FavoriteKind = 'station' | 'line' | 'vehicle' | 'company'
export type Favorites = Record<FavoriteKind, string[]>

const KEY = 'japan-rail-guide:favorites:v1'
const EMPTY: Favorites = { station: [], line: [], vehicle: [], company: [] }

/** 保存された値を読む。壊れた値や古い形式は空として扱う */
export function parseFavorites(raw: string | null): Favorites {
  if (!raw) return EMPTY
  try {
    const v = JSON.parse(raw) as Partial<Record<FavoriteKind, unknown>>
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : [])
    return { station: ids(v.station), line: ids(v.line), vehicle: ids(v.vehicle), company: ids(v.company) }
  } catch {
    return EMPTY
  }
}

/** お気に入りの追加・削除（新しく追加したものを先頭に） */
export function toggle(f: Favorites, kind: FavoriteKind, id: string): Favorites {
  const list = f[kind]
  return { ...f, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [id, ...list] }
}

let cached: { raw: string | null; value: Favorites } = { raw: null, value: EMPTY }
// 保存に失敗した後は、画面を閉じるまでメモリ上の値だけを使う
let memoryOnly = false
const listeners = new Set<() => void>()

function read(): Favorites {
  if (memoryOnly) return cached.value
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // ストレージが使えない環境（プライベートブラウズ等）では空のまま
  }
  if (raw !== cached.raw) cached = { raw, value: parseFavorites(raw) }
  return cached.value
}

function write(value: Favorites) {
  const raw = JSON.stringify(value)
  try {
    localStorage.setItem(KEY, raw)
  } catch {
    // 保存できなくても画面上は反映する
    memoryOnly = true
  }
  cached = { raw, value }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // 別のタブでの変更も反映する
  const onStorage = (e: StorageEvent) => e.key === KEY && listener()
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, read, () => EMPTY)
  return {
    favorites,
    has: (kind: FavoriteKind, id: string) => favorites[kind].includes(id),
    toggle: (kind: FavoriteKind, id: string) => write(toggle(read(), kind, id)),
    remove: (kind: FavoriteKind, ids: string[]) => write({ ...read(), [kind]: read()[kind].filter((x) => !ids.includes(x)) }),
  }
}
