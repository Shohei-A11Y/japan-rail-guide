/**
 * Wikidata（CC0）から、国土数値情報の路線・駅に対応する項目を探し、補正表の候補を書き出す。
 *   npm run data:wikidata
 *   - data/overrides/wikidata_lines.csv      路線の表示名・路線色・開業日・軌間・電化方式・記事名・画像
 *   - data/overrides/wikidata_stations.csv   駅の読み仮名・ローマ字・開業日・記事名・画像
 *   - data/overrides/wikidata_companies.csv  事業者の記事名・設立・本社・公式サイト・画像
 *   - data/overrides/wikidata_vehicles.csv   車両形式（図鑑に載せる主要形式）
 *   一部だけ: npm run data:wikidata -- lines stations companies vehicles のうち必要なもの
 * 結果は人が差分を確認してからコミットする。手で直したい値は line_aliases.csv / line_colors.csv に書く（そちらが優先）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Line, Station } from '../src/types'
import { type Coord, haversineKm } from './lib/geo'
import {
  type WdLine,
  commonsFileName,
  earliestDate,
  matchLine,
  romajiFromEnglish,
  isOperatorOf,
  pickWebsite,
  sameOperator,
  shortElectrification,
  singleColor,
} from './lib/match'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OVERRIDES = join(ROOT, 'data/overrides')
const ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'japan-rail-guide/0.1 (https://github.com/Shohei-A11Y/japan-rail-guide)'
/** 駅を同じとみなす最大距離。駅の代表点と Wikidata の座標の差は通常数百m以内 */
const STATION_MATCH_KM = 1.5
/**
 * 図鑑に載せる車両形式の基準: 何言語の Wikipedia に記事があるか（sitelinks）。
 * 国内だけでなく海外でも記事がある形式を「主要形式」とみなす。新幹線は全形式を載せる。
 */
const VEHICLE_MIN_SITELINKS = 3

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
  (SAMPLE(?wpTitle) AS ?wp) (SAMPLE(?img) AS ?image)
