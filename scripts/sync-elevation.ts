/**
 * 駅の代表点の標高を、地理院タイルの標高タイル（DEM5A、無ければ DEM10B）から読み取る。
 *   npm run data:elevation
 *   - data/overrides/gsi_elevations.csv  駅ID・座標・標高（m）・使ったDEM
 * public/data/stations.json の駅のうち、表に無い駅と座標が変わった駅だけを取得する（地形はほぼ変わらないため）。
 * 値は地表の標高で、高架や地下のホームの高さではない。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Station } from '../src/types'
import { csvRow, parseCsv } from './lib/csv'
import { DEM_TILES, decodeRgbPng, demValue, tilePixel } from './lib/dem'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'data/overrides/gsi_elevations.csv')
const CONCURRENCY = 6

const coordKey = (lon: number, lat: number) => `${lon.toFixed(5)},${lat.toFixed(5)}`

const tiles = new Map<string, Promise<Uint8Array | null>>()

async function fetchTile(url: string, attempt = 1): Promise<Uint8Array | null> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) {
    if (attempt < 4 && (res.status >= 500 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      return fetchTile(url, attempt + 1)
    }
    throw new Error(`${url}: ${res.status}`)
  }
  return decodeRgbPng(new Uint8Array(await res.arrayBuffer())).rgb
}

/** 精度の高いDEMから順に試し、値のある最初のものを返す */
async function elevationAt(lon: number, lat: number): Promise<{ value: number; dem: string } | null> {
  for (const dem of DEM_TILES) {
    const { x, y, px, py } = tilePixel(lon, lat, dem.zoom)
    const url = dem.url.replace('{z}', String(dem.zoom)).replace('{x}', String(x)).replace('{y}', String(y))
    if (!tiles.has(url)) tiles.set(url, fetchTile(url))
    const rgb = await tiles.get(url)!
    if (!rgb) continue
    const i = (py * 256 + px) * 3
    const value = demValue(rgb[i], rgb[i + 1], rgb[i + 2])
    if (value != null) return { value, dem: dem.id }
  }
  return null
}

async function main() {
  const stations: Station[] = JSON.parse(readFileSync(join(ROOT, 'public/data/stations.json'), 'utf8'))
  const old = new Map(existsSync(FILE) ? parseCsv(readFileSync(FILE, 'utf8')).map((r) => [r.station_id, r]) : [])
  const today = new Date().toISOString().slice(0, 10)

  const rows: Record<string, string>[] = []
  const todo: Station[] = []
  for (const st of stations) {
    const prev = old.get(st.id)
    if (prev && prev.coord === coordKey(st.lon, st.lat)) rows.push(prev)
    else todo.push(st)
  }
  console.log(`再利用 ${rows.length} 駅・取得 ${todo.length} 駅`)

  let done = 0
  let missing = 0
  const queue = [...todo]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let st = queue.shift(); st; st = queue.shift()) {
        const e = await elevationAt(st.lon, st.lat)
        if (!e) missing++
        rows.push({
          station_id: st.id,
          name: st.name,
          coord: coordKey(st.lon, st.lat),
          elevation_m: e ? e.value.toFixed(1) : '',
          dem: e?.dem ?? '',
          source: `地理院タイル 標高タイル ${today}`,
        })
        if (++done % 500 === 0) console.log(`${done}/${todo.length}`)
      }
    }),
  )

  const ids = new Set(stations.map((s) => s.id))
  const header = ['station_id', 'name', 'coord', 'elevation_m', 'dem', 'source']
  const out = rows.filter((r) => ids.has(r.station_id)).sort((a, b) => a.station_id.localeCompare(b.station_id))
  writeFileSync(FILE, [header.join(','), ...out.map((r) => csvRow(header.map((h) => r[h] ?? '')))].join('\n') + '\n')
  console.log(`書き出し ${out.length} 駅（標高なし ${out.filter((r) => !r.elevation_m).length}、今回取得で値なし ${missing}）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
