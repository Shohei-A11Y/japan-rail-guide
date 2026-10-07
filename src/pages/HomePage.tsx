import { useState } from 'react'
import { LineBadge } from '../components/parts'
import { type MapSelection, RailMap } from '../components/RailMap'
import { COMPANY_TYPE_LABELS } from '../codes'
import type { RailData } from '../data'
import { formatKm, formatNumber } from '../format'
import { href } from '../router'

export function HomePage({ data }: { data: RailData }) {
  const [selected, setSelected] = useState<MapSelection | null>(null)
  const { counts } = data.meta

  return (
    <div className="home">
      <RailMap data={data} focus={selected ?? undefined} onSelect={setSelected} className="rail-map full" />
      <div className="home-overlay">
        <div className="home-title">
          <h1>日本鉄道ガイド</h1>
          <p>
            全国 {formatNumber(counts.lines)} 路線・{formatNumber(counts.stations)} 駅を眺めよう
          </p>
        </div>
        <nav className="home-links">
          <a href={href.lines()}>路線一覧</a>
          <a href={href.about()}>出典・説明</a>
        </nav>
      </div>
      {selected ? (
        <SelectionCard data={data} selection={selected} onClose={() => setSelected(null)} />
      ) : (
        <p className="home-hint">路線や駅をタップすると詳しい情報が出ます</p>
      )}
    </div>
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
