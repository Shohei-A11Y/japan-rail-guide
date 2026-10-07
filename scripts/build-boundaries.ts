/**
 * 国土数値情報「行政区域データ（N03）」から、駅の所在地（都道府県・市区町村）を判定するための
 * 簡略化した境界データ data/static/admin_areas.json を作る。
 *   npm run data:boundaries
 * 行政区域はめったに変わらないため、毎月の自動更新では実行せず、境界が変わったときに手で作り直す。
 * 都道府県ごとのファイル（各数MB〜数十MB）を順に処理し、全国一括（約600MB）は使わない。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { type Coord, bboxOf, roundCoord, simplify } from './lib/geo'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'data/raw/n03')
const OUT = join(ROOT, 'data/static/admin_areas.json')
const EDITION = '20250101'
const PAGE = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html'
const zipUrl = (pref: string) =>
  `https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-${EDITION.slice(0, 4)}/N03-${EDITION}_${pref}_GML.zip`
// 約40m。駅の所在地判定には十分で、ファイルを小さく保てる（境界のごく近くの駅は判定がずれうる）
const TOLERANCE_DEG = 0.0004

export interface AdminArea {
  /** 全国地方公共団体コード（5桁） */
  code: string
  pref: string
  /** 市区町村名（政令指定都市は「市＋区」） */
  city: string
  bbox: [number, number, number, number]
  /** 多角形の配列。各多角形は [外周, 穴...] */
  polygons: Coord[][][]
}

async function fetchZip(pref: string): Promise<Uint8Array> {
  mkdirSync(RAW, { recursive: true })
  const file = join(RAW, `N03-${EDITION}_${pref}_GML.zip`)
  if (existsSync(file)) return readFileSync(file)
  console.log(`download ${pref}`)
  const res = await fetch(zipUrl(pref))
  if (!res.ok) throw new Error(`${pref}: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  writeFileSync(file, bytes)
  return bytes
}

async function main() {
  const areas = new Map<string, AdminArea>()
  for (let i = 1; i <= 47; i++) {
    const pref = String(i).padStart(2, '0')
    const zip = unzipSync(await fetchZip(pref), { filter: (f) => f.name.endsWith('.geojson') })
    const name = Object.keys(zip)[0]
    const features: { properties: Record<string, string | null>; geometry: { coordinates: Coord[][] } }[] =
      JSON.parse(new TextDecoder().decode(zip[name])).features
    for (const f of features) {
      const p = f.properties
      const code = p.N03_007
      // 所属未定地（コード末尾000など）は駅の所在地にならないので除く
      if (!code || !p.N03_004 || p.N03_004 === '所属未定地') continue
      const rings = f.geometry.coordinates
        .map((ring) => simplify(ring, TOLERANCE_DEG).map((c) => roundCoord(c, 4)))
        .filter((ring) => ring.length >= 4)
      if (rings.length === 0) continue
      if (!areas.has(code)) {
        areas.set(code, {
          code,
          pref: p.N03_001 ?? '',
          city: `${p.N03_004}${p.N03_005 ?? ''}`,
          bbox: [0, 0, 0, 0],
          polygons: [],
        })
      }
      areas.get(code)!.polygons.push(rings)
    }
  }
  for (const a of areas.values()) {
    a.bbox = bboxOf(a.polygons.flatMap((poly) => poly[0])).map((v) => Math.round(v * 1e5) / 1e5) as AdminArea['bbox']
  }
  const list = [...areas.values()].sort((a, b) => a.code.localeCompare(b.code))
  const prefs = new Set(list.map((a) => a.pref))
  if (list.length < 1700 || prefs.size !== 47) throw new Error(`想定外の件数: 市区町村${list.length} 都道府県${prefs.size}`)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(
    OUT,
    JSON.stringify({
      source: {
        title: '国土数値情報（行政区域データ）',
        edition: `${EDITION.slice(0, 4)}年${Number(EDITION.slice(4, 6))}月${Number(EDITION.slice(6))}日時点`,
        url: PAGE,
        license: 'CC BY 4.0',
        retrievedAt: new Date().toISOString().slice(0, 10),
      },
      areas: list,
    }),
  )
  console.log(`areas=${list.length} prefs=${prefs.size}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
