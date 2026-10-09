import maplibregl, { type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BASE_SOURCE, JAPAN_BOUNDS, baseLayer, darkMode } from '../components/RailMap'
import { Header } from '../components/parts'
import { type RailData, useRouteEdges } from '../data'
import { formatNumber } from '../format'
import { href } from '../router'
import { stationYears, timelineEdges } from '../timeline'

const FIRST_YEAR = 1872
const LAST_YEAR = new Date().getFullYear()
/** 再生のときの1年あたりのミリ秒 */
const SPEEDS = [
  { label: 'ゆっくり', ms: 500 },
  { label: 'ふつう', ms: 220 },
  { label: 'はやい', ms: 90 },
]
/** この年数以内に開業した区間・駅を目立たせる */
const RECENT = 3

export function TimelinePage({ data }: { data: RailData }) {
  const edges = useRouteEdges()
  const [year, setYear] = useState(FIRST_YEAR)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const prepared = useMemo(() => {
    if (edges.status !== 'ready') return null
    const years = stationYears(data.stations.values(), edges.data)
    const segs = timelineEdges(edges.data, years)
    const coord = (id: string) => {
      const s = data.stations.get(id)!
      return [s.lon, s.lat]
    }
    const lineGeo = {
      type: 'FeatureCollection' as const,
      features: segs.map((e) => ({
        type: 'Feature' as const,
        properties: {
          y: e.year,
          c: data.lines.get(e.line)?.color ?? '#888888',
          s: data.lines.get(e.line)?.shinkansen ? 1 : 0,
        },
        geometry: { type: 'LineString' as const, coordinates: [coord(e.a), coord(e.b)] },
      })),
    }
    const stationGeo = {
      type: 'FeatureCollection' as const,
      features: [...years].map(([id, y]) => ({
        type: 'Feature' as const,
        properties: { y: y.year, id },
        geometry: { type: 'Point' as const, coordinates: coord(id) },
      })),
    }
    // 年ごとの駅数（累計）と、その年に開業した駅（Wikidataの開業日がある駅だけ）
    const opened = new Map<number, string[]>()
    for (const [id, y] of years) {
      if (y.estimated) continue
      if (!opened.has(y.year)) opened.set(y.year, [])
      opened.get(y.year)!.push(id)
    }
    const sortedYears = [...years.values()].map((y) => y.year).sort((a, b) => a - b)
    const estimated = [...years.values()].filter((y) => y.estimated).length
    return { lineGeo, stationGeo, opened, sortedYears, estimated, missing: data.stations.size - years.size }
  }, [data, edges])

  // 地図の作成
  useEffect(() => {
    if (!container.current) return
    const dark = darkMode()
    const map = new maplibregl.Map({
      container: container.current,
      bounds: JAPAN_BOUNDS,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      style: {
        version: 8,
        sources: {
          base: BASE_SOURCE,
          lines: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            attribution: '「国土数値情報（鉄道）」（国土交通省）を加工して作成・開業日: Wikidata',
          },
          stations: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          baseLayer(dark),
          {
            id: 'lines',
            type: 'line',
            source: 'lines',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'c'], 'line-width': 1.5 },
          },
          {
            id: 'stations',
            type: 'circle',
            source: 'stations',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 3],
              'circle-color': dark ? '#e8ecf0' : '#1a1d21',
              'circle-opacity': 0.6,
            },
          },
        ],
      },
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.touchZoomRotate.disableRotation()
    map.once('load', () => setMapReady(true))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // データの流し込み
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !prepared) return
    ;(map.getSource('lines') as GeoJSONSource).setData(prepared.lineGeo)
    ;(map.getSource('stations') as GeoJSONSource).setData(prepared.stationGeo)
  }, [mapReady, prepared])

  // 年に合わせて表示を絞り、開業して間もない区間・駅を目立たせる
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const shown: ExpressionSpecification = ['<=', ['get', 'y'], year]
    const recent: ExpressionSpecification = ['>', ['get', 'y'], year - RECENT]
    map.setFilter('lines', shown)
    map.setFilter('stations', shown)
    map.setPaintProperty('lines', 'line-width', [
      'interpolate',
      ['linear'],
      ['zoom'],
      4,
      ['case', recent, 3, ['==', ['get', 's'], 1], 2, 1.2],
      10,
      ['case', recent, 6, ['==', ['get', 's'], 1], 4, 2.5],
    ])
    map.setPaintProperty('stations', 'circle-color', ['case', recent, '#e5002d', darkMode() ? '#e8ecf0' : '#1a1d21'])
  }, [year, mapReady])

  // 再生
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setYear((y) => {
        if (y >= LAST_YEAR) {
          setPlaying(false)
          return y
        }
        return y + 1
      })
    }, SPEEDS[speed].ms)
    return () => clearInterval(t)
  }, [playing, speed])

  const count = prepared ? upperBound(prepared.sortedYears, year) : 0
  const newcomers = (prepared?.opened.get(year) ?? [])
    .map((id) => data.stations.get(id)!)
    .sort((a, b) => (b.passengers ?? -1) - (a.passengers ?? -1))

  return (
    <div className="timeline">
      <Header />
      <div ref={container} className="timeline-map" />
      <section className="timeline-panel" aria-label="年表の操作">
        <div className="timeline-head">
          <span className="timeline-year">{year}年</span>
          <span className="muted small">{prepared ? `${formatNumber(count)}駅` : '読み込み中…'}</span>
        </div>
        <p className="timeline-news">
          {newcomers.length > 0 ? (
            <>
              この年に開業:{' '}
              {newcomers.slice(0, 4).map((s, i) => (
                <span key={s.id}>
                  {i > 0 && '・'}
                  <a href={href.station(s.id)}>{s.name}</a>
                </span>
              ))}
              {newcomers.length > 4 && ` ほか${newcomers.length - 4}駅`}
            </>
          ) : (
            <span className="muted">この年に開業した駅はありません</span>
          )}
        </p>
        <div className="timeline-controls">
          <button
            className="timeline-play"
            onClick={() => {
              if (!playing && year >= LAST_YEAR) setYear(FIRST_YEAR)
              setPlaying(!playing)
            }}
            aria-label={playing ? '一時停止' : '再生'}
            disabled={!prepared}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            type="range"
            min={FIRST_YEAR}
            max={LAST_YEAR}
            value={year}
            onChange={(e) => {
              setPlaying(false)
              setYear(Number(e.target.value))
            }}
            aria-label="年"
          />
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="再生の速さ">
            {SPEEDS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {prepared && (
          <details className="muted small timeline-note">
            <summary>この図について</summary>
            今ある駅を Wikidata
            の開業年で並べた図で、廃止された路線・駅は出ません。駅の位置や所属路線は現在のもので、線は駅どうしを直線で結んでいます。開業日が無い
            {formatNumber(prepared.estimated)}駅はとなりの駅の年で補い、それでも分からない
            {formatNumber(prepared.missing)}
            駅は出していません。赤い点と太い線は{RECENT}年以内に開業した駅と区間。
          </details>
        )}
      </section>
    </div>
  )
}

/** 昇順の配列で value 以下の要素の数 */
function upperBound(sorted: number[], value: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}
