import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef } from 'react'
import { type RailData, networkUrl } from '../data'
import type { BBox } from '../types'

export type MapSelection = { type: 'line'; id: string } | { type: 'station'; id: string }

/** 地図に重ねる経路（区間ごとの色と、駅を順に結んだ座標） */
export interface MapRoute {
  legs: { color: string; coords: [number, number][] }[]
  /** 経路上の駅（この駅だけを表示する） */
  stations: string[]
}

interface Props {
  data: RailData
  /** 強調して表示する路線・駅。指定すると、その範囲に地図を合わせる */
  focus?: MapSelection
  onSelect?: (selection: MapSelection | null) => void
  /** focus が無いときに地図を合わせる範囲 */
  bounds?: BBox
  /** 地図を動かし終えたときの表示範囲とズーム */
  onViewChange?: (bounds: BBox, zoom: number) => void
  /** 重ねて表示する経路。指定すると、その範囲に地図を合わせる */
  route?: MapRoute
  className?: string
}

export const JAPAN_BOUNDS: [number, number, number, number] = [128.5, 30.5, 146.0, 45.6]
// 乗降客数の多い駅ほど広域から表示する: [レイヤーID, 表示し始めるズーム, 条件]
const STATION_LAYERS: [string, number, ExpressionSpecification][] = [
  ['stations-major', 4, ['>=', ['get', 'p'], 300000]],
  ['stations-mid', 8, ['all', ['>=', ['get', 'p'], 20000], ['<', ['get', 'p'], 300000]]],
  ['stations-all', 10.5, ['<', ['get', 'p'], 20000]],
]

/** 背景の地図（地理院タイル・淡色地図） */
export const BASE_SOURCE: maplibregl.RasterSourceSpecification = {
  type: 'raster',
  tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
  tileSize: 256,
  minzoom: 2,
  maxzoom: 18,
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
}

export const baseLayer = (dark: boolean): maplibregl.LayerSpecification => ({
  id: 'base',
  type: 'raster',
  source: 'base',
  paint: dark
    ? { 'raster-brightness-max': 0.32, 'raster-saturation': -0.6, 'raster-contrast': 0.1 }
    : { 'raster-saturation': -0.3 },
})

export const darkMode = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false

// 線の太さ: ズームに応じて太くし、新幹線は一段太くする。extra は縁取り用の上乗せ分
const lineWidth = (extra = 0): ExpressionSpecification => {
  const w = (shinkansen: number, other: number): ExpressionSpecification => [
    'case',
    ['==', ['get', 's'], 1],
    shinkansen + extra,
    other + extra,
  ]
  return ['interpolate', ['linear'], ['zoom'], 4, w(2, 1), 10, w(4, 2.5), 15, w(8, 6)]
}

