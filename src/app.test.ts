import { describe, expect, it } from 'vitest'
import { textOn } from './format'
import { href, parseRoute } from './router'

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
