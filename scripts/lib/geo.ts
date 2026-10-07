export type Coord = [number, number] // [lon, lat]

const R = 6371.0088 // 地球の平均半径 (km)

export function haversineKm(a: Coord, b: Coord): number {
  const toRad = Math.PI / 180
  const dLat = (b[1] - a[1]) * toRad
  const dLon = (b[0] - a[0]) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function lengthKm(coords: Coord[]): number {
  let sum = 0
  for (let i = 1; i < coords.length; i++) sum += haversineKm(coords[i - 1], coords[i])
  return sum
}

export function centroid(coords: Coord[]): Coord {
  let x = 0
  let y = 0
  for (const c of coords) {
    x += c[0]
    y += c[1]
  }
  return [x / coords.length, y / coords.length]
}

/** 平面近似での点と線分の距離（二乗）と、線分上の位置（0〜1） */
function segmentProjection(p: Coord, a: Coord, b: Coord): { t: number; d2: number } {
  // 経度方向を緯度に応じて縮める（局所的な等距離近似）
  const k = Math.cos((p[1] * Math.PI) / 180)
  const ax = a[0] * k
  const bx = b[0] * k
  const px = p[0] * k
  const dx = bx - ax
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (p[1] - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const qx = ax + t * dx - px
  const qy = a[1] + t * dy - p[1]
  return { t, d2: qx * qx + qy * qy }
}

/** 点を折れ線に投影し、始点からの距離(km)と折れ線までの距離(km)を返す */
export function projectOnPolyline(p: Coord, line: Coord[]): { along: number; offset: number } {
  let best = { along: 0, d2: Infinity }
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    const segLen = haversineKm(line[i - 1], line[i])
    const { t, d2 } = segmentProjection(p, line[i - 1], line[i])
    if (d2 < best.d2) best = { along: acc + t * segLen, d2 }
    acc += segLen
  }
  if (line.length === 1) best = { along: 0, d2: 0 }
  // 度→km の近似換算（1度 ≒ 111.2km）
  return { along: best.along, offset: line.length === 1 ? haversineKm(p, line[0]) : Math.sqrt(best.d2) * 111.195 }
}

/** Douglas-Peucker 法による折れ線の簡略化。tolerance は度単位 */
export function simplify(coords: Coord[], tolerance: number): Coord[] {
  if (coords.length <= 2) return coords.slice()
  const keep = new Uint8Array(coords.length)
  keep[0] = 1
  keep[coords.length - 1] = 1
  const tol2 = tolerance * tolerance
  const stack: [number, number][] = [[0, coords.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxD2 = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const { d2 } = segmentProjection(coords[i], coords[first], coords[last])
      if (d2 > maxD2) {
        maxD2 = d2
        index = i
      }
    }
    if (index !== -1 && maxD2 > tol2) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return coords.filter((_, i) => keep[i])
}

export function roundCoord(c: Coord, digits = 5): Coord {
  const f = 10 ** digits
  return [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f]
}

export type BBox = [number, number, number, number] // [west, south, east, north]

export function bboxOf(coords: Iterable<Coord>): BBox {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [x, y] of coords) {
    if (x < w) w = x
    if (y < s) s = y
    if (x > e) e = x
    if (y > n) n = y
  }
  return [w, s, e, n]
}

/** 折れ線のうち、始点からの距離 from〜to (km) の部分を切り出す */
export function slicePolyline(line: Coord[], from: number, to: number): Coord[] {
  const out: Coord[] = []
  const lerp = (a: Coord, b: Coord, t: number): Coord => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const len = haversineKm(a, b)
    const start = acc
    const end = acc + len
    acc = end
    if (end < from || start > to || len === 0) continue
    if (out.length === 0) out.push(start >= from ? a : lerp(a, b, (from - start) / len))
    out.push(end <= to ? b : lerp(a, b, (to - start) / len))
    if (end >= to) break
  }
  return out
}

/** 点が多角形（外周＋穴）の内側にあるか（レイキャスティング法） */
export function pointInPolygon(p: Coord, rings: Coord[][]): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}
