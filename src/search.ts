import type { RailData } from './data'
import type { Line, Station } from './types'

/**
 * 検索用に文字列をそろえる。全角半角・大文字小文字・カタカナとひらがな・長音記号の付いたローマ字の違いを吸収する。
 * ローマ字は「nihombashi」と「nihonbashi」のようなヘボン式の揺れも同じにする。
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/m(?=[bmp])/g, 'n')
    .replace(/[\s・\-‐ー–—'’.()（）]/g, '')
    .replace(/駅$/, '')
}

export interface SearchResult {
  stations: Station[]
  lines: Line[]
  companies: { name: string; lines: Line[] }[]
}

/** 一致の強さ: 完全一致 3 > 前方一致 2 > 部分一致 1 > 不一致 0 */
function score(q: string, fields: (string | undefined)[]): number {
  let best = 0
  for (const f of fields) {
    if (!f) continue
    const n = normalize(f)
    if (n === q) return 3
    if (n.startsWith(q)) best = Math.max(best, 2)
    else if (n.includes(q)) best = Math.max(best, 1)
  }
  return best
}

export function search(data: RailData, query: string, limit = 50): SearchResult {
  const q = normalize(query)
  if (!q) return { stations: [], lines: [], companies: [] }
  const stations = [...data.stations.values()]
    .map((s) => ({ s, sc: score(q, [s.name, s.kana, s.romaji]) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc || (b.s.passengers ?? -1) - (a.s.passengers ?? -1))
    .slice(0, limit)
    .map((x) => x.s)
  const lines = [...data.lines.values()]
    .map((l) => ({ l, sc: score(q, [l.displayName, l.name]) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc || b.l.stations.length - a.l.stations.length)
    .slice(0, limit)
    .map((x) => x.l)
  const byCompany = new Map<string, Line[]>()
  for (const l of data.lines.values()) {
    if (!byCompany.has(l.company)) byCompany.set(l.company, [])
    byCompany.get(l.company)!.push(l)
  }
  const companies = [...byCompany]
    .map(([name, ls]) => ({ name, lines: ls, sc: score(q, [name]) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc || b.lines.length - a.lines.length)
    .slice(0, limit)
    .map(({ name, lines: ls }) => ({ name, lines: ls }))
  return { stations, lines, companies }
}