WHERE {
  VALUES ?l { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?wpPage schema:about ?l ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?wpTitle }
  OPTIONAL { ?l wdt:P18 ?img }
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

// 照合できた駅の記事名・画像（一度に問い合わせると重いので後から小分けに取る）
const mediaQuery = (qids: string[]) => `
SELECT ?x (SAMPLE(?wpTitle) AS ?wp) (SAMPLE(?img) AS ?image) WHERE {
  VALUES ?x { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?wpPage schema:about ?x ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?wpTitle }
  OPTIONAL { ?x wdt:P18 ?img }
}
GROUP BY ?x`

// 照合できた路線の運営者（事業者の Wikidata 項目を見つけるため）
const lineOperatorsQuery = (qids: string[]) => `
SELECT ?l ?op (GROUP_CONCAT(DISTINCT ?name; separator="|") AS ?names) WHERE {
  VALUES ?l { ${qids.map((q) => `wd:${q}`).join(' ')} }
  ?l wdt:P137 ?op .
  { ?op rdfs:label ?name } UNION { ?op skos:altLabel ?name }
  FILTER(LANG(?name) = "ja")
}
GROUP BY ?l ?op`

const companyDetailsQuery = (qids: string[]) => `
SELECT ?c (SAMPLE(?label) AS ?name) (SAMPLE(?wpTitle) AS ?wp) (SAMPLE(?img) AS ?image)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?inc), "/", STR(?prec)); separator="|") AS ?inceptions)
  (SAMPLE(?hqLabel) AS ?hq)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?siteRank), " ", STR(?site)); separator=" ;; ") AS ?websites)
WHERE {
  VALUES ?c { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?c rdfs:label ?label . FILTER(LANG(?label) = "ja") }
  OPTIONAL { ?wpPage schema:about ?c ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?wpTitle }
  OPTIONAL { ?c wdt:P18 ?img }
  OPTIONAL { ?c p:P571/psv:P571 [ wikibase:timeValue ?inc ; wikibase:timePrecision ?prec ] }
  OPTIONAL { ?c wdt:P159 ?hqItem . ?hqItem rdfs:label ?hqLabel . FILTER(LANG(?hqLabel) = "ja") }
  OPTIONAL { ?c p:P856 ?siteStatement . ?siteStatement ps:P856 ?site ; wikibase:rank ?siteRank . FILTER(?siteRank != wikibase:DeprecatedRank) }
}
GROUP BY ?c`

// 旅客車両の形式（電車・気動車・路面電車・地下鉄車両・客車・高速列車・モノレール）
const VEHICLE_KINDS: Record<string, string> = {
  Q13402959: '高速列車',
  Q4102249: '地下鉄車両',
  Q3407658: '路面電車',
  Q187934: 'モノレール',
  Q1567915: '気動車',
  Q7132141: '気動車',
  Q753779: '客車',
  Q483373: '電車',
}
const VEHICLES_QUERY = `
SELECT ?v ?label ?sitelinks (SAMPLE(?wpTitle) AS ?wp) (SAMPLE(?img) AS ?image)
  (GROUP_CONCAT(DISTINCT STR(?kind); separator="|") AS ?kinds)
  (GROUP_CONCAT(DISTINCT ?opName; separator="|") AS ?operators)
  (GROUP_CONCAT(DISTINCT ?opLabel; separator="|") AS ?operatorLabels)
  (GROUP_CONCAT(DISTINCT ?mfrLabel; separator="|") AS ?manufacturers)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?entry), "/", STR(?ep)); separator="|") AS ?entries)
  (GROUP_CONCAT(DISTINCT CONCAT(STR(?retired), "/", STR(?rp)); separator="|") AS ?retirements)
  (MAX(?speed) AS ?maxSpeed)
WHERE {
  ?v wdt:P31 wd:Q811704 ; wikibase:sitelinks ?sitelinks ; wdt:P279 ?kind .
  VALUES ?kind { ${Object.keys(VEHICLE_KINDS).map((q) => `wd:${q}`).join(' ')} }
  { ?v wdt:P495 wd:Q17 } UNION { ?v wdt:P137/wdt:P17 wd:Q17 }
  ?v rdfs:label ?label . FILTER(LANG(?label) = "ja")
  ?wpPage schema:about ?v ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?wpTitle .
  FILTER(?sitelinks >= ${VEHICLE_MIN_SITELINKS} || CONTAINS(?label, "新幹線"))
  OPTIONAL { ?v wdt:P18 ?img }
  OPTIONAL {
    ?v wdt:P137 ?op .
    { ?op rdfs:label ?opName } UNION { ?op skos:altLabel ?opName }
    FILTER(LANG(?opName) = "ja")
    ?op rdfs:label ?opLabel . FILTER(LANG(?opLabel) = "ja")
  }
  OPTIONAL { ?v wdt:P176 ?mfr . ?mfr rdfs:label ?mfrLabel . FILTER(LANG(?mfrLabel) = "ja") }
  OPTIONAL { ?v p:P729/psv:P729 [ wikibase:timeValue ?entry ; wikibase:timePrecision ?ep ] }
  OPTIONAL { ?v p:P730/psv:P730 [ wikibase:timeValue ?retired ; wikibase:timePrecision ?rp ] }
  OPTIONAL { ?v p:P2052/psv:P2052 [ wikibase:quantityAmount ?speed ; wikibase:quantityUnit wd:Q180154 ] }
}
GROUP BY ?v ?label ?sitelinks`

type Binding = Record<string, { value: string } | undefined>

async function sparql(query: string, attempt = 1): Promise<Binding[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ query }),
  })
  // 混雑による一時的な失敗は、間を空けて数回まで再試行する
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 5000 * attempt))
    return sparql(query, attempt + 1)
  }
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
  const details = new Map<string, { opened: string; gauges: string[]; elecs: string[]; wp: string; image: string }>()
  for (let i = 0; i < qids.length; i += 200) {
    for (const b of await sparql(lineDetailsQuery(qids.slice(i, i + 200)))) {
      details.set(qidOf(b.l!.value), {
        opened: earliestDate(split(b.opens)),
        gauges: [...new Set(split(b.gauges).map((g) => String(Math.round(Number(g)))))],
        elecs: [...new Set(split(b.elecs).map(shortElectrification))],
        wp: b.wp?.value ?? '',
        image: commonsFileName(b.image?.value ?? ''),
      })
    }
  }

  const rows = [
    csvRow(['company', 'line', 'qid', 'label', 'color', 'opened', 'gauge_mm', 'electrification', 'wp', 'image', 'match', 'source']),
  ]
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
    const d = details.get(m.qid) ?? { opened: '', gauges: [], elecs: [], wp: '', image: '' }
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
        d.wp,
        d.image,
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
  return matches.flatMap((m) => (m.match ? [{ company: m.line.company, qid: m.match.qid }] : []))
}

