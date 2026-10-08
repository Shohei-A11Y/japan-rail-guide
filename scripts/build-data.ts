/**
 * 公開オープンデータから、アプリが読む静的データ（public/data/*）を作る。
 *   npm run data:build            ダウンロード済みのファイルがあれば再利用
 *   npm run data:build -- --refresh  取得し直す
 * 生成結果が想定外に小さい場合などは異常終了し、前回のデータを上書きしない。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { COMPANY_TYPE_LABELS, DEFAULT_LINE_COLORS } from '../src/codes'
import type { Company, CompanyType, Line, Meta, Source, Station, StationDetail, Vehicle } from '../src/types'
import { mainPaths } from './lib/chain'
import { parseCsv } from './lib/csv'
import {
  type Coord,
  bboxOf,
  centroid,
  haversineKm,
  lengthKm,
  pointInPolygon,
  projectOnPolyline,
  roundCoord,
  simplify,
  slicePolyline,
} from './lib/geo'
import { lineId, stationId, uniqueId } from './lib/ids'
import { type S12Year, aggregateByYear, s12Years } from './lib/passengers'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'data/raw')
const OVERRIDES = join(ROOT, 'data/overrides')
const OUT = join(ROOT, 'public/data')
const ADMIN_AREAS = join(ROOT, 'data/static/admin_areas.json')

// 国土数値情報の版。新しい版が出たらここを更新する（zipの番号と「○年度版」の年はデータによってずれる）
const N02 = { edition: '25', label: '2025年度版（2025年12月31日時点）', asOf: '2025-12-31', page: 'KsjTmplt-N02-2025.html' }
const S12 = { edition: '25', label: '2024年度版', page: 'KsjTmplt-S12-2024.html' }
const HISTORY_YEARS = 5
const SIMPLIFY_TOLERANCE_DEG = 0.0001 // 約10m

const SOURCES = {
  n02: {
    id: 'ksj-n02',
    title: '国土数値情報（鉄道データ）',
    url: `https://nlftp.mlit.go.jp/ksj/gml/datalist/${N02.page}`,
    zip: `https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-${N02.edition}/N02-${N02.edition}_GML.zip`,
    license: 'CC BY 4.0',
    edition: N02.label,
  },
  s12: {
    id: 'ksj-s12',
    title: '国土数値情報（駅別乗降客数データ）',
    url: `https://nlftp.mlit.go.jp/ksj/gml/datalist/${S12.page}`,
    zip: `https://nlftp.mlit.go.jp/ksj/gml/data/S12/S12-${S12.edition}/S12-${S12.edition}_GML.zip`,
    license: 'CC BY 4.0',
    edition: S12.label,
  },
}

type Feature = { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }

async function download(url: string, refresh: boolean): Promise<{ bytes: Uint8Array; retrievedAt: string }> {
  mkdirSync(RAW, { recursive: true })
  const file = join(RAW, url.split('/').pop()!)
  const stamp = file + '.retrieved'
  if (!refresh && existsSync(file) && existsSync(stamp)) {
    return { bytes: readFileSync(file), retrievedAt: readFileSync(stamp, 'utf8').trim() }
  }
  console.log(`download ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const retrievedAt = new Date().toISOString().slice(0, 10)
  writeFileSync(file, bytes)
  writeFileSync(stamp, retrievedAt)
  return { bytes, retrievedAt }
}

function readGeoJson(zip: Record<string, Uint8Array>, suffix: string): Feature[] {
  const name = Object.keys(zip).find((n) => n.endsWith(suffix) && n.includes('UTF-8/'))
  if (!name) throw new Error(`zip に ${suffix} が見つからない`)
  return JSON.parse(new TextDecoder().decode(zip[name])).features
}

function readOverrides(file: string): Record<string, string>[] {
  const path = join(OVERRIDES, file)
  return existsSync(path) ? parseCsv(readFileSync(path, 'utf8')) : []
}

const str = (v: unknown) => String(v ?? '').trim()

async function main() {
  const refresh = process.argv.includes('--refresh')
  const n02Zip = await download(SOURCES.n02.zip, refresh)
  const s12Zip = await download(SOURCES.s12.zip, refresh)
  const n02 = unzipSync(n02Zip.bytes)
  const s12 = unzipSync(s12Zip.bytes)
  const sections = readGeoJson(n02, '_RailroadSection.geojson')
  const stationFeatures = readGeoJson(n02, '_Station.geojson')
  const passengerFeatures = readGeoJson(s12, '_NumberOfPassengers.geojson')

  // --- 補正表 ---
  // 元データの誤り（事業者名と路線名の入れ替わりなど）
  const fixes = new Map(
    readOverrides('n02_fixes.csv').map((r) => [`${r.company}|${r.line}`, { company: r.to_company, line: r.to_line }]),
  )
  const fix = (company: string, line: string) => fixes.get(`${company}|${line}`) ?? { company, line }
  const colorOverrides = new Map(readOverrides('line_colors.csv').map((r) => [`${r.company}|${r.line}`, r.color]))
  const aliasOverrides = new Map(readOverrides('line_aliases.csv').map((r) => [`${r.company}|${r.line}`, r.display_name]))
  // Wikidata との照合結果（scripts/sync-wikidata.ts が作る）
  const wikidataRows = readOverrides('wikidata_lines.csv')
  const wikidata = new Map(wikidataRows.map((r) => [`${r.company}|${r.line}`, r]))
  // ミニ新幹線など、既存路線の一部区間を別の路線として見せる通称区間
  const virtualRows = readOverrides('virtual_lines.csv')

  // --- 路線 ---
  type LineDraft = { company: string; name: string; companyType: CompanyType; railType: string; segments: Coord[][] }
  const lineDrafts = new Map<string, LineDraft>()
  for (const f of sections) {
    const { company, line } = fix(str(f.properties.N02_004), str(f.properties.N02_003))
    const key = `${company}|${line}`
    if (!lineDrafts.has(key)) {
      lineDrafts.set(key, {
        company,
        name: line,
        companyType: Number(f.properties.N02_002) as CompanyType,
        railType: str(f.properties.N02_001),
        segments: [],
      })
    }
    lineDrafts.get(key)!.segments.push(f.geometry.coordinates as Coord[])
  }
  const lineIds = new Map<string, string>()
  const usedLineIds = new Set<string>()
  for (const [key, d] of [...lineDrafts].sort(([a], [b]) => a.localeCompare(b))) {
    lineIds.set(key, uniqueId(lineId(d.company, d.name), usedLineIds))
  }

  // --- 駅（同名・300m以内のまとまり = 元データのグループコード単位） ---
  type Member = { code: string; key: string; center: Coord }
  const groups = new Map<string, { name: string; members: Member[] }>()
  for (const f of stationFeatures) {
    const { company, line } = fix(str(f.properties.N02_004), str(f.properties.N02_003))
    const group = str(f.properties.N02_005g)
    if (!groups.has(group)) groups.set(group, { name: str(f.properties.N02_005), members: [] })
    groups.get(group)!.members.push({
      code: str(f.properties.N02_005c),
      key: `${company}|${line}`,
      center: centroid(f.geometry.coordinates as Coord[]),
    })
  }
  const usedStationIds = new Set<string>()
  const codeToStation = new Map<string, string>()
  const nameLineToStation = new Map<string, string>()
  const stations = new Map<string, Station>()
  // 駅ページを開いたときだけ読む詳細
  const details = new Map<string, StationDetail>()
  const detailOf = (id: string) => {
    if (!details.has(id)) details.set(id, { history: [], breakdown: [] })
    return details.get(id)!
  }
  const sortedGroups = [...groups.values()].sort((a, b) => a.members[0].code.localeCompare(b.members[0].code))
  for (const g of sortedGroups) {
    const [lon, lat] = roundCoord(centroid(g.members.map((m) => m.center)), 6)
    const id = uniqueId(stationId(g.name, lon, lat), usedStationIds)
    const lines = [...new Set(g.members.map((m) => lineIds.get(m.key)).filter((x): x is string => !!x))]
    stations.set(id, { id, name: g.name, lon, lat, lines, passengers: null })
    for (const m of g.members) {
      codeToStation.set(m.code, id)
      nameLineToStation.set(`${g.name}|${m.key}`, id)
    }
  }

  // --- 駅の所在地（行政区域）と Wikidata の読み仮名・開業日 ---
  const admin: {
    source: { title: string; edition: string; url: string; license: string; retrievedAt: string }
    areas: { pref: string; city: string; bbox: [number, number, number, number]; polygons: Coord[][][] }[]
  } = JSON.parse(readFileSync(ADMIN_AREAS, 'utf8'))
  let outside = 0
  for (const st of stations.values()) {
    const p: Coord = [st.lon, st.lat]
    const inBox = (b: number[], m = 0) => p[0] >= b[0] - m && p[0] <= b[2] + m && p[1] >= b[1] - m && p[1] <= b[3] + m
    let area = admin.areas.find((a) => inBox(a.bbox) && a.polygons.some((poly) => pointInPolygon(p, poly)))
    if (!area) {
      // 埋立地や境界の簡略化で外れた駅は、500m以内で最も近い境界の市区町村にする
      outside++
      let best = { d: 0.5, a: undefined as (typeof admin.areas)[number] | undefined }
      for (const a of admin.areas) {
        if (!inBox(a.bbox, 0.01)) continue
        for (const poly of a.polygons) for (const c of poly[0]) {
          const d = haversineKm(p, c)
          if (d < best.d) best = { d, a }
        }
      }
      area = best.a
    }
    if (area) {
      st.pref = area.pref
      st.city = area.city
    }
  }
  for (const r of readOverrides('wikidata_stations.csv')) {
    const st = stations.get(r.station_id)
    if (!st || st.name !== r.name) continue
    if (r.kana) st.kana = r.kana
    if (r.romaji) st.romaji = r.romaji
    if (r.opened) st.opened = r.opened
    st.wikidata = r.qid
    if (r.wp) detailOf(st.id).wp = r.wp
    if (r.image) detailOf(st.id).image = r.image
  }
  // 標高（地理院タイル）。座標が変わった駅は、npm run data:elevation で取り直すまで出さない
  const elevationRows = readOverrides('gsi_elevations.csv')
  for (const r of elevationRows) {
    const st = stations.get(r.station_id)
    if (!st || !r.elevation_m || r.coord !== `${st.lon.toFixed(5)},${st.lat.toFixed(5)}`) continue
    st.elevation = Math.round(Number(r.elevation_m))
  }

  // --- 乗降客数 ---
  const rowsByStation = new Map<string, { company: string; line: string; years: S12Year[] }[]>()
  let unmatched = 0
  let latestYear = 0
  for (const f of passengerFeatures) {
    const p = f.properties
    const { company, line } = fix(str(p.S12_002), str(p.S12_003))
    const name = str(p.S12_001)
    const byCode = codeToStation.get(str(p.S12_001c))
    const id =
      byCode && stations.get(byCode)!.name === name ? byCode : nameLineToStation.get(`${name}|${company}|${line}`)
    const years = s12Years(p)
    if (years.length) latestYear = Math.max(latestYear, years[years.length - 1].year)
    if (!id) {
      unmatched++
      continue
    }
    if (!rowsByStation.has(id)) rowsByStation.set(id, [])
    rowsByStation.get(id)!.push({ company, line, years })
  }
  for (const [id, rows] of rowsByStation) {
    const st = stations.get(id)!
    const totals = aggregateByYear(rows.map((r) => r.years))
    st.passengers = totals.get(latestYear) ?? null
    const detail = detailOf(id)
    detail.history = [...totals]
      .filter(([y]) => y > latestYear - HISTORY_YEARS)
      .sort(([a], [b]) => a - b)
    detail.breakdown = rows
      .map((r) => ({ r, y: r.years.find((y) => y.year === latestYear) }))
      .filter(({ y }) => y && y.duplicate === 1 && y.availability === 1 && (y.passengers ?? 0) > 0)
      .map(({ r, y }) => ({ company: r.company, line: r.line, value: y!.passengers!, remarks: y!.remarks }))
      .sort((a, b) => b.value - a.value)
  }

  // --- 路線ごとの駅の並びと地図用の線形 ---
  const lines: Line[] = []
  const networkFeatures: unknown[] = []
  const membersByLine = new Map<string, { id: string; center: Coord }[]>()
  type Stop = { id: string; path: number; along: number }
  const geoByKey = new Map<string, { id: string; paths: Coord[][]; stops: Stop[] }>()
  for (const g of sortedGroups) {
    const id = codeToStation.get(g.members[0].code)!
    for (const m of g.members) {
      const lid = lineIds.get(m.key)
      if (!lid) continue
      if (!membersByLine.has(lid)) membersByLine.set(lid, [])
      membersByLine.get(lid)!.push({ id, center: m.center })
    }
  }
  for (const [key, d] of lineDrafts) {
    const id = lineIds.get(key)!
    const paths = mainPaths(d.segments)
    const ordered = (membersByLine.get(id) ?? [])
      .map((m) => {
        let best = { path: 0, along: 0, offset: Infinity }
        paths.forEach((path, i) => {
          const pr = projectOnPolyline(m.center, path)
          if (pr.offset < best.offset) best = { path: i, ...pr }
        })
        return { id: m.id, path: best.path, along: best.along }
      })
      .sort((a, b) => a.path - b.path || a.along - b.along)
    geoByKey.set(key, { id, paths, stops: ordered })
    const shinkansen = d.companyType === 1
    const wd = wikidata.get(key)
    const override = colorOverrides.get(key)
    const colorSource: Line['colorSource'] = override ? 'override' : wd?.color ? 'wikidata' : 'default'
    const color = override || wd?.color || DEFAULT_LINE_COLORS[d.companyType]
    lines.push({
      id,
      name: d.name,
      displayName: aliasOverrides.get(key) || wd?.label || d.name,
      company: d.company,
      companyType: d.companyType,
      railType: d.railType,
      shinkansen,
      color,
      colorSource,
      ...(wd?.qid ? { wikidata: wd.qid } : {}),
      ...(wd?.opened ? { opened: wd.opened } : {}),
      // データの時点より後に廃止された路線だけ廃止日を持たせる（それ以前の日付は一部区間の廃止など）
      ...(wd?.closed && wd.closed > N02.asOf ? { closed: wd.closed } : {}),
      ...(wd?.gauge_mm ? { gaugeMm: wd.gauge_mm.split('|').map(Number) } : {}),
      ...(wd?.electrification ? { electrification: wd.electrification.split('|') } : {}),
      ...(wd?.wp ? { wp: wd.wp } : {}),
      ...(wd?.image ? { image: wd.image } : {}),
      prefs: [],
      lengthKm: Math.round(d.segments.reduce((s, seg) => s + lengthKm(seg), 0) * 10) / 10,
      bbox: bboxOf(d.segments.flat()).map((v) => Math.round(v * 1e4) / 1e4) as Line['bbox'],
      stations: [...new Set(ordered.map((o) => o.id))],
    })
    networkFeatures.push({
      type: 'Feature',
      properties: { id, c: color, s: shinkansen ? 1 : 0, t: d.companyType, r: d.railType },
      geometry: {
        type: 'MultiLineString',
        coordinates: d.segments.map((seg) => simplify(seg, SIMPLIFY_TOLERANCE_DEG).map((c) => roundCoord(c))),
      },
    })
  }
  // --- 通称区間（ミニ新幹線など） ---
  const problems: string[] = []
  const virtualNames = [...new Set(virtualRows.map((r) => `${r.company}|${r.name}`))]
  for (const vkey of virtualNames) {
    const parts = virtualRows.filter((r) => `${r.company}|${r.name}` === vkey)
    const first = parts[0]
    const segments: Coord[][] = []
    const stopIds: string[] = []
    const via: NonNullable<Line['via']> = []
    let base: LineDraft | undefined
    for (const part of parts) {
      const baseKey = `${part.company}|${part.base_line}`
      const geo = geoByKey.get(baseKey)
      base ??= lineDrafts.get(baseKey)
      const find = (name: string) => geo?.stops.find((st) => stations.get(st.id)!.name === name)
      const from = find(part.from)
      const to = find(part.to)
      if (!geo || !from || !to || from.path !== to.path) {
        problems.push(`通称区間「${first.name}」の ${part.base_line} ${part.from}〜${part.to} が見つからない`)
        continue
      }
      const [lo, hi] = from.along <= to.along ? [from, to] : [to, from]
      const coords = slicePolyline(geo.paths[from.path], lo.along, hi.along)
      const between = geo.stops.filter((st) => st.path === from.path && st.along >= lo.along && st.along <= hi.along)
      // from → to の向きにそろえる
      if (from !== lo) {
        coords.reverse()
        between.reverse()
      }
      segments.push(coords)
      for (const st of between) if (!stopIds.includes(st.id)) stopIds.push(st.id)
      via.push({ line: geo.id, from: part.from, to: part.to })
    }
    if (!base || segments.length !== parts.length) continue
    const id = uniqueId(lineId(first.company, first.name), usedLineIds)
    for (const sid of stopIds) stations.get(sid)!.lines.push(id)
    const color = first.color || DEFAULT_LINE_COLORS[1]
    lines.push({
      id,
      name: first.name,
      displayName: first.name,
      company: first.company,
      companyType: base.companyType,
      railType: base.railType,
      shinkansen: first.shinkansen === 'yes',
      color,
      colorSource: first.color ? 'override' : 'default',
      ...(first.wikidata ? { wikidata: first.wikidata } : {}),
      via,
      prefs: [],
      lengthKm: Math.round(segments.reduce((sum, seg) => sum + lengthKm(seg), 0) * 10) / 10,
      bbox: bboxOf(segments.flat()).map((v) => Math.round(v * 1e4) / 1e4) as Line['bbox'],
      stations: stopIds,
    })
    networkFeatures.push({
      type: 'Feature',
      properties: { id, c: color, s: first.shinkansen === 'yes' ? 1 : 0, t: base.companyType, r: base.railType },
      geometry: {
        type: 'MultiLineString',
        coordinates: segments.map((seg) => simplify(seg, SIMPLIFY_TOLERANCE_DEG).map((c) => roundCoord(c))),
      },
    })
  }

  // 通過する都道府県（駅の並び順で最初に現れた順）
  for (const l of lines) {
    l.prefs = [...new Set(l.stations.map((id) => stations.get(id)!.pref).filter((p): p is string => !!p))]
  }

  lines.sort((a, b) => a.id.localeCompare(b.id))
  const stationList = [...stations.values()].sort((a, b) => a.id.localeCompare(b.id))

  // --- 検証（異常なら前回データを残して終了） ---
  const companies = new Set(lines.map((l) => l.company))
  if (lines.length < 450) problems.push(`路線数が少なすぎる: ${lines.length}`)
  if (stationList.length < 8000) problems.push(`駅数が少なすぎる: ${stationList.length}`)
  if (lines.filter((l) => l.companyType === 1).length < 8) problems.push('新幹線の路線が少なすぎる')
  if (stationList.some((s) => s.lines.length === 0)) problems.push('路線に属さない駅がある')
  const withPassengers = stationList.filter((s) => s.passengers != null).length
  if (withPassengers < stationList.length * 0.6) problems.push(`乗降客数のある駅が少なすぎる: ${withPassengers}`)
  const withPref = stationList.filter((s) => s.pref).length
  if (withPref < stationList.length * 0.99) problems.push(`所在地が分からない駅が多すぎる: ${stationList.length - withPref}`)
  if (new Set(stationList.map((s) => s.pref)).size < 47) problems.push('駅のない都道府県がある')
  for (const t of Object.keys(COMPANY_TYPE_LABELS)) {
    if (!lines.some((l) => l.companyType === Number(t))) problems.push(`事業者種別${t}の路線が無い`)
  }
  if (problems.length) {
    console.error('検証に失敗したため出力しません:\n- ' + problems.join('\n- '))
    process.exit(1)
  }

  const ksj = (src: (typeof SOURCES)['n02'], retrievedAt: string): Source => ({
    ...pick(src),
    retrievedAt,
    credit: `「${src.title}」（国土交通省）（${src.url}）（${retrievedAt}取得）を加工して作成`,
  })
  const sources: Source[] = [ksj(SOURCES.n02, n02Zip.retrievedAt), ksj(SOURCES.s12, s12Zip.retrievedAt)]
  sources.push({
    id: 'ksj-n03',
    title: admin.source.title,
    url: admin.source.url,
    license: admin.source.license,
    edition: admin.source.edition,
    retrievedAt: admin.source.retrievedAt,
    credit: `「${admin.source.title}」（国土交通省）（${admin.source.url}）（${admin.source.retrievedAt}取得）を加工して作成`,
  })
  if (elevationRows.length) {
    const retrievedAt =
      elevationRows
        .map((r) => /(\d{4}-\d{2}-\d{2})/.exec(r.source)?.[1] ?? '')
        .sort()
        .pop() ?? ''
    sources.push({
      id: 'gsi-dem',
      title: '地理院タイル（標高タイル）',
      url: 'https://maps.gsi.go.jp/development/demtile.html',
      license: '国土地理院コンテンツ利用規約（CC BY 4.0 互換）',
      edition: '基盤地図情報 数値標高モデル（DEM5A、無い地点は DEM10B）',
      retrievedAt,
      credit: `国土地理院「地理院タイル（標高タイル）」（${retrievedAt}取得）を加工して作成`,
    })
  }
  if (wikidataRows.length) {
    const retrievedAt =
      wikidataRows
        .map((r) => /(\d{4}-\d{2}-\d{2})/.exec(r.source)?.[1] ?? '')
        .sort()
        .pop() ?? ''
    sources.push({
      id: 'wikidata',
      title: 'Wikidata',
      url: 'https://www.wikidata.org/',
      license: 'CC0 1.0',
      edition: '路線の表示名・路線色・開業日・軌間・電化方式、駅の読み仮名・開業日、事業者、車両形式、Wikipedia記事名・Commons画像名',
      retrievedAt,
      credit: `Wikidata（${retrievedAt}取得）の情報を使用`,
    })
  }
  // --- 事業者と車両形式（Wikidata） ---
  const companyRows = new Map(readOverrides('wikidata_companies.csv').map((r) => [r.company, r]))
  const companyList: Company[] = [...companies].sort((a, b) => a.localeCompare(b, 'ja')).map((name) => {
    const r = companyRows.get(name)
    const opt = (k: keyof Company, v?: string) => (v ? { [k]: v } : {})
    return {
      name,
      ...opt('wikidata', r?.qid),
      ...opt('label', r?.label),
      ...opt('wp', r?.wp),
      ...opt('image', r?.image),
      ...opt('inception', r?.inception),
      ...opt('headquarters', r?.headquarters),
      ...opt('website', r?.website),
    }
  })
  const list = (v?: string) => (v ? v.split('|').filter(Boolean) : [])
  const vehicles: Vehicle[] = readOverrides('wikidata_vehicles.csv').map((r) => ({
    id: r.qid,
    name: r.name,
    kind: r.kind,
    companies: list(r.companies).filter((c) => companies.has(c)),
    operators: list(r.operators),
    manufacturers: list(r.manufacturers),
    ...(r.entry ? { entry: r.entry } : {}),
    ...(r.retired ? { retired: r.retired } : {}),
    ...(r.max_speed_kmh ? { maxSpeedKmh: Number(r.max_speed_kmh) } : {}),
    ...(r.wp ? { wp: r.wp } : {}),
    ...(r.image ? { image: r.image } : {}),
  }))

  const meta: Meta = {
    generatedAt: new Date().toISOString(),
    passengerYear: latestYear || null,
    sources,
    counts: { lines: lines.length, stations: stationList.length, companies: companies.size, vehicles: vehicles.length },
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  writeFileSync(join(OUT, 'lines.json'), JSON.stringify(lines))
  writeFileSync(join(OUT, 'stations.json'), JSON.stringify(stationList))
  writeFileSync(
    join(OUT, 'station-details.json'),
    JSON.stringify(Object.fromEntries([...details].sort(([a], [b]) => a.localeCompare(b)))),
  )
  writeFileSync(join(OUT, 'companies.json'), JSON.stringify(companyList))
  writeFileSync(join(OUT, 'vehicles.json'), JSON.stringify(vehicles))
  writeFileSync(join(OUT, 'network.geojson'), JSON.stringify({ type: 'FeatureCollection', features: networkFeatures }))
  console.log(
    `lines=${lines.length} stations=${stationList.length} companies=${companies.size} ` +
      `passengers=${withPassengers} (FY${latestYear}) s12_unmatched=${unmatched} ` +
      `pref=${withPref} (fallback ${outside}) kana=${stationList.filter((s) => s.kana).length} elevation=${stationList.filter((s) => s.elevation != null).length} vehicles=${vehicles.length}`,
  )
}

function pick(s: (typeof SOURCES)['n02']) {
  return { id: s.id, title: s.title, url: s.url, license: s.license, edition: s.edition }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
