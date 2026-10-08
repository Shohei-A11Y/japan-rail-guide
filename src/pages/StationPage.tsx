import { PageActions } from '../components/actions'
import { CommonsPhoto, Intro, WikiSummary } from '../components/media'
import { LineBadge, Notice, Page } from '../components/parts'
import { RailMap } from '../components/RailMap'
import { type RailData, useStationDetail } from '../data'
import { describeStation } from '../describe'
import { formatNumber } from '../format'
import { formatDate } from '../rankings'
import { href } from '../router'
import { NotFound } from './NotFound'

export function StationPage({ data, id }: { data: RailData; id: string }) {
  const detail = useStationDetail(id)
  const st = data.stations.get(id)
  if (!st) return <NotFound />
  const lines = st.lines.map((l) => data.lines.get(l)).filter((l) => l != null)
  const year = data.meta.passengerYear
  const breakdown = detail?.breakdown ?? []
  const history = detail?.history ?? []
  const companies = new Set(breakdown.map((b) => b.company))

  return (
    <Page>
      <div className="station-sign">
        {st.kana && <div className="station-sign-kana">{st.kana}</div>}
        <div className="station-sign-name">{st.name}</div>
        <div className="station-sign-bar">
          {lines.map((l) => (
            <span key={l.id} style={{ background: l.color }} />
          ))}
        </div>
      </div>
      <PageActions kind="station" id={st.id} title={`${st.name}駅`}>
        <a className="action" href={href.route(st.id, '')}>
          ここから乗換
        </a>
        <a className="action" href={href.route('', st.id)}>
          ここまで
        </a>
      </PageActions>
      <Intro text={describeStation(st, data)} />

      <dl className="facts">
        {st.pref && (
          <div>
            <dt>所在地</dt>
            <dd>
              <a href={href.pref(st.pref)}>{st.pref}</a>
              {st.city}
            </dd>
          </div>
        )}
        {st.elevation != null && (
          <div>
            <dt>標高</dt>
            <dd>約{formatNumber(st.elevation)}m</dd>
          </div>
        )}
        {st.opened && (
          <div>
            <dt>開業</dt>
            <dd>{formatDate(st.opened)}</dd>
          </div>
        )}
      </dl>

      <h2>乗り入れ路線</h2>
      <div className="badge-row wrap">
        {lines.map((l) => (
          <LineBadge key={l.id} line={l} />
        ))}
      </div>

      <CommonsPhoto file={detail?.image} alt={`${st.name}駅`} />

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
          {breakdown.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>事業者・路線</th>
                  <th className="num">乗降客数</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
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
      {history.some(([, v]) => v != null) && (
        <>
          <h3>年度別の推移</h3>
          <table className="table">
            <tbody>
              {history.map(([y, v]) => (
                <tr key={y}>
                  <td>{y}年度</td>
                  <td className="num">{v != null ? `${formatNumber(v)} 人` : 'データなし'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <WikiSummary title={detail?.wp} />

      <h2>場所</h2>
      <RailMap data={data} focus={{ type: 'station', id: st.id }} className="rail-map mini" />
      <p className="muted small">
        北緯 {st.lat.toFixed(4)}° 東経 {st.lon.toFixed(4)}°（同名で300m以内の駅をまとめた代表点）
        {st.elevation != null && '。標高は代表点の地表の値（国土地理院の標高タイル）で、高架・地下のホームの高さではありません'}
      </p>
      {st.wikidata && (
        <p className="muted small">
          読み仮名・開業日の出典: Wikidata{' '}
          <a href={`https://www.wikidata.org/wiki/${st.wikidata}`} target="_blank" rel="noopener">
            {st.wikidata}
          </a>
        </p>
      )}
    </Page>
  )
}