async function syncStations(stations: Station[], today: string) {
  type WdStation = {
    qid: string
    name: string
    coord: Coord
    kana: string
    en: string
    opened: string
    wp: string
    image: string
  }
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
      wp: '',
      image: '',
    }
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name)!.push(st)
  }

  const matches = [...stations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({
      s,
      nearest: (byName.get(s.name) ?? [])
        .map((w) => ({ w, d: haversineKm([s.lon, s.lat], w.coord) }))
        .filter((x) => x.d <= STATION_MATCH_KM)
        .sort((a, b) => a.d - b.d)[0],
    }))
  const qids = [...new Set(matches.flatMap((m) => (m.nearest ? [m.nearest.w.qid] : [])))]
  const media = new Map<string, { wp: string; image: string }>()
  for (let i = 0; i < qids.length; i += 400) {
    for (const b of await sparql(mediaQuery(qids.slice(i, i + 400)))) {
      media.set(qidOf(b.x!.value), { wp: b.wp?.value ?? '', image: commonsFileName(b.image?.value ?? '') })
    }
  }

  const rows = [csvRow(['station_id', 'name', 'qid', 'kana', 'romaji', 'opened', 'wp', 'image', 'distance_m', 'source'])]
  const counts = { kana: 0, romaji: 0, opened: 0, wp: 0, image: 0 }
  for (const { s, nearest } of matches) {
    if (!nearest) continue
    const { d } = nearest
    const w = { ...nearest.w, ...media.get(nearest.w.qid) }
    if (w.wp) counts.wp++
    if (w.image) counts.image++
    const romaji = w.en ? romajiFromEnglish(w.en) : ''
    if (w.kana) counts.kana++
    if (romaji) counts.romaji++
    if (w.opened) counts.opened++
    rows.push(
      csvRow([
        s.id,
        s.name,
        w.qid,
        w.kana,
        romaji,
        w.opened,
        w.wp,
        w.image,
        Math.round(d * 1000),
        `Wikidata ${w.qid}（${today}取得）`,
      ]),
    )
  }
  writeFileSync(join(OVERRIDES, 'wikidata_stations.csv'), rows.join('\n') + '\n')
  console.log(
    `stations: matched=${rows.length - 1}/${stations.length} kana=${counts.kana} romaji=${counts.romaji} ` +
      `opened=${counts.opened} wp=${counts.wp} image=${counts.image}`,
  )
}

/**
 * 事業者（国土数値情報の運営会社名）ごとに Wikidata 項目を決める。
 * 照合できた路線の運営者のうち、名前が運営会社名と一致するものを多数決で選ぶ。
 */
