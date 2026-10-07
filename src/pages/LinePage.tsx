import { LineBadge, Notice, Page } from '../components/parts'
import { RailMap } from '../components/RailMap'
import { COMPANY_TYPE_LABELS, RAIL_TYPE_LABELS } from '../codes'
import type { RailData } from '../data'
import { formatKm, formatNumber } from '../format'
import { href } from '../router'
import { NotFound } from './NotFound'

export function LinePage({ data, id }: { data: RailData; id: string }) {
  const line = data.lines.get(id)
  if (!line) return <NotFound />
  const sameCompany = [...data.lines.values()]
    .filter((l) => l.company === line.company && l.id !== line.id)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'))

  return (
    <Page>
      <div className="line-hero" style={{ borderColor: line.color }}>
        <LineBadge line={line} link={false} />
        <p className="line-company">{line.company}</p>
      </div>

      <dl className="facts">
        <div>
          <dt>種別</dt>
          <dd>{line.shinkansen ? '新幹線' : COMPANY_TYPE_LABELS[line.companyType]}</dd>
        </div>
        <div>
          <dt>鉄道区分</dt>
          <dd>{RAIL_TYPE_LABELS[line.railType] ?? line.railType}</dd>
        </div>
        <div>
          <dt>駅数</dt>
          <dd>{line.stations.length} 駅</dd>
        </div>
        <div>
          <dt>地図上の延長</dt>
          <dd>約{formatKm(line.lengthKm)}</dd>
        </div>
      </dl>
      {line.via && (
        <p className="via">
          {line.via.map((v, i) => {
            const base = data.lines.get(v.line)
            return (
              <span key={i}>
                {i > 0 && '・'}
                {base ? <a href={href.line(base.id)}>{base.displayName}</a> : null}（{v.from}〜{v.to}）
              </span>
            )
          })}
          を走る通称区間です。
        </p>
      )}
      <Notice>
        延長は地図上の線形から計算した値で、営業キロとは異なります。
        {line.colorSource === 'default' && '線の色は種別ごとの既定色で、公式の路線カラーではありません。'}
        {line.colorSource === 'wikidata' && '線の色はWikidataに登録された路線色です（事業者の色指定と細部が異なる場合があります）。'}
        {line.displayName !== line.name && !line.via && `国土数値情報での路線名は「${line.name}」です。`}
        {line.displayName === line.name && !line.via && '路線名は国土数値情報の表記（法令上の線名など）です。'}
      </Notice>
      {line.wikidata && (
        <p className="muted small">
          Wikidata:{' '}
          <a href={`https://www.wikidata.org/wiki/${line.wikidata}`} target="_blank" rel="noopener">
            {line.wikidata}
          </a>
        </p>
      )}

      <RailMap data={data} focus={{ type: 'line', id: line.id }} className="rail-map mini" />

      <h2>{line.via ? '区間内の駅' : '駅一覧'}</h2>
      <p className="muted small">
        {line.via && '区間内にあるすべての駅です。列車がすべての駅に停車するわけではありません。'}
        並び順は地図上の線形から自動で推定しています。支線のある路線では順番が前後することがあります。
      </p>
      <ol className="route" style={{ ['--line-color' as string]: line.color }}>
        {line.stations.map((sid) => {
          const st = data.stations.get(sid)
          if (!st) return null
          // 通称区間では、実際に走っている元の路線は乗換として出さない
          const transfers = st.lines.filter((l) => l !== line.id && !line.via?.some((v) => v.line === l))
          return (
            <li key={sid}>
              <a className="route-name" href={href.station(sid)}>
                {st.name}
              </a>
              {st.passengers != null && <span className="route-pax">{formatNumber(st.passengers)}人/日</span>}
              {transfers.length > 0 && (
                <div className="badge-row">
                  {transfers.map((tid) => {
                    const t = data.lines.get(tid)
                    return t ? <LineBadge key={tid} line={t} small /> : null
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {sameCompany.length > 0 && (
        <>
          <h2>{line.company}のほかの路線</h2>
          <div className="badge-row wrap">
            {sameCompany.map((l) => (
              <LineBadge key={l.id} line={l} small />
            ))}
          </div>
        </>
      )}
    </Page>
  )
}
