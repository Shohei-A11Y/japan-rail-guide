import { useMemo, useState } from 'react'
import { LineBadge, Page } from '../components/parts'
import { COMPANY_TYPE_LABELS, PREFECTURES } from '../codes'
import type { RailData } from '../data'
import { dateKey } from '../rankings'
import { href } from '../router'
import { normalize } from '../search'
import type { CompanyType, Line } from '../types'

const TYPE_ORDER: CompanyType[] = [1, 2, 4, 3, 5]

// 開業年の区切り（Wikidataの開業日による）
const ERAS: { label: string; from: number; to: number }[] = [
  { label: '1800年代', from: 0, to: 1899 },
  { label: '1900〜1945年', from: 1900, to: 1945 },
  { label: '1946〜1999年', from: 1946, to: 1999 },
  { label: '2000年以降', from: 2000, to: 9999 },
]

type Filters = { text: string; pref: string; gauge: string; elec: string; era: string; type: string }
const EMPTY: Filters = { text: '', pref: '', gauge: '', elec: '', era: '', type: '' }

function electrificationKind(l: Line): string[] {
  return (l.electrification ?? []).map((e) => (e.startsWith('直流') ? '直流' : e.startsWith('交流') || e.startsWith('三相') ? '交流' : e === '非電化' ? '非電化' : 'その他'))
}

export function LinesIndexPage({ data }: { data: RailData }) {
  const [f, setF] = useState<Filters>(EMPTY)
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const gauges = useMemo(
    () => [...new Set([...data.lines.values()].flatMap((l) => l.gaugeMm ?? []))].sort((a, b) => a - b),
    [data],
  )

  const { groups, count } = useMemo(() => {
    const q = normalize(f.text)
    const era = ERAS.find((e) => e.label === f.era)
    const match = (l: Line) => {
      if (q && ![l.displayName, l.name, l.company].some((t) => normalize(t).includes(q))) return false
      if (f.pref && !l.prefs.includes(f.pref)) return false
      if (f.gauge && !(l.gaugeMm ?? []).includes(Number(f.gauge))) return false
      if (f.elec && !electrificationKind(l).includes(f.elec)) return false
      if (f.type && String(l.shinkansen ? 1 : l.companyType) !== f.type) return false
      if (era) {
        const y = Math.floor((dateKey(l.opened) ?? -1) / 10000)
        if (y < era.from || y > era.to) return false
      }
      return true
    }
    const byType = new Map<CompanyType, Map<string, Line[]>>()
    let count = 0
    for (const l of data.lines.values()) {
      if (!match(l)) continue
      count++
      const type = l.shinkansen ? 1 : l.companyType
      if (!byType.has(type)) byType.set(type, new Map())
      const companies = byType.get(type)!
      if (!companies.has(l.company)) companies.set(l.company, [])
      companies.get(l.company)!.push(l)
    }
    const groups = TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
      type: t,
      companies: [...byType.get(t)!]
        .sort(([a], [b]) => a.localeCompare(b, 'ja'))
        .map(([company, lines]) => ({
          company,
          lines: lines.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja')),
        })),
    }))
    return { groups, count }
  }, [data, f])

  const filtered = JSON.stringify(f) !== JSON.stringify(EMPTY)

  return (
    <Page>
      <h1>路線一覧</h1>
      <input
        className="search"
        type="search"
        placeholder="路線名・事業者名で絞り込み"
        value={f.text}
        onChange={set('text')}
      />
      <div className="filters">
        <label>
          都道府県
          <select value={f.pref} onChange={set('pref')}>
            <option value="">すべて</option>
            {PREFECTURES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          種別
          <select value={f.type} onChange={set('type')}>
            <option value="">すべて</option>
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {COMPANY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          開業
          <select value={f.era} onChange={set('era')}>
            <option value="">すべて</option>
            {ERAS.map((e) => (
              <option key={e.label}>{e.label}</option>
            ))}
          </select>
        </label>
        <label>
          軌間
          <select value={f.gauge} onChange={set('gauge')}>
            <option value="">すべて</option>
            {gauges.map((g) => (
              <option key={g} value={g}>
                {g}mm
              </option>
            ))}
          </select>
        </label>
        <label>
          電化
          <select value={f.elec} onChange={set('elec')}>
            <option value="">すべて</option>
            <option>直流</option>
            <option>交流</option>
            <option>非電化</option>
          </select>
        </label>
      </div>
      <p className="muted small">
        {count}路線
        {filtered && (
          <>
            {' '}
            <button className="link-button" onClick={() => setF(EMPTY)}>
              条件をクリア
            </button>
          </>
        )}
        {(f.era || f.gauge || f.elec) && '（開業・軌間・電化はWikidataに登録がある路線だけが対象）'}
      </p>
      {groups.length === 0 && <p className="muted">該当する路線がありません。</p>}
      {groups.map((g) => (
        <section key={g.type}>
          <h2>{COMPANY_TYPE_LABELS[g.type]}</h2>
          {g.companies.map((c) => (
            <div key={c.company} className="company">
              <h3>
                <a href={href.company(c.company)}>{c.company}</a>
              </h3>
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
