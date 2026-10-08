import { describe, expect, it } from 'vitest'
import { mainPaths } from './chain'
import { csvRow, parseCsv } from './csv'
import { decodeRgbPng, demValue, tilePixel } from './dem'
import { type Coord, haversineKm, lengthKm, pointInPolygon, projectOnPolyline, simplify, slicePolyline } from './geo'
import { fnv1a, lineId, stationId, uniqueId } from './ids'
import {
  earliestDate,
  isOperatorOf,
  latestDate,
  matchLine,
  nameVariants,
  pickWebsite,
  romajiFromEnglish,
  sameOperator,
  shortElectrification,
  singleColor,
} from './match'
import { aggregateByYear, s12Years } from './passengers'
import { precacheManifest } from '../vite-sw'

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

describe('slicePolyline', () => {
  it('距離で指定した区間だけを切り出す', () => {
    const line: Coord[] = [
      [135, 35],
      [135.1, 35],
      [135.2, 35],
    ]
    const total = lengthKm(line)
    const part = slicePolyline(line, total * 0.25, total * 0.75)
    expect(part[0][0]).toBeCloseTo(135.05, 4)
    expect(part[part.length - 1][0]).toBeCloseTo(135.15, 4)
    expect(part).toHaveLength(3)
  })
})

describe('Wikidata との照合', () => {
  const item = (qid: string, label: string, aliases: string[], operators: string[], colors: string[] = []) => ({
    qid,
    label,
    aliases,
    operators,
    colors,
  })
  const items = [
    item('Q1', '東北本線', ['東北線'], ['東日本旅客鉄道']),
    item('Q2', '東海道本線', ['東海道線'], ['東日本旅客鉄道', '西日本旅客鉄道']),
    item('Q3', '東海道線', ['東海道本線'], ['東日本旅客鉄道']),
    item('Q4', '京急本線', ['京急線'], ['京浜急行電鉄']),
    item('Q5', '東京メトロ丸ノ内線', ['丸ノ内線'], ['東京地下鉄']),
    item('Q6', '御堂筋線', [], ['大阪市高速電気軌道']),
    item('Q7', '東武伊勢崎線', ['伊勢崎線'], ['東武鉄道']),
    item('Q8', '東武スカイツリーライン', ['伊勢崎線'], ['東武鉄道']),
    item('Q9', '都営地下鉄浅草線', ['浅草線'], ['東京都交通局']),
  ]

  it('名前の候補を元の名前に近い順に作る', () => {
    expect(nameVariants('東北線')).toEqual(['東北線', '東北本線'])
    expect(nameVariants('4号線丸ノ内線')).toEqual(['4号線丸ノ内線', '丸ノ内線', '4号線丸ノ内本線', '丸ノ内本線'])
    expect(nameVariants('1号線(御堂筋線)')[1]).toBe('御堂筋線')
    expect(nameVariants('東海道新幹線')).toEqual(['東海道新幹線'])
  })

  it('法令上の線名・番号付きの名前・事業者名の省略を照合できる', () => {
    expect(matchLine('東日本旅客鉄道', '東北線', items)?.qid).toBe('Q1')
    expect(matchLine('京浜急行電鉄', '本線', items)?.qid).toBe('Q4')
    expect(matchLine('東京地下鉄', '4号線丸ノ内線', items)?.qid).toBe('Q5')
    expect(matchLine('大阪市高速電気軌道', '1号線(御堂筋線)', items)?.qid).toBe('Q6')
    expect(matchLine('東京都', '1号線浅草線', items)?.qid).toBe('Q9')
  })

  it('元の名前と完全に一致する項目を優先する', () => {
    expect(matchLine('東日本旅客鉄道', '東海道線', items)?.qid).toBe('Q3')
  })

  it('候補が複数の項目に分かれたら該当なしにする', () => {
    expect(matchLine('東武鉄道', '伊勢崎線', items)).toBeNull()
  })

  it('運営者が違う項目とは照合しない', () => {
    expect(matchLine('西日本旅客鉄道', '東北線', items)).toBeNull()
  })

  it('路線色は1つに決まるときだけ使う', () => {
    expect(singleColor(['9acd32'])).toBe('#9ACD32')
    expect(singleColor(['FF0000', '00FF00'])).toBeNull()
    expect(singleColor(['red'])).toBeNull()
  })
})

describe('所在地の判定と Wikidata の値の整形', () => {
  it('穴のある多角形の内外を判定する', () => {
    const outer: Coord[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]
    const hole: Coord[] = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ]
    expect(pointInPolygon([1, 1], [outer, hole])).toBe(true)
    expect(pointInPolygon([5, 5], [outer, hole])).toBe(false)
    expect(pointInPolygon([11, 5], [outer, hole])).toBe(false)
  })

  it('開業日は最も古い値を精度に合わせて返す', () => {
    expect(earliestDate(['1903-04-01T00:00:00Z/11', '1885-03-01T00:00:00Z/11'])).toBe('1885-03-01')
    expect(earliestDate(['1874-01-01T00:00:00Z/9'])).toBe('1874')
    expect(earliestDate(['1931-03-01T00:00:00Z/10'])).toBe('1931-03')
    expect(earliestDate([])).toBe('')
  })

  it('英語名から検索用のローマ字を作り、電化方式の表記を短くする', () => {
    expect(romajiFromEnglish('Tōkyō Station')).toBe('tokyo')
    expect(romajiFromEnglish('Ōtsuka Station (Tokyo)')).toBe('otsuka')
    expect(shortElectrification('直流1500V鉄道電化')).toBe('直流1500V')
    expect(shortElectrification('三相交流による鉄道電化')).toBe('三相交流')
  })
})

