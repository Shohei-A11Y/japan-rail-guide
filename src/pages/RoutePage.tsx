import { useMemo, useState } from 'react'
import { LineBadge, Notice, Page } from '../components/parts'
import { type MapRoute, RailMap } from '../components/RailMap'
import { type RailData, useRouteGraph } from '../data'
import { formatNumber } from '../format'
import { type Journey, findJourneys } from '../route'
import { href } from '../router'
import { search } from '../search'
import type { Station } from '../types'

export function RoutePage({ data, from, to }: { data: RailData; from: string; to: string }) {
  const graph = useRouteGraph()
  const a = data.stations.get(from)
  const b = data.stations.get(to)
  const journeys = useMemo(
    () => (graph.status === 'ready' && a && b && a.id !== b.id ? findJourneys(graph.data, a.id, b.id) : null),
    [graph, a, b],
  )

  return (
    <Page>
      <h1>乗換</h1>
      <div className="route-form">
        <StationPicker key={`from-${from}`} data={data} label="出発" station={a} onPick={(id) => go(id, to)} />
        <button
          className="route-swap"
          onClick={() => go(to, from)}
          disabled={!a && !b}
          aria-label="出発と到着を入れ替える"
          title="入れ替え"
        >
          ⇅
        </button>
        <StationPicker key={`to-${to}`} data={data} label="到着" station={b} onPick={(id) => go(from, id)} />
      </div>

      {a && b && a.id === b.id && <p className="muted">出発と到着が同じ駅です。</p>}
      {a && b && graph.status === 'loading' && <p className="muted">駅のつながりを読み込んでいます…</p>}
      {graph.status === 'error' && <p className="muted">駅のつながりを読み込めませんでした。</p>}
      {journeys && journeys.length === 0 && (
        <p className="muted">線路でつながる経路が見つかりませんでした（離島の路線や、ほかの路線と接続しない路線など）。</p>
      )}
      {journeys && journeys.length > 0 && <Results key={`${from}|${to}`} data={data} journeys={journeys} />}

      <Notice>
        時刻・所要時間・運賃は出ません。乗換の少なさと、線路に沿った地図上の距離（営業キロではありません）で選んだ経路です。
        乗換は同じ駅（同じ駅名で300m以内）の中だけで探し、駅名の違う駅への徒歩連絡（例: 有楽町と日比谷）は含みません。
        直通運転の列車でも、路線が変わるところは乗換として数えます。
      </Notice>
    </Page>
  )
}

const go = (from: string, to: string) => {
  window.location.hash = href.route(from, to)
}

function StationPicker({
  data,
  label,
  station,
  onPick,
}: {
  data: RailData
  label: string
  station?: Station
  onPick: (id: string) => void
}) {
  const [text, setText] = useState(station?.name ?? '')
  const [open, setOpen] = useState(false)
  const candidates = useMemo(() => (open && text.trim() ? search(data, text, 8).stations : []), [data, text, open])
  return (
    <div className="route-picker">
      <label>
        <span className="route-picker-label">{label}</span>
        <input
          type="search"
          value={text}
          placeholder="駅名（ひらがな・ローマ字も可）"
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && candidates[0]) onPick(candidates[0].id)
            if (e.key === 'Escape') setOpen(false)
          }}
          aria-autocomplete="list"
        />
      </label>
      {candidates.length > 0 && (
        <ul className="route-candidates" role="listbox">
          {candidates.map((s) => (
            <li key={s.id} role="option" aria-selected={false}>
              <button
                // 入力欄のフォーカスが外れる前に選べるよう mousedown で止める
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false)
                  onPick(s.id)
                }}
              >
                <span className="route-candidate-name">{s.name}</span>
                <span className="muted small">
                  {s.pref}
                  {s.city}
                </span>
                <span className="badge-row wrap">
                  {s.lines.slice(0, 3).map((id) => {
                    const l = data.lines.get(id)
                    return l ? <LineBadge key={id} line={l} small link={false} /> : null
                  })}
                  {s.lines.length > 3 && <span className="muted small">ほか{s.lines.length - 3}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Results({ data, journeys }: { data: RailData; journeys: Journey[] }) {
  const [selected, setSelected] = useState(0)
  const journey = journeys[selected]
  const mapRoute = useMemo<MapRoute>(
    () => ({
      legs: journey.legs.map((leg) => ({
        color: data.lines.get(leg.line)?.color ?? '#888888',
        coords: leg.stations.map((id) => {
          const st = data.stations.get(id)!
          return [st.lon, st.lat] as [number, number]
        }),
      })),
      stations: [...new Set(journey.legs.flatMap((l) => l.stations))],
    }),
    [data, journey],
  )

  return (
    <>
      {journeys.length > 1 && (
        <div className="route-tabs" role="tablist">
          {journeys.map((j, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === selected}
              className={i === selected ? 'active' : ''}
              onClick={() => setSelected(i)}
            >
              <strong>経路{i + 1}</strong>
              <span>
                乗換{j.transfers}回・約{formatNumber(Math.round(j.km))}km
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="route-summary">
        乗換 <strong>{journey.transfers}</strong> 回・約 <strong>{formatNumber(Math.round(journey.km))}</strong> km・
        {journey.legs.reduce((n, l) => n + l.stations.length - 1, 0)}駅先
      </p>
      <ol className="route-legs">
        {journey.legs.map((leg, i) => {
          const line = data.lines.get(leg.line)
          const first = data.stations.get(leg.stations[0])!
          const last = data.stations.get(leg.stations[leg.stations.length - 1])!
          const middle = leg.stations.slice(1, -1)
          return (
            <li key={i} style={{ ['--line-color' as string]: line?.color }}>
              <a className="route-leg-station" href={href.station(first.id)}>
                {first.name}
              </a>
              {i > 0 && <span className="muted small">乗換</span>}
              <div className="route-leg-ride">
                {line && <LineBadge line={line} small />}
                <span className="muted small">
                  {leg.stations.length - 1}駅・約{leg.km}km
                </span>
                {middle.length > 0 && (
                  <details>
                    <summary>途中の駅</summary>
                    <p className="small">
                      {middle.map((id, k) => (
                        <span key={id}>
                          {k > 0 && '・'}
                          <a href={href.station(id)}>{data.stations.get(id)?.name}</a>
                        </span>
                      ))}
                    </p>
                  </details>
                )}
              </div>
              {i === journey.legs.length - 1 && (
                <a className="route-leg-station" href={href.station(last.id)}>
                  {last.name}
                </a>
              )}
            </li>
          )
        })}
      </ol>
      <RailMap data={data} route={mapRoute} className="rail-map mini" />
      <p className="muted small">地図の線は駅どうしを直線で結んだもので、実際の線路の形ではありません。</p>
    </>
  )
}
