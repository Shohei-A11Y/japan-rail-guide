import { useMemo } from 'react'
import { StationList } from '../components/lists'
import { CommonsPhoto, Intro, WikiSummary } from '../components/media'
import { LineBadge, Page } from '../components/parts'
import { RailMap } from '../components/RailMap'
import { COMPANY_TYPE_LABELS, PREFECTURES } from '../codes'
import type { RailData } from '../data'
import { formatKm, formatNumber } from '../format'
import { formatDate } from '../rankings'
import { href } from '../router'
import type { BBox } from '../types'
import { NotFound } from './NotFound'

export function CompanyPage({ data, name }: { data: RailData; name: string }) {
  const info = useMemo(() => {
    const lines = [...data.lines.values()]
      .filter((l) => l.company === name)
      .sort((a, b) => b.stations.length - a.stations.length)
    if (lines.length === 0) return null
    // 通称区間（ミニ新幹線）は元の路線と重なるので延長・駅数には数えない
    const own = lines.filter((l) => !l.via)
    const stationIds = new Set(own.flatMap((l) => l.stations))
    const stations = [...stationIds].map((id) => data.stations.get(id)!).filter(Boolean)
    const bounds: BBox = [
      Math.min(...lines.map((l) => l.bbox[0])),
      Math.min(...lines.map((l) => l.bbox[1])),
      Math.max(...lines.map((l) => l.bbox[2])),
      Math.max(...lines.map((l) => l.bbox[3])),
    ]
    const types = [...new Set(lines.map((l) => (l.shinkansen ? '新幹線' : COMPANY_TYPE_LABELS[l.companyType])))]
    const prefs = PREFECTURES.filter((p) => own.some((l) => l.prefs.includes(p)))
    const vehicles = [...data.vehicles.values()]
      .filter((v) => v.companies.includes(name))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    const top = stations.filter((s) => s.passengers != null).sort((a, b) => b.passengers! - a.passengers!)
    return {
      lines,
      stations,
      bounds,
      types,
      prefs,
      vehicles,
      top: top.slice(0, 10),
      lengthKm: own.reduce((sum, l) => sum + l.lengthKm, 0),
    }
  }, [data, name])

  if (!info) return <NotFound />
  const company = data.companies.get(name)
  const intro =
    `${name}は、${info.types.join('・')}の路線を運営する鉄道事業者。` +
    // 都道府県が多い事業者は並べると長くなるので数だけにする
    (info.prefs.length > 4
      ? `${info.prefs.length}都道府県で`
      : info.prefs.length
        ? `${info.prefs.join('・')}で`
        : '') +
    `${info.lines.length}路線・${formatNumber(info.stations.length)}駅を持つ。` +
    (company?.inception ? `${formatDate(company.inception)}設立。` : '')

  return (
    <Page>
      <h1>{name}</h1>
      {company?.label && company.label !== name && <p className="muted">{company.label}</p>}
      <Intro text={intro} />
      <dl className="facts">
        <div>
          <dt>路線</dt>
          <dd>{info.lines.length} 路線</dd>
        </div>
        <div>
          <dt>駅</dt>
          <dd>{formatNumber(info.stations.length)} 駅</dd>
        </div>
        <div>
          <dt>地図上の延長（合計）</dt>
          <dd>約{formatKm(Math.round(info.lengthKm * 10) / 10)}</dd>
        </div>
        {company?.inception && (
          <div>
            <dt>設立</dt>
            <dd>{formatDate(company.inception)}</dd>
          </div>
        )}
        {company?.headquarters && (
          <div>
            <dt>本社</dt>
            <dd>{company.headquarters}</dd>
          </div>
        )}
        {company?.website && (
          <div>
            <dt>公式サイト</dt>
            <dd>
              <a href={company.website} target="_blank" rel="noopener">
                {company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            </dd>
          </div>
        )}
      </dl>

      <RailMap data={data} bounds={info.bounds} className="rail-map mini" />

      <h2>路線</h2>
      <div className="badge-row wrap">
        {info.lines.map((l) => (
          <LineBadge key={l.id} line={l} small />
        ))}
      </div>

      {info.vehicles.length > 0 && (
        <>
          <h2>車両形式</h2>
          <div className="chip-row">
            {info.vehicles.map((v) => (
              <a key={v.id} className="chip" href={href.vehicle(v.id)}>
                {v.name}
              </a>
            ))}
          </div>
        </>
      )}

      {info.top.length > 0 && (
        <>
          <h2>乗降客数の多い駅</h2>
          <p className="muted small">駅全体の値（他社の路線分を含む）。</p>
          <StationList data={data} stations={info.top} ordered />
        </>
      )}

      <CommonsPhoto file={company?.image} alt={name} />
      <WikiSummary title={company?.wp} />
      {company?.wikidata && (
        <p className="muted small">
          設立・本社・公式サイトの出典: Wikidata{' '}
          <a href={`https://www.wikidata.org/wiki/${company.wikidata}`} target="_blank" rel="noopener">
            {company.wikidata}
          </a>
        </p>
      )}
    </Page>
  )
}
