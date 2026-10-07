import { useEffect, useState } from 'react'
import type { Line, Meta, Station } from './types'

export interface RailData {
  meta: Meta
  lines: Map<string, Line>
  stations: Map<string, Station>
}

const base = import.meta.env.BASE_URL
export const networkUrl = `${base}data/network.geojson`

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

let pending: Promise<RailData> | null = null

function load(): Promise<RailData> {
  pending ??= Promise.all([
    getJson<Meta>('meta.json'),
    getJson<Line[]>('lines.json'),
    getJson<Station[]>('stations.json'),
  ]).then(([meta, lines, stations]) => ({
    meta,
    lines: new Map(lines.map((l) => [l.id, l])),
    stations: new Map(stations.map((s) => [s.id, s])),
  }))
  pending.catch(() => {
    pending = null
  })
  return pending
}

export type DataState = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: RailData }

export function useRailData(): DataState {
  const [state, setState] = useState<DataState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    load().then(
      (data) => alive && setState({ status: 'ready', data }),
      (e: unknown) => alive && setState({ status: 'error', error: String(e) }),
    )
    return () => {
      alive = false
    }
  }, [])
  return state
}
