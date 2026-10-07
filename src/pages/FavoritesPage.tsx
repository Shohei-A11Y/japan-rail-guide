import { StationList } from '../components/lists'
import { LineBadge, Notice, Page } from '../components/parts'
import type { RailData } from '../data'
import { type FavoriteKind, useFavorites } from '../favorites'
import { href } from '../router'
import type { Line, Station, Vehicle } from '../types'
import { VehicleList } from './VehiclesPage'

export function FavoritesPage({ data }: { data: RailData }) {
  const { favorites, remove } = useFavorites()
  const stations = favorites.station.map((id) => data.stations.get(id)).filter((s): s is Station => !!s)
  const lines = favorites.line.map((id) => data.lines.get(id)).filter((l): l is Line => !!l)
  const vehicles = favorites.vehicle.map((id) => data.vehicles.get(id)).filter((v): v is Vehicle => !!v)
  const companies = favorites.company.filter((name) => data.companies.has(name))
  // データ更新で ID が変わるなどして、見つからなくなったもの
  const missing: [FavoriteKind, string[]][] = [
    ['station', favorites.station.filter((id) => !data.stations.has(id))],
    ['line', favorites.line.filter((id) => !data.lines.has(id))],
    ['vehicle', favorites.vehicle.filter((id) => !data.vehicles.has(id))],
    ['company', favorites.company.filter((name) => !data.companies.has(name))],
  ]
  const missingCount = missing.reduce((n, [, ids]) => n + ids.length, 0)
  const empty = !stations.length && !lines.length && !vehicles.length && !companies.length

  return (
    <Page>
      <h1>お気に入り</h1>
      <p className="muted small">お気に入りはこの端末のブラウザにだけ保存されます（ほかの端末とは共有されません）。</p>
      {empty && <p>まだありません。駅・路線・車両・事業者のページの「☆ お気に入り」で追加できます。</p>}
      {lines.length > 0 && (
        <>
          <h2>路線</h2>
          <div className="badge-row wrap">
            {lines.map((l) => (
              <LineBadge key={l.id} line={l} small />
            ))}
          </div>
        </>
      )}
      {stations.length > 0 && (
        <>
          <h2>駅</h2>
          <StationList data={data} stations={stations} />
        </>
      )}
      {companies.length > 0 && (
        <>
          <h2>事業者</h2>
          <div className="chip-row">
            {companies.map((c) => (
              <a key={c} className="chip" href={href.company(c)}>
                {c}
              </a>
            ))}
          </div>
        </>
      )}
      {vehicles.length > 0 && (
        <>
          <h2>車両形式</h2>
          <VehicleList vehicles={vehicles} />
        </>
      )}
      {missingCount > 0 && (
        <Notice>
          データの更新で見つからなくなったお気に入りが{missingCount}件あります。{' '}
          <button className="link-button" onClick={() => missing.forEach(([kind, ids]) => ids.length && remove(kind, ids))}>
            一覧から消す
          </button>
        </Notice>
      )}
    </Page>
  )
}
