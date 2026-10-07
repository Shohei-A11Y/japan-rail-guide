import { useMemo, useState } from 'react'
import { Page } from '../components/parts'
import type { RailData } from '../data'
import { href } from '../router'
import { normalize } from '../search'
import type { Vehicle } from '../types'

export const VEHICLE_KIND_ORDER = ['新幹線', '電車', '気動車', '地下鉄車両', '路面電車', 'モノレール', '客車']

const year = (date?: string) => (date ? `${date.slice(0, 4)}年` : '')

export function VehiclesPage({ data }: { data: RailData }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState('')
  const [company, setCompany] = useState('')

  const companies = useMemo(
    () => [...new Set([...data.vehicles.values()].flatMap((v) => v.companies))].sort((a, b) => a.localeCompare(b, 'ja')),
    [data],
  )
  const groups = useMemo(() => {
    const q = normalize(text)
    const list = [...data.vehicles.values()].filter(
      (v) =>
        (!q || normalize(v.name).includes(q) || v.operators.some((o) => normalize(o).includes(q))) &&
        (!kind || v.kind === kind) &&
        (!company || v.companies.includes(company)),
    )
    return VEHICLE_KIND_ORDER.map((k) => ({
      kind: k,
      vehicles: list.filter((v) => v.kind === k).sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    })).filter((g) => g.vehicles.length > 0)
  }, [data, text, kind, company])
  const count = groups.reduce((n, g) => n + g.vehicles.length, 0)

  return (
    <Page>
      <h1>車両図鑑</h1>
      <p className="muted small">
        Wikidataに登録された日本の旅客車両の形式のうち、3言語以上のWikipediaに記事がある形式と新幹線の全形式を載せています。
      </p>
      <input
        className="search"
        type="search"
        placeholder="形式名・事業者名で絞り込み"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="filters">
        <label>
          種類
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">すべて</option>
            {VEHICLE_KIND_ORDER.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          事業者
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">すべて</option>
            {companies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">{count}形式</p>
      {groups.map((g) => (
        <section key={g.kind}>
          <h2>
            {g.kind}（{g.vehicles.length}）
          </h2>
          <VehicleList vehicles={g.vehicles} />
        </section>
      ))}
    </Page>
  )
}

export function VehicleList({ vehicles }: { vehicles: Vehicle[] }) {
  return (
    <ul className="item-list">
      {vehicles.map((v) => (
        <li key={v.id}>
          <div className="item-main">
            <a className="item-name" href={href.vehicle(v.id)}>
              {v.name}
            </a>
            <span className="item-sub">{(v.companies.length ? v.companies : v.operators).slice(0, 3).join('・')}</span>
          </div>
          <span className="item-value">
            {v.entry && `${year(v.entry)}〜`}
            {v.retired && `${year(v.retired)}引退`}
          </span>
        </li>
      ))}
    </ul>
  )
}
