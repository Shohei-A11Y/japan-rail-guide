import { COMPANY_TYPE_LABELS } from './codes'
import type { RailData } from './data'
import { formatNumber } from './format'
import { formatDate } from './rankings'
import type { Line, Station } from './types'

// データから作る短い紹介文。事実として持っている値だけを使い、無い値は文に入れない

export function describeLine(line: Line, data: RailData): string {
  const kind = line.shinkansen ? '新幹線' : COMPANY_TYPE_LABELS[line.companyType]
  const parts = [`${line.displayName}は、${line.company}が運営する${kind}の路線。`]
  if (line.prefs.length === 1) parts.push(`${line.prefs[0]}内を走る。`)
  else if (line.prefs.length > 1) parts.push(`${line.prefs[0]}から${line.prefs[line.prefs.length - 1]}まで${line.prefs.length}都道府県を通る。`)
  const first = data.stations.get(line.stations[0])
  const last = data.stations.get(line.stations[line.stations.length - 1])
  if (first && last && first !== last) parts.push(`${first.name}〜${last.name}の${line.stations.length}駅。`)
  if (line.opened) parts.push(`${formatDate(line.opened)}開業。`)
  return parts.join('')
}

export function describeStation(st: Station, data: RailData): string {
  const lines = st.lines.map((id) => data.lines.get(id)).filter((l): l is Line => !!l)
  const companies = [...new Set(lines.map((l) => l.company))]
  const place = st.pref ? `${st.pref}${st.city ?? ''}にある` : ''
  const parts = [`${st.name}駅は、${place}${companies.join('・')}の駅。`]
  if (lines.length > 1) parts.push(`${lines.map((l) => l.displayName).join('・')}の${lines.length}路線が乗り入れる。`)
  else if (lines.length === 1) parts.push(`${lines[0].displayName}の駅。`)
  if (st.opened) parts.push(`${formatDate(st.opened)}開業。`)
  if (st.passengers != null && data.meta.passengerYear) {
    parts.push(`${data.meta.passengerYear}年度の1日の乗降客数は${formatNumber(st.passengers)}人。`)
  }
  return parts.join('')
}
