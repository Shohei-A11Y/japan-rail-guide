import { PageActions } from '../components/actions'
import { CommonsPhoto, Intro, WikiSummary } from '../components/media'
import { Page } from '../components/parts'
import type { RailData } from '../data'
import { formatNumber } from '../format'
import { formatDate } from '../rankings'
import { href } from '../router'
import { NotFound } from './NotFound'

export function VehiclePage({ data, id }: { data: RailData; id: string }) {
  const v = data.vehicles.get(id)
  if (!v) return <NotFound />
  const others = v.operators.filter((o) => !v.companies.some((c) => o.startsWith(c) || c.startsWith(o)))
  const intro =
    `${v.name}は、` +
    (v.companies.length || v.operators.length ? `${(v.companies.length ? v.companies : v.operators).join('・')}の` : '') +
    `${v.kind}の形式。` +
    (v.entry ? `${formatDate(v.entry)}に営業運転を始めた。` : '') +
    (v.retired ? `${formatDate(v.retired)}に引退。` : '')

  return (
    <Page>
      <p className="muted small">
        <a href={href.vehicles()}>車両図鑑</a> ＞ {v.kind}
      </p>
      <h1>{v.name}</h1>
      <PageActions kind="vehicle" id={v.id} title={v.name} />
      <Intro text={intro} />
      <CommonsPhoto file={v.image} alt={v.name} />
      <dl className="facts">
        <div>
          <dt>種類</dt>
          <dd>{v.kind}</dd>
        </div>
        {v.entry && (
          <div>
            <dt>営業運転開始</dt>
            <dd>{formatDate(v.entry)}</dd>
          </div>
        )}
        {v.retired && (
          <div>
            <dt>引退</dt>
            <dd>{formatDate(v.retired)}</dd>
          </div>
        )}
        {v.maxSpeedKmh && (
          <div>
            <dt>最高速度</dt>
            <dd>{formatNumber(v.maxSpeedKmh)} km/h</dd>
          </div>
        )}
      </dl>
      {(v.companies.length > 0 || others.length > 0) && (
        <>
          <h2>運用事業者</h2>
          <div className="chip-row">
            {v.companies.map((c) => (
              <a key={c} className="chip" href={href.company(c)}>
                {c}
              </a>
            ))}
            {others.map((o) => (
              <span key={o} className="chip plain">
                {o}
              </span>
            ))}
          </div>
        </>
      )}
      {v.manufacturers.length > 0 && (
        <>
          <h2>製造</h2>
          <p>{v.manufacturers.join('・')}</p>
        </>
      )}
      <WikiSummary title={v.wp} />
      <p className="muted small">
        種類・事業者・製造・運転開始・最高速度の出典: Wikidata{' '}
        <a href={`https://www.wikidata.org/wiki/${v.id}`} target="_blank" rel="noopener">
          {v.id}
        </a>
        （登録されている項目だけを表示しています）
      </p>
    </Page>
  )
}
