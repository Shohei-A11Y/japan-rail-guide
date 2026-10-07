import { type ReactNode, useMemo } from 'react'
import { StationList } from '../components/lists'
import { LineBadge, Notice, Page } from '../components/parts'
import type { RailData } from '../data'
import { formatKm, formatNumber } from '../format'
import { companyStats, dateKey, formatDate, nameLength, rank } from '../rankings'
import { href } from '../router'
import type { Line } from '../types'

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="ranking">
      <h2>{title}</h2>
      {note && <p className="muted small">{note}</p>}
      {children}
    </section>
  )
}

function LineRanks({ lines, value }: { lines: Line[]; value: (l: Line) => string }) {
  return (
    <ol className="item-list ranked">
      {lines.map((l) => (
        <li key={l.id}>
          <div className="item-main">
            <LineBadge line={l} small />
            <span className="item-sub">{l.company}</span>
          </div>
          <span className="item-value">{value(l)}</span>
        </li>
      ))}
    </ol>
  )
}

export function RankingsPage({ data }: { data: RailData }) {
  const r = useMemo(() => {
    const stations = [...data.stations.values()]
    // 通称区間（ミニ新幹線）は元の路線と重なるので路線の比較からは除く
    const lines = [...data.lines.values()].filter((l) => !l.via)
    const companies = companyStats(data)
    return {
      busiest: rank(stations, (s) => s.passengers, 20),
      quietest: rank(stations, (s) => (s.passengers ? s.passengers : null), 10, 'asc'),
      mostLines: rank(stations, (s) => s.lines.length, 10),
      longest: rank(lines, (l) => l.lengthKm, 10),
      shortest: rank(lines, (l) => l.lengthKm, 10, 'asc'),
      mostStations: rank(lines, (l) => l.stations.length, 10),
      oldestLines: rank(lines, (l) => dateKey(l.opened), 10, 'asc'),
      oldestStations: rank(stations, (s) => dateKey(s.opened), 10, 'asc'),
      newestStations: rank(stations, (s) => dateKey(s.opened), 10),
      north: rank(stations, (s) => s.lat, 1),
      south: rank(stations, (s) => s.lat, 1, 'asc'),
      east: rank(stations, (s) => s.lon, 1),
      west: rank(stations, (s) => s.lon, 1, 'asc'),
      longNames: rank(stations, nameLength, 10),
      oneChar: stations.filter((s) => nameLength(s) === 1).sort((a, b) => a.name.localeCompare(b.name, 'ja')),
      companiesByLength: rank(companies, (c) => c.lengthKm, 10),
      companiesByStations: rank(companies, (c) => c.stations, 10),
    }
  }, [data])
  const year = data.meta.passengerYear

  return (
    <Page>
      <h1>ランキング・トリビア</h1>
      <Notice>
        データから自動で集計しています。延長は地図上の線形から計算した値（営業キロではありません）、開業日はWikidataに登録がある路線・駅だけが対象です。
      </Notice>

      <Section title="乗降客数の多い駅" note={`${year}年度・1日あたり。複数の事業者が乗り入れる駅は各社の合計です。`}>
        <StationList data={data} stations={r.busiest} ordered />
      </Section>
      <Section title="乗降客数の少ない駅" note={`${year}年度・1日あたり。値が公表されている駅のうち少ない順。`}>
        <StationList data={data} stations={r.quietest} ordered />
      </Section>
      <Section title="乗り入れ路線の多い駅">
        <StationList data={data} stations={r.mostLines} ordered value={(s) => `${s.lines.length}路線`} />
      </Section>

      <Section title="長い路線" note="地図上の延長。">
        <LineRanks lines={r.longest} value={(l) => formatKm(l.lengthKm)} />
      </Section>
      <Section title="短い路線" note="地図上の延長。ケーブルカーなどを含みます。">
        <LineRanks lines={r.shortest} value={(l) => formatKm(l.lengthKm)} />
      </Section>
      <Section title="駅の多い路線">
        <LineRanks lines={r.mostStations} value={(l) => `${l.stations.length}駅`} />
      </Section>
      <Section
        title="開業の古い路線"
        note="Wikidataの開業日。前身の鉄道や最初の区間の開業日が登録されている路線があり、現在の路線名になった年とは限りません（例: 根岸線）。"
      >
        <LineRanks lines={r.oldestLines} value={(l) => formatDate(l.opened)} />
      </Section>

      <Section title="開業の古い駅" note="Wikidataの開業日。">
        <StationList data={data} stations={r.oldestStations} ordered value={(s) => formatDate(s.opened)} />
      </Section>
      <Section title="新しい駅" note="Wikidataの開業日。">
        <StationList data={data} stations={r.newestStations} ordered value={(s) => formatDate(s.opened)} />
      </Section>

      <Section title="東西南北の端の駅" note="駅の代表点の緯度経度で比較。">
        <StationList data={data} stations={r.north} value={() => '最北端'} />
        <StationList data={data} stations={r.south} value={() => '最南端'} />
        <StationList data={data} stations={r.east} value={() => '最東端'} />
        <StationList data={data} stations={r.west} value={() => '最西端'} />
      </Section>

      <Section title="名前の長い駅">
        <StationList data={data} stations={r.longNames} ordered value={(s) => `${nameLength(s)}文字`} />
      </Section>
      <Section title="1文字の駅" note={`${r.oneChar.length}駅`}>
        <div className="chip-row">
          {r.oneChar.map((s) => (
            <a key={s.id} className="chip" href={href.station(s.id)}>
              {s.name}
              <span className="muted small">{s.pref}</span>
            </a>
          ))}
        </div>
      </Section>

      <Section title="事業者: 路線の延長が長い" note="地図上の延長の合計。">
        <ol className="item-list ranked">
          {r.companiesByLength.map((c) => (
            <li key={c.name}>
              <a className="item-name" href={href.search(c.name)}>
                {c.name}
              </a>
              <span className="item-value">{formatKm(c.lengthKm)}</span>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="事業者: 駅が多い">
        <ol className="item-list ranked">
          {r.companiesByStations.map((c) => (
            <li key={c.name}>
              <a className="item-name" href={href.search(c.name)}>
                {c.name}
              </a>
              <span className="item-value">{formatNumber(c.stations)}駅</span>
            </li>
          ))}
        </ol>
      </Section>
    </Page>
  )
}
