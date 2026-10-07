/**
 * Wikidata（CC0）から、国土数値情報の路線・駅に対応する項目を探し、補正表の候補を書き出す。
 *   npm run data:wikidata
 *   - data/overrides/wikidata_lines.csv     路線の表示名・路線色・開業日・軌間・電化方式
 *   - data/overrides/wikidata_stations.csv  駅の読み仮名・ローマ字・開業日
 * 結果は人が差分を確認してからコミットする。手で直したい値は line_aliases.csv / line_colors.csv に書く（そちらが優先）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Line, Station } from '../src/types'
import { type Coord, haversineKm } from './lib/geo'
import { type WdLine, earliestDate, matchLine, romajiFromEnglish, shortElectrification, singleColor } from './lib/match'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OVERRIDES = join(ROOT, 'data/overrides')
const ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'japan-rail-guide/0.1 (https://github.com/Shohei-A11Y/japan-rail-guide)'
/** 駅を同じとみなす最大距離。駅の代表点と Wikidata の座標の差は通常数百m以内 */
const STATION_MATCH_KM = 1.5

// 廃線・未成線・貨物線を除く日本の鉄道路線
const LINES_QUERY = `
SELECT ?l ?label
  (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts)
  (GROUP_CONCAT(DISTINCT ?opl; separator="|") AS ?ops)
  (GROUP_CONCAT(DISTINCT ?color; separator="|") AS ?colors)
WHERE {
  ?l wdt:P31 ?t ; wdt:P17 wd:Q17 . ?t wdt:P279* wd:Q728937 .
  FILTER NOT EXISTS { ?l wdt:P576 [] }
  FILTER NOT EXISTS { ?l wdt:P31 ?x . VALUES ?x { wd:Q357685 wd:Q11519483 wd:Q2637759 } }
  ?l rdfs:label ?label . FILTER(LANG(?label) = "ja")
  OPTIONAL { ?l skos:altLabel ?alt . FILTER(LANG(?alt) = "ja") }
  OPTIONAL {
    ?l wdt:P137 ?op .
    { ?op rdfs:label ?opl } UNION { ?op skos:altLabel ?opl }
    FILTER(LANG(?opl) = "ja")
  }
  OPTIONAL { ?l wdt:P465 ?color }
}
GROUP BY ?l ?label`

// 照合できた路線の詳細（開業日・軌間・電化方式）
const lineDetailsQuery = (qids: string[]) => `
SELECT ?l
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?open), "/", STR(?prec)); separator="|") AS ?opens)
  (GROUP_CONCAT(DISTINCT STR(?gauge); separator="|") AS ?gauges)
  (GROUP_CONCAT(DISTINCT ?elec; separator="|") AS ?elecs)
WHERE {
  VALUES ?l { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?l p:P1619/psv:P1619 [ wikibase:timeValue ?open ; wikibase:timePrecision ?prec ] }
  OPTIONAL { ?l wdt:P1064/p:P2049/psv:P2049 [ wikibase:quantityAmount ?gauge ; wikibase:quantityUnit wd:Q174789 ] }
  OPTIONAL { ?l wdt:P930 ?e . ?e rdfs:label ?elec . FILTER(LANG(?elec) = "ja") }
}
GROUP BY ?l`

// 現存する日本の鉄道駅・停留場（乗換駅など下位分類を含む。貨物駅 Q55493・計画中の駅 Q28109487 は除く）
const STATIONS_QUERY = `
SELECT ?s ?label (SAMPLE(?coord) AS ?c) (SAMPLE(?kana) AS ?k) (SAMPLE(?en) AS ?e)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?open), "/", STR(?prec)); separator="|") AS ?opens)
WHERE {
  VALUES ?root { wd:Q55488 wd:Q2175765 }
  ?s wdt:P31/wdt:P279* ?root ; wdt:P17 wd:Q17 ; wdt:P625 ?coord .
  FILTER NOT EXISTS { ?s wdt:P576 [] }
  FILTER NOT EXISTS { ?s wdt:P31 ?x . VALUES ?x { wd:Q55493 wd:Q28109487 } }
  ?s rdfs:label ?label . FILTER(LANG(?label) = "ja")
  OPTIONAL { ?s wdt:P1814 ?kana }
  OPTIONAL { ?s rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?s p:P1619/psv:P1619 [ wikibase:timeValue ?open ; wikibase:timePrecision ?prec ] }
}
GROUP BY ?s ?label`

type Binding = Record<string, { value: string } | undefined>

