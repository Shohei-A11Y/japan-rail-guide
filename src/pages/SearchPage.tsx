import { useMemo, useState } from 'react'
import { StationList } from '../components/lists'
import { LineBadge, Page } from '../components/parts'
import type { RailData } from '../data'
import { href } from '../router'
import { search } from '../search'
import { VehicleList } from './VehiclesPage'

export function SearchPage({ data, initial }: { data: RailData; initial: string }) {
  const [query, setQuery] = useState(initial)
  const result = useMemo(() => search(data, query), [data, query])
  const empty =
    query.trim() !== '' &&
    !result.stations.length &&
    !result.lines.length &&
    !result.companies.length &&
    !result.vehicles.length

  const onChange = (q: string) => {
    setQuery(q)
    // 共有できるよう URL にも反映する（履歴は増やさない）
    window.history.replaceState(null, '', href.search(q))
  }

  return (
    <Page>
      <h1>検索</h1>
      <input
        className="search"
        type="search"
        autoFocus
        placeholder="駅名・路線名・事業者名・車両形式（ひらがな・ローマ字も可）"
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />
      {empty && <p className="muted">見つかりませんでした。</p>}
      {result.lines.length > 0 && (
        <>
          <h2>路線（{result.lines.length}）</h2>
          <div className="badge-row wrap">
            {result.lines.map((l) => (
              <LineBadge key={l.id} line={l} small />
            ))}
          </div>
        </>
      )}
      {result.companies.length > 0 && (
        <>
          <h2>事業者（{result.companies.length}）</h2>
          {result.companies.map((c) => (
            <div key={c.name} className="company">
              <h3>
                <a href={href.company(c.name)}>{c.name}</a>
              </h3>
              <div className="badge-row wrap">
                {c.lines.map((l) => (
                  <LineBadge key={l.id} line={l} small />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      {result.stations.length > 0 && (
        <>
          <h2>駅（{result.stations.length}{result.stations.length >= 50 ? '件まで表示' : ''}）</h2>
          <StationList data={data} stations={result.stations} />
        </>
      )}
      {result.vehicles.length > 0 && (
        <>
          <h2>車両形式（{result.vehicles.length}）</h2>
          <VehicleList vehicles={result.vehicles} />
        </>
      )}
      <p className="muted small">読み仮名・ローマ字は Wikidata に登録がある駅だけ検索できます。</p>
    </Page>
  )
}
