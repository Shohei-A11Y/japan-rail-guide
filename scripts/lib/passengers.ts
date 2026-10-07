/**
 * 国土数値情報「駅別乗降客数」(S12) の1行を年度ごとの値に分解する。
 * GeoJSON の属性は S12_001〜S12_005 の後に、2011年度から順に
 * [重複コード, データ有無コード, 備考, 乗降客数] の4項目ずつが並ぶ。
 */
export type S12Year = {
  year: number
  /** 1 = この行に値がある（複数路線の駅では代表の1行だけ）, 2 = 重複行, 3 = その他 */
  duplicate: number | null
  /** 1 = データあり, 2・3 = なし（非公開等）, 4 = その年度は駅なし */
  availability: number | null
  remarks: string | null
  passengers: number | null
}

export const S12_FIRST_YEAR = 2011
const FIRST_YEAR_FIELD = 6

export function s12Years(props: Record<string, unknown>): S12Year[] {
  const result: S12Year[] = []
  for (let i = 0; ; i++) {
    const base = FIRST_YEAR_FIELD + i * 4
    const k = (n: number) => `S12_${String(n).padStart(3, '0')}`
    if (!(k(base) in props)) break
    const num = (v: unknown) => (typeof v === 'number' ? v : v == null || v === '' ? null : Number(v))
    result.push({
      year: S12_FIRST_YEAR + i,
      duplicate: num(props[k(base)]),
      availability: num(props[k(base + 1)]),
      remarks: (props[k(base + 2)] as string | null) ?? null,
      passengers: num(props[k(base + 3)]),
    })
  }
  return result
}

/**
 * 駅（同名・近接駅のまとまり）としての1日あたり乗降客数を年度ごとに合算する。
 * 重複コード1（代表行）かつデータ有無コード1の値だけを足す。
 * 代表行が1つも無い年度は null（非公開・データなし）。
 */
export function aggregateByYear(rows: S12Year[][]): Map<number, number | null> {
  const totals = new Map<number, number | null>()
  for (const years of rows) {
    for (const y of years) {
      const counted = y.duplicate === 1 && y.availability === 1 && y.passengers != null && y.passengers > 0
      const prev = totals.get(y.year)
      if (counted) totals.set(y.year, (prev ?? 0) + y.passengers!)
      else if (!totals.has(y.year)) totals.set(y.year, null)
    }
  }
  return totals
}
