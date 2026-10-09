import type { RouteEdges } from './route'
import type { Station } from './types'

/** "1872-10-14" / "1872-10" / "1872" → 1872 */
export const yearOf = (date: string | undefined): number | null => {
  const m = /^(\d{4})/.exec(date ?? '')
  return m ? Number(m[1]) : null
}

/**
 * 駅ごとの「地図に現れる年」。Wikidata の開業日がある駅はその年。
 * 無い駅（約7%）は、線路でとなり合う駅のうち開業年が分かっている駅の最も遅い年で補う（estimated）。
 * となりも分からなければ、分かるまで繰り返し広げる。
 */
export function stationYears(
  stations: Iterable<Station>,
  edges: RouteEdges,
): Map<string, { year: number; estimated: boolean }> {
  const years = new Map<string, { year: number; estimated: boolean }>()
  const unknown = new Set<string>()
  for (const s of stations) {
    const y = yearOf(s.opened)
    if (y != null) years.set(s.id, { year: y, estimated: false })
    else unknown.add(s.id)
  }
  const neighbors = new Map<string, string[]>()
  for (const es of Object.values(edges)) {
    for (const [a, b] of es) {
      if (!neighbors.has(a)) neighbors.set(a, [])
      if (!neighbors.has(b)) neighbors.set(b, [])
      neighbors.get(a)!.push(b)
      neighbors.get(b)!.push(a)
    }
  }
  for (let changed = true; changed && unknown.size; ) {
    changed = false
    const found: [string, number][] = []
    for (const id of unknown) {
      const ys = (neighbors.get(id) ?? []).map((n) => years.get(n)?.year).filter((y): y is number => y != null)
      if (ys.length) found.push([id, Math.max(...ys)])
    }
    // 1周ごとにまとめて反映する（同じ周で補った値を、別の駅の推定に使わない）
    for (const [id, year] of found) {
      years.set(id, { year, estimated: true })
      unknown.delete(id)
      changed = true
    }
  }
  return years
}

/** 駅の間の線（両端の駅がそろった年に現れる） */
export interface TimelineEdge {
  line: string
  a: string
  b: string
  year: number
}

export function timelineEdges(edges: RouteEdges, years: Map<string, { year: number }>): TimelineEdge[] {
  const out: TimelineEdge[] = []
  for (const [line, es] of Object.entries(edges)) {
    for (const [a, b] of es) {
      const ya = years.get(a)?.year
      const yb = years.get(b)?.year
      if (ya == null || yb == null) continue
      out.push({ line, a, b, year: Math.max(ya, yb) })
    }
  }
  return out
}