describe('事業者の照合（車両・公式サイト）', () => {
  it('短い別名で別の会社に前方一致しない', () => {
    expect(isOperatorOf('JR東海交通事業', 'JR東')).toBe(false)
    expect(isOperatorOf('東日本旅客鉄道', '東日本旅客鉄道')).toBe(true)
    expect(isOperatorOf('東京都', '東京都交通局')).toBe(true)
  })

  it('公式サイトは優先ランク、なければ最も短いURL', () => {
    expect(
      pickWebsite([
        { url: 'https://www.tokyometro.jp/lang_es/', preferred: false },
        { url: 'https://www.tokyometro.jp/', preferred: false },
      ]),
    ).toBe('https://www.tokyometro.jp/')
    expect(
      pickWebsite([
        { url: 'https://a.jp/', preferred: false },
        { url: 'https://www.example.co.jp/', preferred: true },
      ]),
    ).toBe('https://www.example.co.jp/')
    expect(pickWebsite([])).toBe('')
  })
})

describe('Service Worker の保存ファイル一覧', () => {
  it('中身が同じなら版は同じ、変われば変わる', () => {
    const a = precacheManifest(new Map([['assets/a.js', 'x'], ['data/meta.json', '{}']]))
    const b = precacheManifest(new Map([['data/meta.json', '{}'], ['assets/a.js', 'x']]))
    const c = precacheManifest(new Map([['assets/a.js', 'y'], ['data/meta.json', '{}']]))
    expect(a.version).toBe(b.version)
    expect(a.version).not.toBe(c.version)
    expect(a.urls).toEqual(['./', './assets/a.js', './data/meta.json'])
  })
})

describe('照合の追加ルール', () => {
  it('社名の全角・半角や空白の違いを同じとみなす', () => {
    expect(sameOperator('WILLER　TRAINS', 'WILLER TRAINS')).toBe(true)
    expect(isOperatorOf('WILLER　TRAINS', 'WILLER TRAINS')).toBe(true)
  })

  it('廃止日は最も新しい値を使う', () => {
    expect(latestDate(['1983-03-22T00:00:00Z/11', '2026-04-01T00:00:00Z/11'])).toBe('2026-04-01')
    expect(latestDate([])).toBe('')
  })
})

describe('標高タイル', () => {
  it('画素の値を地理院の仕様どおり標高にする', () => {
    expect(demValue(0, 0x04, 0xd2)).toBeCloseTo(12.34)
    expect(demValue(0x80, 0, 0)).toBeNull()
    // 2^24 - 100 → -1.00m（海抜ゼロメートル地帯など）
    expect(demValue(0xff, 0xff, 0x9c)).toBeCloseTo(-1)
  })
  it('経緯度をタイル番号と画素位置にする', () => {
    // 東京駅付近、ズーム14
    expect(tilePixel(139.7671, 35.6812, 14)).toMatchObject({
      x: 14552,
      y: 6451,
    })
    const p = tilePixel(139.7671, 35.6812, 14)
    expect(p.px).toBeGreaterThanOrEqual(0)
    expect(p.px).toBeLessThan(256)
  })
  it('8bit RGB の PNG を読める', async () => {
    const { zlibSync } = await import('fflate')
    // 2×2画素。1行目はフィルタなし、2行目は上の画素との差分（Up）
    const raw = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 2, 1, 1, 1, 1, 1, 1])
    const chunk = (type: string, body: Uint8Array) => {
      const out = new Uint8Array(12 + body.length)
      new DataView(out.buffer).setUint32(0, body.length)
      out.set(
        [...type].map((c) => c.charCodeAt(0)),
        4,
      )
      out.set(body, 8)
      return out
    }
    const ihdr = new Uint8Array(13)
    new DataView(ihdr.buffer).setUint32(0, 2)
    new DataView(ihdr.buffer).setUint32(4, 2)
    ihdr.set([8, 2, 0, 0, 0], 8)
    const parts = [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlibSync(raw)),
      chunk('IEND', new Uint8Array()),
    ]
    const png = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
    let off = 0
    for (const p of parts) {
      png.set(p, off)
      off += p.length
    }
    const { width, rgb } = decodeRgbPng(png)
    expect(width).toBe(2)
    expect([...rgb]).toEqual([1, 2, 3, 4, 5, 6, 2, 3, 4, 5, 6, 7])
  })
  it('CSVの値をクォートする', () => {
    expect(csvRow(['a', 'b,c', 'd"e', 1])).toBe('a,"b,c","d""e",1')
  })
})
