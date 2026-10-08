import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { RailData } from '../data'
import { formatNumber } from '../format'
import { href } from '../router'
import type { Line, Station } from '../types'

const H = 200
const PAD = { top: 24, right: 12, bottom: 24, left: 44 }

/** 2点間の大円距離（km） */
function distanceKm(a: Station, b: Station): number {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** 目盛りの間隔を 1・2・5 × 10^n から選ぶ */
function niceStep(range: number, count: number): number {
  const raw = range / count
  const p = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw
}

interface Point {
  st: Station
  km: number
  elevation: number
}

/** 路線の駅の並びに沿った標高の変化。横軸は駅間の直線距離を積み上げた距離 */
export function ElevationProfile({ data, line }: { data: RailData; line: Line }) {
  const [active, setActive] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // 文字の大きさを保つため、viewBox を拡大縮小せず実際の幅で描く
  const plotRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)

  const chart = useMemo(() => {
    const points: Point[] = []
    let km = 0
    let prev: Station | null = null
    for (const sid of line.stations) {
      const st = data.stations.get(sid)
      if (!st) continue
      if (prev) km += distanceKm(prev, st)
      prev = st
      if (st.elevation != null) points.push({ st, km, elevation: st.elevation })
    }
    // 環状運転は起点に戻るところまで描く
    const first = data.stations.get(line.stations[0])
    if (line.loop && first && prev && first.elevation != null) {
      km += distanceKm(prev, first)
      points.push({ st: first, km, elevation: first.elevation })
    }
    if (points.length < 3) return null
    const values = points.map((p) => p.elevation)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const step = niceStep(Math.max(max - min, 20), 3)
    const lo = Math.floor(min / step) * step
    const hi = Math.max(Math.ceil(max / step) * step, lo + step)
    const total = Math.max(km, 0.001)
    const x = (v: number) => PAD.left + (v / total) * (W - PAD.left - PAD.right)
    const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom)
    const ticks: number[] = []
    for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t)
    const highest = points.reduce((a, b) => (b.elevation > a.elevation ? b : a))
    const lowest = points.reduce((a, b) => (b.elevation < a.elevation ? b : a))
    return { points, total, x, y, ticks, lo, highest, lowest }
  }, [data, line, W])

  const hasChart = chart != null
  useEffect(() => {
    const el = plotRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasChart])
  if (!chart) return null
  const { points, total, x, y, ticks, lo, highest, lowest } = chart
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)},${y(p.elevation).toFixed(1)}`).join('')
  const area = `${path}L${x(points[points.length - 1].km).toFixed(1)},${y(lo)}L${x(0).toFixed(1)},${y(lo)}Z`
  const cur = active != null ? points[active] : null

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i].km) - vx) < Math.abs(x(points[best].km) - vx)) best = i
    }
    setActive(best)
  }

  return (
    <>
      <h2>標高の変化</h2>
      <figure className="profile">
        <p className="profile-summary">
          最高 <a href={href.station(highest.st.id)}>{highest.st.name}</a> {formatNumber(highest.elevation)}m・最低{' '}
          <a href={href.station(lowest.st.id)}>{lowest.st.name}</a> {formatNumber(lowest.elevation)}m（高低差{' '}
          {formatNumber(highest.elevation - lowest.elevation)}m）
        </p>
        <div className="profile-plot" ref={plotRef}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${line.displayName}の駅の標高の変化`}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="profile-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
                <text className="profile-axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
                  {formatNumber(t)}
                </text>
              </g>
            ))}
            <text className="profile-axis" x={PAD.left} y={H - 6}>
              0km
            </text>
            <text className="profile-axis" x={W - PAD.right} y={H - 6} textAnchor="end">
              約{formatNumber(Math.round(total))}km
            </text>
            <path d={area} fill={line.color} opacity={0.15} />
            <path d={path} fill="none" stroke={line.color} strokeWidth={2} strokeLinejoin="round" />
            {points.map((p, i) => (
              <circle
                key={i}
                className="profile-dot"
                cx={x(p.km)}
                cy={y(p.elevation)}
                r={i === active ? 5 : 3}
                fill={line.color}
              />
            ))}
            {!cur && (
              <text className="profile-label" x={x(highest.km)} y={y(highest.elevation) - 9} textAnchor="middle">
                {highest.st.name}
              </text>
            )}
            {cur && <line className="profile-cross" x1={x(cur.km)} x2={x(cur.km)} y1={PAD.top} y2={H - PAD.bottom} />}
          </svg>
          {cur && (
            <div
              className="profile-tip"
              style={{
                left: `${(x(cur.km) / W) * 100}%`,
                transform: `translateX(${x(cur.km) > W / 2 ? '-100%' : '0'})`,
              }}
            >
              <a href={href.station(cur.st.id)}>{cur.st.name}</a>
              <span>
                {formatNumber(cur.elevation)}m・起点から約{cur.km.toFixed(1)}km
              </span>
            </div>
          )}
        </div>
        <figcaption className="muted small">
          駅の代表点の地表の標高（国土地理院の標高タイル）。高架・地下のホームの高さではありません。横軸は駅間の直線距離を積み上げた距離です。
        </figcaption>
      </figure>
    </>
  )
}
