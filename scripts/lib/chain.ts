import { type Coord, lengthKm } from './geo'

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
