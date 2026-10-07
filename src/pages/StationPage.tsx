import { LineBadge, Notice, Page } from '../components/parts'
import { RailMap } from '../components/RailMap'
import type { RailData } from '../data'
import { formatNumber } from '../format'
import { NotFound } from './NotFound'

export function StationPage({ data, id }: { data: RailData; id: string }) {
  const st = data.stations.get(id)
  if (!st) return <NotFound />
  const lines = st.lines.map((l) => data.lines.get(l)).filter((l) => l != null)
  const year = data.meta.passengerYear
  const companies = new Set(st.breakdown.map((b) => b.company))

  return (
    <Page>
      <div className="station-sign">
        <div className="station-sign-name">{st.name}</div>
        <div className="station-sign-bar">
          {lines.map((l) => (
            <span key={l.id} style={{ background: l.color }} />
          ))}
        </div>
      </div>

      <h2>乗り入れ路線</h2>
      <div className="badge-row wrap">
        {lines.map((l) => (
          <LineBadge key={l.id} line={l} />
        ))}
      </div>

      <h2>1日あたりの乗降客数</h2>
      {st.passengers != null ? (
        <>
          <p className="big-number">
            {formatNumber(st.passengers)}
            <span> 人（{year}年度）</span>
          </p>
          {companies.size > 1 && (
            <Notice>
              複数の事業者の値の合計です。事業者をまたいで乗り換える人は、それぞれの事業者で数えられています。
            </Notice>
          )}
          {st.breakdown.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>事業者・路線</th>
                  <th className="num">乗降客数</th>
                </tr>
              </thead>
              <tbody>
                {st.breakdown.map((b) => (
                  <tr key={`${b.company}|${b.line}`}>
                    <td>
                      {b.company} {b.line}
                      {b.remarks && <div className="muted small">{b.remarks}</div>}
                    </td>
                    <td className="num">{formatNumber(b.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p className="muted">非公開、またはデータがありません。</p>
      )}
      {st.history.some(([, v]) => v != null) && (
        <>
          <h3>年度別の推移</h3>
          <table className="table">
            <tbody>
              {st.history.map(([y, v]) => (
                <tr key={y}>
                  <td>{y}年度</td>
                  <td className="num">{v != null ? `${formatNumber(v)} 人` : 'データなし'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>場所</h2>
      <RailMap data={data} focus={{ type: 'station', id: st.id }} className="rail-map mini" />
      <p className="muted small">
        北緯 {st.lat.toFixed(4)}° 東経 {st.lon.toFixed(4)}°（同名で300m以内の駅をまとめた代表点）
      </p>
    </Page>
  )
}
