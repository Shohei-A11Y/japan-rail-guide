import { type Coord, haversineKm, lengthKm } from './geo'

/**
 * 路線を構成する区間（LineString）の集まりから、駅の並び順を決めるための
 * 「主経路」を連結成分ごとに求める。
 * 端点を共有する区間をつないだグラフで、各成分のいちばん長い経路（近似）を返す。
 * 支線は主経路に乗らないが、駅は最寄りの位置に投影されるので並び順はおおむね保たれる。
 */
export function mainPaths(segments: Coord[][]): Coord[][] {
  const key = (c: Coord) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`
  type Edge = { to: string; coords: Coord[]; len: number }
  const adj = new Map<string, Edge[]>()
  const addEdge = (from: string, edge: Edge) => {
    if (!adj.has(from)) adj.set(from, [])
    adj.get(from)!.push(edge)
  }
  for (const seg of segments) {
    if (seg.length < 2) continue
    const a = key(seg[0])
    const b = key(seg[seg.length - 1])
    const len = lengthKm(seg)
    addEdge(a, { to: b, coords: seg, len })
    addEdge(b, { to: a, coords: seg.slice().reverse(), len })
  }

  // 最短距離木を作り、いちばん遠いノードとそこまでの経路を返す
  const farthest = (start: string) => {
    const dist = new Map<string, number>([[start, 0]])
    const prev = new Map<string, { from: string; edge: Edge }>()
    const queue: string[] = [start]
    // 区間数は路線あたり数百程度なので、単純な緩和の繰り返しで十分
    while (queue.length) {
      const node = queue.shift()!
      for (const edge of adj.get(node) ?? []) {
        const d = dist.get(node)! + edge.len
        if (d < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, d)
          prev.set(edge.to, { from: node, edge })
          queue.push(edge.to)
        }
      }
    }
    let far = start
    for (const [node, d] of dist) if (d > dist.get(far)!) far = node
    return { far, dist, prev }
  }

  const visited = new Set<string>()
  const paths: { coords: Coord[]; len: number }[] = []
  for (const start of adj.keys()) {
    if (visited.has(start)) continue
    const first = farthest(start)
    for (const node of first.dist.keys()) visited.add(node)
    const second = farthest(first.far)
    // second.far から first.far へ戻りながら座標をつなぐ
    const edges: Edge[] = []
    for (let node = second.far; node !== first.far; ) {
      const p = second.prev.get(node)
      if (!p) break
      edges.push(p.edge)
      node = p.from
    }
    edges.reverse()
    const coords: Coord[] = []
    for (const e of edges) coords.push(...(coords.length ? e.coords.slice(1) : e.coords))
    if (coords.length === 0) coords.push(...(adj.get(start)?.[0]?.coords ?? []))
    paths.push({ coords, len: lengthKm(coords) })
  }

  paths.sort((a, b) => b.len - a.len)
  // 西→東 / 北→南 の向きをそろえ、ページ表示の向きが更新ごとに変わらないようにする
  return paths.map(({ coords }) => orient(coords))
}

function orient(coords: Coord[]): Coord[] {
  if (coords.length < 2) return coords
  const a = coords[0]
  const b = coords[coords.length - 1]
  const dx = Math.abs(b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180)
  const dy = Math.abs(b[1] - a[1])
  // 主に東西方向の路線は西を始点、南北方向の路線は北を始点にする
  const flip = dx >= dy ? a[0] > b[0] : a[1] < b[1]
  return flip ? coords.slice().reverse() : coords
}

/**
 * 区間の集まりの上で、2地点に最も近い区間の端点どうしを結ぶ最短経路（座標列）を返す。
 * 元データの区間の端点がわずかにずれてつながっていない箇所は、gapKm 以内なら同じ点とみなす。
 * つながっていなければ null。
 */
export function shortestPath(segments: Coord[][], from: Coord, to: Coord, gapKm = 0.05): Coord[] | null {
  const nodes: Coord[] = []
  const nodeIndex = new Map<string, number>()
  const nodeOf = (c: Coord) => {
    const k = `${c[0].toFixed(6)},${c[1].toFixed(6)}`
    if (!nodeIndex.has(k)) {
      nodeIndex.set(k, nodes.length)
      nodes.push(c)
    }
    return nodeIndex.get(k)!
  }
  type Edge = { to: number; coords: Coord[]; len: number }
  const adj: Edge[][] = []
  const addEdge = (a: number, b: number, coords: Coord[], len: number) => {
    ;(adj[a] ??= []).push({ to: b, coords, len })
    ;(adj[b] ??= []).push({ to: a, coords: coords.slice().reverse(), len })
  }
  for (const seg of segments) {
    if (seg.length < 2) continue
    addEdge(nodeOf(seg[0]), nodeOf(seg[seg.length - 1]), seg, lengthKm(seg))
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = haversineKm(nodes[i], nodes[j])
      if (d > 0 && d <= gapKm) addEdge(i, j, [nodes[i], nodes[j]], d)
    }
  }
  const nearest = (p: Coord) => {
    let best = 0
    for (let i = 1; i < nodes.length; i++) if (haversineKm(p, nodes[i]) < haversineKm(p, nodes[best])) best = i
    return best
  }
  if (nodes.length === 0) return null
  const start = nearest(from)
  const goal = nearest(to)
  // 単純なダイクストラ法（1路線の端点は多くて数千）
  const dist = new Array<number>(nodes.length).fill(Infinity)
  const prev = new Array<{ from: number; edge: Edge } | undefined>(nodes.length)
  const done = new Uint8Array(nodes.length)
  dist[start] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || u === goal) break
    done[u] = 1
    for (const e of adj[u] ?? []) {
      if (dist[u] + e.len < dist[e.to]) {
        dist[e.to] = dist[u] + e.len
        prev[e.to] = { from: u, edge: e }
      }
    }
  }
  if (dist[goal] === Infinity) return null
  const edges: Edge[] = []
  for (let n = goal; n !== start; n = prev[n]!.from) edges.push(prev[n]!.edge)
  edges.reverse()
  const coords: Coord[] = [nodes[start]]
  for (const e of edges) coords.push(...e.coords.slice(1))
  return coords
}

/**
 * 1路線の区間の集まりから、線路でとなり合う駅の組と駅間距離（km）を求める。
 * 駅は両端の座標（元データでは駅の線形の両端が区間の端点と一致する）で与える。
 * 各駅から線路をたどり、ほかの駅に着いたらそこで止める。距離は駅の中心どうし（ホームの長さの半分ずつを足す）。
 */
export function stationAdjacency(
  segments: Coord[][],
  stops: { id: string; ends: Coord[]; lengthKm: number }[],
): [string, string, number][] {
  const key = (c: Coord) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`
  const adj = new Map<string, { to: string; len: number }[]>()
  const add = (a: string, b: string, len: number) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push({ to: b, len })
  }
  for (const seg of segments) {
    if (seg.length < 2) continue
    const a = key(seg[0])
    const b = key(seg[seg.length - 1])
    const len = lengthKm(seg)
    add(a, b, len)
    add(b, a, len)
  }
  const stationAt = new Map<string, { id: string; half: number }>()
  for (const s of stops) for (const c of s.ends) stationAt.set(key(c), { id: s.id, half: s.lengthKm / 2 })
  const pairs = new Map<string, [string, string, number]>()
  for (const s of stops) {
    const dist = new Map<string, number>()
    const queue: string[] = []
    for (const c of s.ends) {
      dist.set(key(c), s.lengthKm / 2)
      queue.push(key(c))
    }
    while (queue.length) {
      // 未確定の中で最も近い点（1駅から次の駅までの点は少ないので線形探索で十分）
      let bi = 0
      for (let i = 1; i < queue.length; i++) if (dist.get(queue[i])! < dist.get(queue[bi])!) bi = i
      const node = queue.splice(bi, 1)[0]
      const d = dist.get(node)!
      const other = stationAt.get(node)
      if (other && other.id !== s.id) {
        const [a, b] = s.id < other.id ? [s.id, other.id] : [other.id, s.id]
        const k = `${a}|${b}`
        const total = d + other.half
        if (!pairs.has(k) || pairs.get(k)![2] > total) pairs.set(k, [a, b, total])
        continue
      }
      for (const e of adj.get(node) ?? []) {
        const nd = d + e.len
        if (nd < (dist.get(e.to) ?? Infinity)) {
          if (!dist.has(e.to)) queue.push(e.to)
          dist.set(e.to, nd)
        }
      }
    }
  }
  return [...pairs.values()].sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]))
}