async function sparql(query: string): Promise<Binding[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ query }),
  })
  if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`)
  return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings
}

const split = (v?: { value: string }) => (v?.value ? v.value.split('|').filter(Boolean) : [])
const qidOf = (uri: string) => uri.replace(/^.*\//, '')
const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const csvRow = (values: (string | number)[]) => values.map((v) => csvField(String(v))).join(',')

async function syncLines(lines: Line[], today: string) {
  const items: WdLine[] = (await sparql(LINES_QUERY)).map((b) => ({
    qid: qidOf(b.l!.value),
    label: b.label!.value,
    aliases: split(b.alts),
    operators: split(b.ops),
    colors: split(b.colors),
  }))
  const byQid = new Map(items.map((it) => [it.qid, it]))
  // 通称区間（ミニ新幹線など）は元データに無い路線なので照合しない
  const targets = lines.filter((l) => !l.via)
  const matches = targets.map((l) => ({ line: l, match: matchLine(l.company, l.name, items) }))
  const qids = [...new Set(matches.flatMap((m) => (m.match ? [m.match.qid] : [])))]
  const details = new Map<string, { opened: string; gauges: string[]; elecs: string[] }>()
  for (let i = 0; i < qids.length; i += 200) {
    for (const b of await sparql(lineDetailsQuery(qids.slice(i, i + 200)))) {
      details.set(qidOf(b.l!.value), {
        opened: earliestDate(split(b.opens)),
        gauges: [...new Set(split(b.gauges).map((g) => String(Math.round(Number(g)))))],
        elecs: [...new Set(split(b.elecs).map(shortElectrification))],
      })
    }
  }

  const rows = [csvRow(['company', 'line', 'qid', 'label', 'color', 'opened', 'gauge_mm', 'electrification', 'match', 'source'])]
  const unmatched: string[] = []
  const counts = { label: 0, alias: 0, suffix: 0, color: 0, opened: 0, gauge: 0, elec: 0 }
  for (const { line: l, match: m } of matches.sort((a, b) =>
    `${a.line.company}|${a.line.name}`.localeCompare(`${b.line.company}|${b.line.name}`, 'ja'),
  )) {
    if (!m) {
      unmatched.push(`${l.company} ${l.name}`)
      continue
    }
    counts[m.how]++
    const color = singleColor(byQid.get(m.qid)!.colors) ?? ''
    const d = details.get(m.qid) ?? { opened: '', gauges: [], elecs: [] }
    if (color) counts.color++
    if (d.opened) counts.opened++
    if (d.gauges.length) counts.gauge++
    if (d.elecs.length) counts.elec++
    rows.push(
      csvRow([
        l.company,
        l.name,
        m.qid,
        m.label,
        color,
        d.opened,
        d.gauges.join('|'),
        d.elecs.join('|'),
        m.how,
        `Wikidata ${m.qid}（${today}取得）`,
      ]),
    )
  }
  writeFileSync(join(OVERRIDES, 'wikidata_lines.csv'), rows.join('\n') + '\n')
  console.log(
    `lines: items=${items.length} matched=${rows.length - 1}/${targets.length} ` +
      `(label=${counts.label} alias=${counts.alias} suffix=${counts.suffix}) ` +
      `color=${counts.color} opened=${counts.opened} gauge=${counts.gauge} electrification=${counts.elec}`,
  )
  console.log(`lines unmatched (${unmatched.length}): ${unmatched.join(' / ')}`)
}

async function syncStations(stations: Station[], today: string) {
  type WdStation = { qid: string; name: string; coord: Coord; kana: string; en: string; opened: string }
  const byName = new Map<string, WdStation[]>()
  for (const b of await sparql(STATIONS_QUERY)) {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.c?.value ?? '')
    if (!m) continue
    // 「大塚駅 (東京都)」→「大塚」
    const name = b.label!.value.replace(/\s*[(（].*[)）]$/, '').replace(/駅$/, '')
    const st: WdStation = {
      qid: qidOf(b.s!.value),
      name,
      coord: [Number(m[1]), Number(m[2])],
      // 読み仮名は「とうきょうえき」のように「えき」まで入っているので外す
      kana: (b.k?.value ?? '').replace(/えき$/, ''),
      en: b.e?.value ?? '',
      opened: earliestDate(split(b.opens)),
    }
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name)!.push(st)
  }

  const rows = [csvRow(['station_id', 'name', 'qid', 'kana', 'romaji', 'opened', 'distance_m', 'source'])]
  const counts = { kana: 0, romaji: 0, opened: 0 }
  for (const s of [...stations].sort((a, b) => a.id.localeCompare(b.id))) {
    const nearest = (byName.get(s.name) ?? [])
      .map((w) => ({ w, d: haversineKm([s.lon, s.lat], w.coord) }))
      .filter((x) => x.d <= STATION_MATCH_KM)
      .sort((a, b) => a.d - b.d)[0]
    if (!nearest) continue
    const { w, d } = nearest
    const romaji = w.en ? romajiFromEnglish(w.en) : ''
    if (w.kana) counts.kana++
    if (romaji) counts.romaji++
    if (w.opened) counts.opened++
    rows.push(
      csvRow([s.id, s.name, w.qid, w.kana, romaji, w.opened, Math.round(d * 1000), `Wikidata ${w.qid}（${today}取得）`]),
    )
  }
  writeFileSync(join(OVERRIDES, 'wikidata_stations.csv'), rows.join('\n') + '\n')
  console.log(
    `stations: matched=${rows.length - 1}/${stations.length} kana=${counts.kana} romaji=${counts.romaji} opened=${counts.opened}`,
  )
}

async function main() {
  const lines: Line[] = JSON.parse(readFileSync(join(ROOT, 'public/data/lines.json'), 'utf8'))
  const stations: Station[] = JSON.parse(readFileSync(join(ROOT, 'public/data/stations.json'), 'utf8'))
  const today = new Date().toISOString().slice(0, 10)
  await syncLines(lines, today)
  await syncStations(stations, today)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
