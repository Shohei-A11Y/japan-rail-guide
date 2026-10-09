import type { RailData } from './data'
import type { Line, Station } from './types'

/** 値が取れるものだけを値の順に並べ、上位 n 件を返す */
export function rank<T>(items: Iterable<T>, value: (x: T) => number | null | undefined, n: number, order: 'desc' | 'asc' = 'desc'): T[] {
  return [...items]
    .map((x) => ({ x, v: value(x) }))
    .filter((e): e is { x: T; v: number } => e.v != null && Number.isFinite(e.v))
    .sort((a, b) => (order === 'desc' ? b.v - a.v : a.v - b.v))
    .slice(0, n)
    .map((e) => e.x)
}

/** "1872-10-14" / "1872-10" / "1872" を並べ替え用の数値にする（年月日の精度が違っても古い順に並ぶ） */
export function dateKey(date: string | undefined): number | null {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(date ?? '')
  if (!m) return null
  return Number(m[1]) * 10000 + Number(m[2] ?? 0) * 100 + Number(m[3] ?? 0)
}

export function formatDate(date: string | undefined): string {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(date ?? '')
  if (!m) return ''
  return `${m[1]}年` + (m[2] ? `${Number(m[2])}月` : '') + (m[3] ? `${Number(m[3])}日` : '')
}

export interface CompanyStats {
  name: string
  lines: number
  stations: number
  lengthKm: number
}

/** 事業者ごとの路線数・駅数・延長。通称区間（ミニ新幹線など）は二重に数えないよう除く */
export function companyStats(data: RailData): CompanyStats[] {
  const m = new Map<string, { lines: Line[]; stations: Set<string> }>()
  for (const l of data.lines.values()) {
    if (l.via) continue
    if (!m.has(l.company)) m.set(l.company, { lines: [], stations: new Set() })
    const c = m.get(l.company)!
    c.lines.push(l)
    for (const s of l.stations) c.stations.add(s)
  }
  return [...m].map(([name, c]) => ({
    name,
    lines: c.lines.length,
    stations: c.stations.size,
    lengthKm: Math.round(c.lines.reduce((sum, l) => sum + l.lengthKm, 0) * 10) / 10,
  }))
}

/** 駅名の文字数（サロゲートペアも1文字として数える） */
export const nameLength = (s: Station) => [...s.name].length

/** 同じ名前の駅（別の都道府県にもあるもの）を、駅の数の多い順に */
export function sameNameStations(stations: Iterable<Station>, n: number): { name: string; stations: Station[] }[] {
  const byName = new Map<string, Station[]>()
  for (const s of stations) {
    if (!byName.has(s.name)) byName.set(s.name, [])
    byName.get(s.name)!.push(s)
  }
  return [...byName]
    .filter(([, ss]) => new Set(ss.map((s) => s.pref)).size > 1)
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b, 'ja'))
    .slice(0, n)
    .map(([name, ss]) => ({ name, stations: ss.sort((a, b) => b.lat - a.lat) }))
}
