/** 駅と駅を結ぶ経路（時刻なし）。routes.json の「線路でとなり合う駅」と駅間距離から探す */

/** 路線ID → [駅ID, 駅ID, 駅間距離km] */
export type RouteEdges = Record<string, [string, string, number][]>

export interface Leg {
  line: string
  /** 乗る駅から降りる駅までの駅（両端を含む） */
  stations: string[]
  km: number
}

export interface Journey {
  legs: Leg[]
  km: number
  transfers: number
}

type Arc = { to: string; line: string; km: number }

export interface RouteGraph {
  arcs: Map<string, Arc[]>
}

export function buildGraph(edges: RouteEdges): RouteGraph {
  const arcs = new Map<string, Arc[]>()
  const add = (from: string, arc: Arc) => {
    if (!arcs.has(from)) arcs.set(from, [])
    arcs.get(from)!.push(arc)
  }
  for (const [line, es] of Object.entries(edges)) {
    for (const [a, b, km] of es) {
      add(a, { to: b, line, km })
      add(b, { to: a, line, km })
    }
  }
  return { arcs }
}

/** 二分ヒープ（コストの小さい順） */
class Heap<T> {
  private items: { cost: number; value: T }[] = []
  get size() {
    return this.items.length
  }
  push(cost: number, value: T) {
    const a = this.items
    a.push({ cost, value })
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1
      if (a[p].cost <= a[i].cost) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): { cost: number; value: T } {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      for (let i = 0; ; ) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].cost < a[m].cost) m = l
        if (r < a.length && a[r].cost < a[m].cost) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

/**
 * 乗換1回を transferKm km の遠回りと同じとみなして、コスト（距離＋乗換の重み）が最小の経路を探す。
 * 状態は「駅と、いま乗っている路線」。乗る路線を変えると乗換1回。
 */
export function findJourney(graph: RouteGraph, from: string, to: string, transferKm: number): Journey | null {
  if (from === to) return null
  const key = (s: State) => `${s.station}|${s.line}`
  const best = new Map<string, number>()
  // 1つ前の状態（出発駅から最初に乗った区間は state が null）と、その区間の距離
  const prev = new Map<string, { state: State | null; km: number }>()
  const heap = new Heap<{ state: State; km: number; transfers: number }>()
  for (const arc of graph.arcs.get(from) ?? []) {
    const state = { station: arc.to, line: arc.line }
    const k = key(state)
    if (arc.km < (best.get(k) ?? Infinity)) {
      best.set(k, arc.km)
      prev.set(k, { state: null, km: arc.km })
      heap.push(arc.km, { state, km: arc.km, transfers: 0 })
    }
  }
  while (heap.size) {
    const { cost, value } = heap.pop()
    const { state, km, transfers } = value
    if (cost > (best.get(key(state)) ?? Infinity)) continue
    if (state.station === to) return trace(from, state, (s) => prev.get(key(s))!, km, transfers)
    for (const arc of graph.arcs.get(state.station) ?? []) {
      const change = arc.line !== state.line
      const next = { station: arc.to, line: arc.line }
      const c = cost + arc.km + (change ? transferKm : 0)
      const k = key(next)
      if (c < (best.get(k) ?? Infinity)) {
        best.set(k, c)
        prev.set(k, { state, km: arc.km })
        heap.push(c, { state: next, km: km + arc.km, transfers: transfers + (change ? 1 : 0) })
      }
    }
  }
  return null
}

type State = { station: string; line: string }

function trace(
  from: string,
  last: State,
  prevOf: (s: State) => { state: State | null; km: number },
  km: number,
  transfers: number,
): Journey {
  // 到着から逆にたどって（駅, 乗っていた路線, 直前の駅からの距離）の列にする
  const steps: (State & { km: number })[] = []
  for (let cur: State | null = last; cur; ) {
    const p = prevOf(cur)
    steps.push({ ...cur, km: p.km })
    cur = p.state
  }
  steps.reverse()
  const legs: Leg[] = []
  let at = from
  for (const st of steps) {
    const leg = legs[legs.length - 1]
    if (leg && leg.line === st.line) {
      leg.stations.push(st.station)
      leg.km += st.km
    } else {
      legs.push({ line: st.line, stations: [at, st.station], km: st.km })
    }
    at = st.station
  }
  for (const leg of legs) leg.km = Math.round(leg.km * 10) / 10
  return { legs, km: Math.round(km * 10) / 10, transfers }
}

/**
 * 候補を2〜3本出す。乗換をとても重く見た経路（乗換最少）から、軽く見た経路（距離重視）まで探し、
 * 同じ路線の乗り継ぎになったものはまとめて、乗換の少ない順・距離の短い順に並べる。
 */
export function findJourneys(graph: RouteGraph, from: string, to: string): Journey[] {
  const out: Journey[] = []
  for (const transferKm of [1000, 30, 8, 2]) {
    const j = findJourney(graph, from, to, transferKm)
    if (!j) continue
    const sig = j.legs.map((l) => l.line).join('>')
    if (out.some((o) => o.legs.map((l) => l.line).join('>') === sig)) continue
    // 乗換が増えるのに距離があまり縮まない候補は出さない（乗換1回増えるごとに5%以上短いこと）
    if (out.some((o) => o.transfers <= j.transfers && j.km > o.km * (1 - 0.05 * (j.transfers - o.transfers)))) continue
    out.push(j)
  }
  return out.sort((a, b) => a.transfers - b.transfers || a.km - b.km).slice(0, 3)
}
