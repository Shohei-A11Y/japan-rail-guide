import { describe, expect, it } from 'vitest'
import { textOn } from './format'
import { href, parseRoute } from './router'
import { normalize } from './search'
import { dateKey, formatDate, rank } from './rankings'
import { describeLine, describeStation } from './describe'
import { parseCommons, parseSummary, stripHtml } from './wiki'
import type { Station } from './types'

describe('router', () => {
  it('ハッシュからページを判定する', () => {
    expect(parseRoute('')).toEqual({ page: 'home' })
    expect(parseRoute('#/')).toEqual({ page: 'home' })
    expect(parseRoute('#/line/L0abc')).toEqual({ page: 'line', id: 'L0abc' })
    expect(parseRoute('#/station/S1xc1bvq')).toEqual({ page: 'station', id: 'S1xc1bvq' })
    expect(parseRoute('#/lines')).toEqual({ page: 'lines' })
    expect(parseRoute('#/about')).toEqual({ page: 'about' })
    expect(parseRoute('#/unknown/x')).toEqual({ page: 'notfound' })
  })

  it('href で作ったURLを parseRoute で戻せる', () => {
    expect(parseRoute(href.station('S1-2'))).toEqual({ page: 'station', id: 'S1-2' })
    expect(parseRoute(href.line('L00'))).toEqual({ page: 'line', id: 'L00' })
  })
})

describe('textOn', () => {
  it('明るい色には黒、暗い色には白の文字を選ぶ', () => {
    expect(textOn('#ffd400')).toBe('#111111')
    expect(textOn('#1f5fbf')).toBe('#ffffff')
  })
})

describe('search の正規化', () => {
  it('カタカナ・全角・大文字・長音記号・ヘボン式の揺れを吸収する', () => {
    expect(normalize('シンジュク')).toBe(normalize('しんじゅく'))
    expect(normalize('ＴＯＫＹＯ')).toBe('tokyo')
    expect(normalize('Tōkyō')).toBe('tokyo')
    expect(normalize('Nihombashi')).toBe(normalize('nihonbashi'))
    expect(normalize('新宿駅')).toBe('新宿')
  })

  it('検索ページなど新しいルートを読める', () => {
    expect(parseRoute('#/search?q=%E6%96%B0%E5%AE%BF')).toEqual({ page: 'search', q: '新宿' })
    expect(parseRoute(href.search('しぶや'))).toEqual({ page: 'search', q: 'しぶや' })
    expect(parseRoute(href.pref('東京都'))).toEqual({ page: 'pref', name: '東京都' })
    expect(parseRoute('#/prefs')).toEqual({ page: 'prefs' })
    expect(parseRoute('#/rankings')).toEqual({ page: 'rankings' })
  })
})

describe('rankings', () => {
  it('値の無いものを除いて上位を返す', () => {
    const items = [{ v: 3 }, { v: null }, { v: 10 }, { v: 1 }]
    expect(rank(items, (x) => x.v, 2).map((x) => x.v)).toEqual([10, 3])
    expect(rank(items, (x) => x.v, 2, 'asc').map((x) => x.v)).toEqual([1, 3])
  })

  it('精度の違う日付を古い順に並べられる', () => {
    expect(dateKey('1872')! < dateKey('1872-10-14')!).toBe(true)
    expect(dateKey('1871-12')! < dateKey('1872')!).toBe(true)
    expect(dateKey(undefined)).toBeNull()
    expect(formatDate('1872-10-14')).toBe('1872年10月14日')
    expect(formatDate('1874')).toBe('1874年')
  })
})

describe('紹介文と外部情報の解釈', () => {
  const line = {
    id: 'L1',
    name: '東北線',
    displayName: '東北本線',
    company: '東日本旅客鉄道',
    companyType: 2 as const,
    railType: '11',
    shinkansen: false,
    color: '#3CB371',
    colorSource: 'wikidata' as const,
    opened: '1883-07-28',
    prefs: ['東京都', '埼玉県', '岩手県'],
    lengthKm: 500,
    bbox: [0, 0, 1, 1] as [number, number, number, number],
    stations: ['A', 'B'],
  }
  const station = (id: string, name: string): Station => ({ id, name, lon: 0, lat: 0, lines: ['L1'], passengers: null })
  const data = {
    meta: { generatedAt: '', passengerYear: 2024, sources: [], counts: { lines: 1, stations: 2, companies: 1, vehicles: 0 } },
    lines: new Map([['L1', line]]),
    stations: new Map([
      ['A', station('A', '東京')],
      ['B', { ...station('B', '盛岡'), pref: '岩手県', city: '盛岡市', passengers: 12345 }],
    ]),
    companies: new Map(),
    vehicles: new Map(),
  }

  it('路線の紹介文は持っている値だけで作る', () => {
    expect(describeLine(line, data)).toBe(
      '東北本線は、東日本旅客鉄道が運営するJR在来線の路線。東京都から岩手県まで3都道府県を通る。東京〜盛岡の2駅。1883年7月28日開業。',
    )
    expect(describeLine({ ...line, opened: undefined, prefs: ['東京都'] }, data)).not.toContain('開業')
  })

  it('駅の紹介文', () => {
    expect(describeStation(data.stations.get('B')!, data)).toBe(
      '盛岡駅は、岩手県盛岡市にある東日本旅客鉄道の駅。東北本線の駅。2024年度の1日の乗降客数は12,345人。',
    )
  })

  it('Wikipedia の要約は曖昧さ回避や本文なしを除く', () => {
    expect(
      parseSummary({ type: 'standard', title: '東京駅', extract: '東京駅は…', content_urls: { desktop: { page: 'https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC%E9%A7%85' } } }),
    ).toEqual({ title: '東京駅', extract: '東京駅は…', url: 'https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC%E9%A7%85' })
    expect(parseSummary({ type: 'disambiguation', title: '府中駅', extract: '…' })).toBeNull()
    expect(parseSummary(null)).toBeNull()
  })

  it('Commons の画像は作者とライセンスが分かるときだけ使う', () => {
    const page = (meta: Record<string, { value: string }>) => ({
      query: { pages: { '1': { imageinfo: [{ thumburl: 'https://upload/x.jpg', descriptionurl: 'https://commons/x', extmetadata: meta }] } } },
    })
    expect(
      parseCommons(page({ Artist: { value: '<a href="/wiki/User:X">山田 太郎</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } })),
    ).toEqual({ thumbUrl: 'https://upload/x.jpg', pageUrl: 'https://commons/x', artist: '山田 太郎', license: 'CC BY-SA 4.0' })
    expect(parseCommons(page({ Artist: { value: 'X' } }))).toBeNull()
    expect(parseCommons({})).toBeNull()
  })

  it('HTML の作者表記から文字だけを取り出す', () => {
    expect(stripHtml('<span>A &amp; B</span>\n <i>C</i>')).toBe('A & B C')
  })
})
