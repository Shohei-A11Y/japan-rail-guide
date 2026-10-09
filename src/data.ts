import { useEffect, useState } from 'react'
import { type RouteEdges, type RouteGraph, buildGraph } from './route'
import type { Company, Line, Meta, Station, StationDetail, Vehicle } from './types'

export interface RailData {
  meta: Meta
  lines: Map<string, Line>
  stations: Map<string, Station>
  companies: Map<string, Company>
  vehicles: Map<string, Vehicle>
}

const base = import.meta.env.BASE_URL
export const networkUrl = `${base}data/network.geojson`

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

/** 失敗したら次の呼び出しで取り直せるようにしたうえで、1回だけ読み込む */
function once<T>(loader: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= loader()
    pending.catch(() => {
      pending = null
    })
    return pending
  }
}

const loadData = once(() =>
  Promise.all([
    getJson<Meta>('meta.json'),
    getJson<Line[]>('lines.json'),
    getJson<Station[]>('stations.json'),
    getJson<Company[]>('companies.json'),
    getJson<Vehicle[]>('vehicles.json'),
  ]).then(([meta, lines, stations, companies, vehicles]) => ({
    meta,
    lines: new Map(lines.map((l) => [l.id, l])),
    stations: new Map(stations.map((s) => [s.id, s])),
    companies: new Map(companies.map((c) => [c.name, c])),
    vehicles: new Map(vehicles.map((v) => [v.id, v])),
  })),
)

// 乗降客数の内訳・推移などは駅ページでしか使わないので、最初の読み込みから外して後から読む
const loadDetails = once(() => getJson<Record<string, StationDetail>>('station-details.json'))

// 乗換検索の駅のつながりは乗換ページでだけ使う
const loadRouteEdges = once(() => getJson<RouteEdges>('routes.json'))
const loadRoutes = once(() => loadRouteEdges().then(buildGraph))

export type Loadable<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T }
export type DataState = Loadable<RailData>

function useLoad<T>(load: () => Promise<T>): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    load().then(
      (data) => alive && setState({ status: 'ready', data }),
      (e: unknown) => alive && setState({ status: 'error', error: String(e) }),
    )
    return () => {
      alive = false
    }
  }, [load])
  return state
}

export const useRailData = (): DataState => useLoad(loadData)

/** 駅の詳細。読み込み中・失敗時は undefined、詳細が無い駅は null */
export function useStationDetail(id: string): StationDetail | null | undefined {
  const state = useLoad(loadDetails)
  return state.status === 'ready' ? (state.data[id] ?? null) : undefined
}

/** 乗換検索のグラフ（routes.json から作る） */
export const useRouteGraph = (): Loadable<RouteGraph> => useLoad(loadRoutes)

/** 駅のつながり（routes.json そのもの。年表マップで使う） */
export const useRouteEdges = (): Loadable<RouteEdges> => useLoad(loadRouteEdges)
