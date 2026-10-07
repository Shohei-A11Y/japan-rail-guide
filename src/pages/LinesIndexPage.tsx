import { useMemo, useState } from 'react'
import { LineBadge, Page } from '../components/parts'
import { COMPANY_TYPE_LABELS } from '../codes'
import type { RailData } from '../data'
import type { CompanyType, Line } from '../types'

const TYPE_ORDER: CompanyType[] = [1, 2, 4, 3, 5]

export function LinesIndexPage({ data }: { data: RailData }) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const q = query.trim()
    const match = (l: Line) => !q || l.displayName.includes(q) || l.name.includes(q) || l.company.includes(q)
    const byType = new Map<CompanyType, Map<string, Line[]>>()
    for (const l of data.lines.values()) {
      if (!match(l)) continue
      const type = l.shinkansen ? 1 : l.companyType
      if (!byType.has(type)) byType.set(type, new Map())
      const companies = byType.get(type)!
      if (!companies.has(l.company)) companies.set(l.company, [])
      companies.get(l.company)!.push(l)
    }
    return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
      type: t,
      companies: [...byType.get(t)!]
        .sort(([a], [b]) => a.localeCompare(b, 'ja'))
        .map(([company, lines]) => ({
          company,
          lines: lines.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja')),
        })),
    }))
  }, [data, query])

  return (
    <Page>
      <h1>路線一覧</h1>
      <input
        className="search"
        type="search"
        placeholder="路線名・事業者名で絞り込み"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups.length === 0 && <p className="muted">該当する路線がありません。</p>}
      {groups.map((g) => (
        <section key={g.type}>
          <h2>{COMPANY_TYPE_LABELS[g.type]}</h2>
          {g.companies.map((c) => (
            <div key={c.company} className="company">
              <h3>{c.company}</h3>
              <div className="badge-row wrap">
                {c.lines.map((l) => (
                  <LineBadge key={l.id} line={l} small />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </Page>
  )
}
