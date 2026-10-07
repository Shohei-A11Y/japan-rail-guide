import { describe, expect, it } from 'vitest'
import { mainPaths } from './chain'
import { parseCsv } from './csv'
import { type Coord, haversineKm, lengthKm, projectOnPolyline, simplify } from './geo'
import { fnv1a, lineId, stationId, uniqueId } from './ids'
import { aggregateByYear, s12Years } from './passengers'

describe('geo', () => {
  it('東京駅〜新大阪駅の直線距離はおよそ400km', () => {
    const d = haversineKm([139.7671, 35.6812], [135.5003, 34.7334])
    expect(d).toBeGreaterThan(395)
    expect(d).toBeLessThan(405)
  })

  it('一直線上の中間点は簡略化で消え、曲がり角は残る', () => {
    const straight: Coord[] = [
      [0, 0],
      [0.5, 0],
      [1, 0],
    ]
    expect(simplify(straight, 0.001)).toEqual([
      [0, 0],
      [1, 0],
    ])
    const corner: Coord[] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ]
    expect(simplify(corner, 0.001)).toEqual(corner)
  })

  it('点を折れ線に投影すると始点からの距離が分かる', () => {
    const line: Coord[] = [
      [135, 35],
      [135.1, 35],
      [135.2, 35],
    ]
    const near = projectOnPolyline([135.15, 35.001], line)
    expect(near.along).toBeCloseTo(lengthKm(line) * 0.75, 1)
    expect(near.offset).toBeLessThan(0.2)
  })
})

describe('ids', () => {
  it('同じ入力からは同じIDになり、入力が違えば変わる', () => {
    expect(lineId('東日本旅客鉄道', '山手線')).toBe(lineId('東日本旅客鉄道', '山手線'))
    expect(lineId('東日本旅客鉄道', '山手線')).not.toBe(lineId('神戸市', '山手線'))
    expect(fnv1a('')).toBe(0x811c9dc5)
  })

  it('駅IDは座標の小さなずれでは変わらない', () => {
    expect(stationId('新宿', 139.70001, 35.68961)).toBe(stationId('新宿', 139.70004, 35.68964))
  })

  it('重複したIDには連番が付く', () => {
    const used = new Set<string>()
    expect(uniqueId('S1', used)).toBe('S1')
    expect(uniqueId('S1', used)).toBe('S1-2')
  })
})

describe('mainPaths', () => {
  it('ばらばらの向きの区間をつないで1本の経路にし、西を始点にする', () => {
    const paths = mainPaths([
      [
        [136, 35],
        [135.5, 35],
      ],
      [
        [135, 35],
        [135.5, 35],
      ],
      [
        [136, 35],
        [136.5, 35],
      ],
    ])
    expect(paths).toHaveLength(1)
    expect(paths[0][0]).toEqual([135, 35])
    expect(paths[0][paths[0].length - 1]).toEqual([136.5, 35])
  })

  it('つながっていない区間は別の経路になり、長い順に並ぶ', () => {
    const paths = mainPaths([
      [
        [140, 40],
        [140.1, 40],
      ],
      [
        [135, 35],
        [136, 35],
      ],
    ])
    expect(paths).toHaveLength(2)
    expect(paths[0][0]).toEqual([135, 35])
  })
})

describe('csv', () => {
  it('ヘッダー付きCSVを読み、引用符・コメント行・空行に対応する', () => {
    const rows = parseCsv('\uFEFFcompany,line,source\n# メモ\n京王電鉄,"井の頭線","公式サイト, 2026"\n\n')
    expect(rows).toEqual([{ company: '京王電鉄', line: '井の頭線', source: '公式サイト, 2026' }])
  })
})

describe('passengers', () => {
  // 2011年度・2012年度の2年分を持つ S12 の属性
  const props = (dup: number[], avail: number[], values: number[]) => ({
    S12_001: '新宿',
    S12_006: dup[0],
    S12_007: avail[0],
    S12_008: null,
    S12_009: values[0],
    S12_010: dup[1],
    S12_011: avail[1],
    S12_012: '山手線を含む',
    S12_013: values[1],
  })

  it('年度ごとの4項目を分解する', () => {
    const years = s12Years(props([1, 1], [1, 1], [100, 200]))
    expect(years.map((y) => y.year)).toEqual([2011, 2012])
    expect(years[1]).toMatchObject({ duplicate: 1, availability: 1, remarks: '山手線を含む', passengers: 200 })
  })

  it('代表行（重複コード1）の値だけを合算し、重複行は数えない', () => {
    const totals = aggregateByYear([
      s12Years(props([1, 1], [1, 1], [100, 200])),
      s12Years(props([2, 2], [1, 1], [0, 0])),
      s12Years(props([1, 1], [1, 1], [10, 20])),
    ])
    expect(totals.get(2011)).toBe(110)
    expect(totals.get(2012)).toBe(220)
  })

  it('データなしの年度は null になる', () => {
    const totals = aggregateByYear([s12Years(props([1, 1], [2, 1], [0, 50]))])
    expect(totals.get(2011)).toBeNull()
    expect(totals.get(2012)).toBe(50)
  })
})
