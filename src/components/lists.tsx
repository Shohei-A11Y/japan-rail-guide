import type { RailData } from '../data'
import { formatNumber } from '../format'
import { href } from '../router'
import type { Station } from '../types'
import { LineBadge } from './parts'

/** 駅の一覧。value を渡すと右側にその値を出す（ランキング用） */
export function StationList({
  data,
  stations,
  value,
  ordered,
}: {
  data: RailData
  stations: Station[]
  value?: (s: Station) => string
  ordered?: boolean
}) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <List className={`item-list${ordered ? ' ranked' : ''}`}>
      {stations.map((s) => (
        <li key={s.id}>
          <div className="item-main">
            <a className="item-name" href={href.station(s.id)}>
              {s.name}
            </a>
            <span className="item-sub">
              {s.pref}
              {s.city}
            </span>
            <div className="badge-row">
              {s.lines.slice(0, 4).map((id) => {
                const l = data.lines.get(id)
                return l ? <LineBadge key={id} line={l} small /> : null
              })}
              {s.lines.length > 4 && <span className="muted small">ほか{s.lines.length - 4}路線</span>}
            </div>
          </div>
          <span className="item-value">
            {value ? value(s) : s.passengers != null ? `${formatNumber(s.passengers)}人/日` : ''}
          </span>
        </li>
      ))}
    </List>
  )
}
