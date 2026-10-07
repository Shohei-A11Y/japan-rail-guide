/**
 * Wikidata（CC0）から、国土数値情報の各路線に対応する項目を探し、
 * 表示名と路線カラーの候補を data/overrides/wikidata_lines.csv に書き出す。
 *   npm run data:wikidata
 * 結果は人が差分を確認してからコミットする。手で直したい値は line_aliases.csv / line_colors.csv に書く（そちらが優先）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Line } from '../src/types'
import { type WdLine, matchLine, singleColor } from './lib/match'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data/overrides/wikidata_lines.csv')
const ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'japan-rail-guide/0.1 (https://github.com/Shohei-A11Y/japan-rail-guide)'

// 日本の鉄道路線（廃線・未成線・貨物線は除く）
const QUERY = `
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

type Binding = Record<string, { value: string } | undefined>

async function fetchItems(): Promise<WdLine[]> {
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(QUERY)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`)
  const json = (await res.json()) as { results: { bindings: Binding[] } }
  const split = (v?: { value: string }) => (v?.value ? v.value.split('|').filter(Boolean) : [])
  return json.results.bindings.map((b) => ({
    qid: b.l!.value.replace(/^.*\//, ''),
    label: b.label!.value,
    aliases: split(b.alts),
    operators: split(b.ops),
    colors: split(b.colors),
  }))
}

const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

async function main() {
  const lines: Line[] = JSON.parse(readFileSync(join(ROOT, 'public/data/lines.json'), 'utf8'))
  const items = await fetchItems()
  const byQid = new Map(items.map((it) => [it.qid, it]))
  const today = new Date().toISOString().slice(0, 10)

  const rows: string[] = ['company,line,qid,label,color,match,source']
  const unmatched: string[] = []
  const counts = { label: 0, alias: 0, suffix: 0, color: 0 }
  for (const l of [...lines].sort((a, b) => `${a.company}|${a.name}`.localeCompare(`${b.company}|${b.name}`, 'ja'))) {
    const m = matchLine(l.company, l.name, items)
    if (!m) {
      unmatched.push(`${l.company} ${l.name}`)
      continue
    }
    counts[m.how]++
    const color = singleColor(byQid.get(m.qid)!.colors) ?? ''
    if (color) counts.color++
    rows.push(
      [l.company, l.name, m.qid, m.label, color, m.how, `Wikidata ${m.qid}（${today}取得）`].map(csvField).join(','),
    )
  }
  writeFileSync(OUT, rows.join('\n') + '\n')
  console.log(
    `items=${items.length} matched=${rows.length - 1}/${lines.length} ` +
      `(label=${counts.label} alias=${counts.alias} suffix=${counts.suffix}) color=${counts.color}`,
  )
  console.log(`unmatched (${unmatched.length}):\n  ` + unmatched.join('\n  '))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