export function RailMap({ data, focus, onSelect, bounds, onViewChange, route, className }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange

  const stationGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: [...data.stations.values()].map((s) => ({
        type: 'Feature' as const,
        properties: { id: s.id, p: s.passengers ?? 0 },
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      })),
    }),
    [data],
  )

  // 地図の作成（1回だけ）
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
          network: {
            type: 'geojson',
            data: networkUrl,
            attribution: '「国土数値情報（鉄道・駅別乗降客数）」（国土交通省）を加工して作成',
          },
          stations: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          baseLayer(dark),
          {
            id: 'lines-casing',
            type: 'line',
            source: 'network',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': dark ? '#0d1117' : '#ffffff',
              'line-width': lineWidth(2),
              'line-opacity': 0.8,
            },
          },
          {
            id: 'lines',
            type: 'line',
            source: 'network',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'c'], 'line-width': lineWidth() },
          },
          {
            id: 'route-casing',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': dark ? '#0d1117' : '#ffffff', 'line-width': 9 },
          },
          {
            id: 'route',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'c'], 'line-width': 5 },
          },
          ...STATION_LAYERS.map(([id, minzoom, filter]) => stationLayer(id, minzoom, filter, dark)),
          {
            id: 'station-focus',
            type: 'circle',
            source: 'stations',
            filter: ['==', ['get', 'id'], ''],
            paint: {
              'circle-radius': 9,
              'circle-color': '#e5002d',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3,
            },
          },
        ],
      },
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.touchZoomRotate.disableRotation()

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'map-tip' })
    const pick = (point: maplibregl.Point): MapGeoJSONFeature | undefined => {
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [point.x - 8, point.y - 8],
        [point.x + 8, point.y + 8],
      ]
      const layers = [...STATION_LAYERS.map(([id]) => id), 'lines'].filter((id) => map.getLayer(id))
      const found = map.queryRenderedFeatures(box, { layers })
      return found.find((f) => f.layer.id !== 'lines') ?? found[0]
    }
    const label = (f: MapGeoJSONFeature) => {
      const id = String(f.properties.id)
      if (f.layer.id === 'lines') {
        const line = data.lines.get(id)
        return line ? `${line.displayName}（${line.company}）` : ''
      }
      const st = data.stations.get(id)
      return st ? `${st.name}駅` : ''
    }
    map.on('mousemove', (e) => {
      const f = pick(e.point)
      map.getCanvas().style.cursor = f ? 'pointer' : ''
      if (f && window.matchMedia('(hover: hover)').matches) {
        popup.setLngLat(e.lngLat).setText(label(f)).addTo(map)
      } else {
        popup.remove()
      }
    })
    map.on('mouseout', () => popup.remove())
    map.on('click', (e) => {
      const f = pick(e.point)
      if (!f) return onSelectRef.current?.(null)
      const id = String(f.properties.id)
      onSelectRef.current?.(f.layer.id === 'lines' ? { type: 'line', id } : { type: 'station', id })
    })

    map.on('moveend', () => {
      const b = map.getBounds()
      onViewChangeRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom())
    })

    mapRef.current = map
    return () => {
      popup.remove()
      map.remove()
      mapRef.current = null
    }
  }, [data])

  // 駅データの流し込み
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => (map.getSource('stations') as GeoJSONSource | undefined)?.setData(stationGeoJson)
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [stationGeoJson])

  // 強調表示と表示範囲
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const lineId = focus?.type === 'line' ? focus.id : ''
      const stationId = focus?.type === 'station' ? focus.id : ''
      const dim = lineId || route
      map.setPaintProperty('lines', 'line-opacity', dim ? ['case', ['==', ['get', 'id'], lineId], 1, 0.25] : 1)
      map.setFilter('station-focus', ['==', ['get', 'id'], stationId])
      ;(map.getSource('route') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: (route?.legs ?? []).map((leg) => ({
          type: 'Feature',
          properties: { c: leg.color },
          geometry: { type: 'LineString', coordinates: leg.coords },
        })),
      })
      // 路線・経路を強調するときは、その駅だけを表示して線が駅に埋もれないようにする
      const line = lineId ? data.lines.get(lineId) : undefined
      const shown = line?.stations ?? route?.stations
      for (const [id, , filter] of STATION_LAYERS) {
        map.setFilter(id, shown ? ['all', filter, ['in', ['get', 'id'], ['literal', shown]]] : filter)
      }
      const routeCoords = route?.legs.flatMap((l) => l.coords) ?? []
      if (line) {
        map.fitBounds(line.bbox, { padding: 40, duration: 0, maxZoom: 14 })
      } else if (routeCoords.length) {
        const lons = routeCoords.map((c) => c[0])
        const lats = routeCoords.map((c) => c[1])
        map.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], {
          // 下端は出典表示に隠れないよう広めに空ける
          padding: { top: 40, right: 40, bottom: 70, left: 40 },
          duration: 0,
          maxZoom: 14,
        })
      } else if (stationId) {
        const st = data.stations.get(stationId)
        if (st) map.jumpTo({ center: [st.lon, st.lat], zoom: 13 })
      } else if (bounds) {
        map.fitBounds(bounds, { padding: 30, duration: 0, maxZoom: 13 })
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    // bounds は配列なので、値で比較できるよう文字列にして依存に入れる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.type, focus?.id, data, bounds?.join(','), route])

  return <div ref={container} className={className ?? 'rail-map'} />
}

function stationLayer(
  id: string,
  minzoom: number,
  filter: ExpressionSpecification,
  dark: boolean,
): maplibregl.LayerSpecification {
  return {
    id,
    type: 'circle',
    source: 'stations',
    minzoom,
    filter,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 4, 15, 7],
      'circle-color': dark ? '#0d1117' : '#ffffff',
      'circle-stroke-color': dark ? '#e8ecf0' : '#1a1d21',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 2],
    },
  } as maplibregl.LayerSpecification
}
