import { describe, expect, it } from 'vitest'
import { textOn } from './format'
import { href, parseRoute } from './router'
import { normalize } from './search'
import { dateKey, formatDate, rank } from './rankings'

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
