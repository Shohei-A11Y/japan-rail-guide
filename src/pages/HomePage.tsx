import { type FormEvent, useMemo, useState } from 'react'
import { LineBadge } from '../components/parts'
import { type MapSelection, RailMap } from '../components/RailMap'
import { COMPANY_TYPE_LABELS } from '../codes'
import type { RailData } from '../data'
import { formatKm, formatNumber } from '../format'
import { href } from '../router'
import type { BBox } from '../types'

/** この範囲の一覧を出せる最小のズーム（広すぎると数千駅になるため） */
const LIST_MIN_ZOOM = 9

export function HomePage({ data }: { data: RailData }) {
  const [selected, setSelected] = useState<MapSelection | null>(null)
  const [view, setView] = useState<{ bounds: BBox; zoom: number } | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { counts } = data.meta

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    window.location.hash = href.search(query.trim())
  }
  const random = () => {
    const stations = [...data.stations.values()]
    const s = stations[Math.floor(Math.random() * stations.length)]
    window.location.hash = href.station(s.id)
  }

  return (
    <div className="home">
      <RailMap
        data={data}
        focus={selected ?? undefined}
        onSelect={(s) => {
          setSelected(s)
          setListOpen(false)
        }}
        onViewChange={(bounds, zoom) => setView({ bounds, zoom })}
        className="rail-map full"
      />
      <div className="home-overlay">
        <div className="home-title">
          <h1>日本鉄道ガイド</h1>
          <p>
            全国 {formatNumber(counts.lines)} 路線・{formatNumber(counts.stations)} 駅を眺めよう
          </p>
          <form className="home-search" onSubmit={onSearch} role="search">
            <input
              type="search"
              placeholder="駅名・路線名で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="駅名・路線名で検索"
            />
          </form>
        </div>
        <nav className="home-links">
          <a href={href.lines()}>路線</a>
          <a href={href.prefs()}>都道府県</a>
          <a href={href.vehicles()}>車両</a>
          <a href={href.favorites()} aria-label="お気に入り" title="お気に入り">
            ★
          </a>
          <a href={href.rankings()}>ランキング</a>
          <button onClick={random}>ランダム</button>
        </nav>
      </div>
      {selected ? (
        <SelectionCard data={data} selection={selected} onClose={() => setSelected(null)} />
      ) : listOpen && view ? (
        <AreaList data={data} bounds={view.bounds} onClose={() => setListOpen(false)} />
      ) : view && view.zoom >= LIST_MIN_ZOOM ? (
        <button className="home-hint as-button" onClick={() => setListOpen(true)}>
          この範囲の駅・路線を一覧
        </button>
      ) : (
        <p className="home-hint">路線や駅をタップすると詳しい情報が出ます</p>
      )}
    </div>
  )
}

function AreaList({ data, bounds, onClose }: { data: RailData; bounds: BBox; onClose: () => void }) {
  const { stations, lines } = useMemo(() => {
    const [w, s, e, n] = bounds
    const stations = [...data.stations.values()]
      .filter((st) => st.lon >= w && st.lon <= e && st.lat >= s && st.lat <= n)
      .sort((a, b) => (b.passengers ?? -1) - (a.passengers ?? -1))
    const lineIds = new Set(stations.flatMap((st) => st.lines))
    const lines = [...lineIds].map((id) => data.lines.get(id)!).filter(Boolean)
    return { stations, lines }
  }, [data, bounds])

  return (
    <section className="sheet tall" aria-label="この範囲の駅と路線">
      <button className="sheet-close" onClick={onClose} aria-label="閉じる">
        ×
      </button>
      <h2 className="sheet-title">この範囲の駅・路線</h2>
      <p className="sheet-sub">
        {lines.length}路線・{stations.length}駅
      </p>
      <div className="badge-row wrap">
        {lines.map((l) => (
          <LineBadge key={l.id} line={l} small />
        ))}
      </div>
      <ul className="item-list compact">
        {stations.map((st) => (
          <li key={st.id}>
            <a className="item-name" href={href.station(st.id)}>
              {st.name}
            </a>
            <span className="item-value">{st.passengers != null ? `${formatNumber(st.passengers)}人/日` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SelectionCard({ data, selection, onClose }: { data: RailData; selection: MapSelection; onClose: () => void }) {
  if (selection.type === 'line') {
    const line = data.lines.get(selection.id)
    if (!line) return null
    return (
      <section className="sheet" aria-label="選択した路線">
        <button className="sheet-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
        <LineBadge line={line} />
        <p className="sheet-sub">
          {line.company}・{line.shinkansen ? '新幹線' : COMPANY_TYPE_LABELS[line.companyType]}
        </p>
        <p className="sheet-sub">
          {line.stations.length} 駅・地図上の延長 約{formatKm(line.lengthKm)}
        </p>
        <a className="button" href={href.line(line.id)}>
          路線の詳細を見る
        </a>
      </section>
    )
  }
  const st = data.stations.get(selection.id)
  if (!st) return null
  return (
    <section className="sheet" aria-label="選択した駅">
      <button className="sheet-close" onClick={onClose} aria-label="閉じる">
        ×
      </button>
      <h2 className="sheet-title">{st.name}駅</h2>
      <p className="sheet-sub">
        {st.pref}
        {st.city}
      </p>
      <div className="badge-row">
        {st.lines.map((id) => {
          const line = data.lines.get(id)
          return line ? <LineBadge key={id} line={line} small /> : null
        })}
      </div>
      <p className="sheet-sub">
        {st.passengers != null
          ? `1日の乗降客数 ${formatNumber(st.passengers)} 人（${data.meta.passengerYear}年度）`
          : '乗降客数: 非公開・データなし'}
      </p>
      <a className="button" href={href.station(st.id)}>
        駅の詳細を見る
      </a>
    </section>
  )
}