async function syncCompanies(matched: { company: string; qid: string }[], today: string) {
  const lineQids = [...new Set(matched.map((m) => m.qid))]
  const operatorsOfLine = new Map<string, { op: string; names: string[] }[]>()
  for (let i = 0; i < lineQids.length; i += 200) {
    for (const b of await sparql(lineOperatorsQuery(lineQids.slice(i, i + 200)))) {
      const l = qidOf(b.l!.value)
      if (!operatorsOfLine.has(l)) operatorsOfLine.set(l, [])
      operatorsOfLine.get(l)!.push({ op: qidOf(b.op!.value), names: split(b.names) })
    }
  }
  const votes = new Map<string, Map<string, number>>()
  for (const { company, qid } of matched) {
    for (const { op, names } of operatorsOfLine.get(qid) ?? []) {
      if (!names.some((n) => n.length >= 2 && sameOperator(company, n))) continue
      if (!votes.has(company)) votes.set(company, new Map())
      const v = votes.get(company)!
      v.set(op, (v.get(op) ?? 0) + 1)
    }
  }
  const chosen = new Map([...votes].map(([company, v]) => [company, [...v].sort((a, b) => b[1] - a[1])[0][0]]))
  const qids = [...new Set(chosen.values())]
  const details = new Map<string, Binding>()
  for (let i = 0; i < qids.length; i += 100) {
    for (const b of await sparql(companyDetailsQuery(qids.slice(i, i + 100)))) details.set(qidOf(b.c!.value), b)
  }
  const rows = [csvRow(['company', 'qid', 'label', 'wp', 'image', 'inception', 'headquarters', 'website', 'source'])]
  for (const [company, qid] of [...chosen].sort(([a], [b]) => a.localeCompare(b, 'ja'))) {
    const b = details.get(qid)
    rows.push(
      csvRow([
        company,
        qid,
        b?.name?.value ?? '',
        b?.wp?.value ?? '',
        commonsFileName(b?.image?.value ?? ''),
        earliestDate(split(b?.inceptions)),
        b?.hq?.value ?? '',
        pickWebsite(
          (b?.websites?.value ?? '')
            .split(' ;; ')
            .filter(Boolean)
            .map((line) => {
              const [rank, url] = line.split(' ')
              return { url, preferred: rank.endsWith('PreferredRank') }
            }),
        ),
        `Wikidata ${qid}（${today}取得）`,
      ]),
    )
  }
  writeFileSync(join(OVERRIDES, 'wikidata_companies.csv'), rows.join('\n') + '\n')
  console.log(`companies: matched=${chosen.size}/${new Set(matched.map((m) => m.company)).size}`)
}

/** 図鑑に載せる車両形式。運用事業者は国土数値情報の運営会社名に結び付ける */
async function syncVehicles(companies: string[], today: string) {
  const rows = [
    csvRow([
      'qid',
      'name',
      'kind',
      'companies',
      'operators',
      'manufacturers',
      'entry',
      'retired',
      'max_speed_kmh',
      'wp',
      'image',
      'sitelinks',
      'source',
    ]),
  ]
  const kindOrder = ['高速列車', '地下鉄車両', '路面電車', 'モノレール', '気動車', '客車', '電車']
  const bindings = (await sparql(VEHICLES_QUERY)).sort((a, b) => qidOf(a.v!.value).localeCompare(qidOf(b.v!.value)))
  for (const b of bindings) {
    const qid = qidOf(b.v!.value)
    const name = b.label!.value
    const kinds = split(b.kinds).map((k) => VEHICLE_KINDS[qidOf(k)])
    const kind = name.includes('新幹線') ? '新幹線' : (kindOrder.find((k) => kinds.includes(k)) ?? '電車')
    const opNames = split(b.operators)
    const matched = companies.filter((c) => opNames.some((n) => isOperatorOf(c, n)))
    const speed = b.maxSpeed?.value ? String(Math.round(Number(b.maxSpeed.value))) : ''
    rows.push(
      csvRow([
        qid,
        name,
        kind === '高速列車' ? '新幹線' : kind,
        matched.join('|'),
        split(b.operatorLabels).join('|'),
        split(b.manufacturers).join('|'),
        earliestDate(split(b.entries)),
        earliestDate(split(b.retirements)),
        speed,
        b.wp?.value ?? '',
        commonsFileName(b.image?.value ?? ''),
        b.sitelinks?.value ?? '',
        `Wikidata ${qid}（${today}取得）`,
      ]),
    )
  }
  writeFileSync(join(OVERRIDES, 'wikidata_vehicles.csv'), rows.join('\n') + '\n')
  console.log(`vehicles: ${rows.length - 1}`)
}

async function main() {
  // 一部だけ取り直したいときは対象を並べる（例: npm run data:wikidata -- companies vehicles）
  const only = process.argv.slice(2)
  const want = (part: string) => only.length === 0 || only.includes(part)
  const lines: Line[] = JSON.parse(readFileSync(join(ROOT, 'public/data/lines.json'), 'utf8'))
  const stations: Station[] = JSON.parse(readFileSync(join(ROOT, 'public/data/stations.json'), 'utf8'))
  const today = new Date().toISOString().slice(0, 10)
  // 事業者の照合には路線の照合結果を使う
  const matched = want('lines') || want('companies') ? await syncLines(lines, today) : []
  if (want('stations')) await syncStations(stations, today)
  if (want('companies')) await syncCompanies(matched, today)
  if (want('vehicles')) await syncVehicles([...new Set(lines.map((l) => l.company))], today)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
