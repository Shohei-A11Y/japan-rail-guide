import { useMemo } from 'react'
import { StationList } from '../components/lists'
import { LineBadge, Page } from '../components/parts'
import { RailMap } from '../components/RailMap'
import { PREFECTURES } from '../codes'
import type { RailData } from '../data'
import { formatNumber } from '../format'
import { NotFound } from './NotFound'

export function PrefPage({ data, name }: { data: RailData; name: string }) {
  const info = useMemo(() => {
    const stations = [...data.stations.values()].filter((s) => s.pref === name)
    if (stations.length === 0) return null
    const inPref = new Set(stations.map((s) => s.id))
    // 県内の駅が多い路線から並べる
    const lines = [...data.lines.values()]
      .filter((l) => l.prefs.includes(name))
      .map((l) => ({ l, n: l.stations.filter((id) => inPref.has(id)).length }))
      .sort((a, b) => b.n - a.n)
      .map((x) => x.l)
    const lons = stations.map((s) => s.lon)
    const lats = stations.map((s) => s.lat)
    const bounds: [number, number, number, number] = [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ]
    const byCity = new Map<string, typeof stations>()
    for (const s of [...stations].sort((a, b) => (b.passengers ?? -1) - (a.passengers ?? -1))) {
      const c = s.city ?? '（不明）'
      if (!byCity.has(c)) byCity.set(c, [])
      byCity.get(c)!.push(s)
    }
    const top = stations.filter((s) => s.passengers != null).sort((a, b) => b.passengers! - a.passengers!)
    return { stations, lines, bounds, byCity, top: top.slice(0, 10) }
  }, [data, name])

  if (!PREFECTURES.includes(name) || !info) return <NotFound />
  const companies = new Set(info.lines.map((l) => l.company))

  return (
    <Page>
      <h1>{name}の鉄道</h1>
      <dl className="facts">
        <div>
          <dt>路線</dt>
          <dd>{info.lines.length} 路線</dd>
        </div>
        <div>
          <dt>駅</dt>
          <dd>{formatNumber(info.stations.length)} 駅</dd>
        </div>
        <div>
          <dt>事業者</dt>
          <dd>{companies.size} 社</dd>
        </div>
      </dl>
      <RailMap data={data} bounds={info.bounds} className="rail-map mini" />

      <h2>通っている路線</h2>
      <div className="badge-row wrap">
        {info.lines.map((l) => (
          <LineBadge key={l.id} line={l} small />
        ))}
      </div>

      {info.top.length > 0 && (
        <>
          <h2>乗降客数の多い駅</h2>
          <StationList data={data} stations={info.top} ordered />
        </>
      )}

      <h2>市区町村別の駅</h2>
      {[...info.byCity].map(([city, stations]) => (
        <details key={city} className="city">
          <summary>
            {city}（{stations.length}駅）
          </summary>
          <StationList data={data} stations={stations} />
        </details>
      ))}
    </Page>
  )
}
