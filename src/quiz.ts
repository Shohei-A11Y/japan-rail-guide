import type { Station } from './types'

/** 0以上1未満の乱数（テストでは決まった列を渡す） */
export type Rng = () => number

const pickOne = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)]

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const HIRAGANA = /^[ぁ-ゟー]+$/
const KANJI_NAME = /^[一-鿿々ヶ]+$/

/**
 * 読み方クイズに出せる駅: 名前が漢字だけで、読み仮名がひらがなだけの駅。
 * 同じ名前で読みが2通り以上ある駅は、正解が1つに決まらないので出さない。
 */
export function quizPool(stations: Iterable<Station>): Station[] {
  const readings = new Map<string, Set<string>>()
  const first = new Map<string, Station>()
  for (const s of stations) {
    if (!s.kana || !HIRAGANA.test(s.kana) || !KANJI_NAME.test(s.name)) continue
    if (!readings.has(s.name)) readings.set(s.name, new Set())
    readings.get(s.name)!.add(s.kana)
    // 同名の駅は乗降客数の多い方を代表にする
    const cur = first.get(s.name)
    if (!cur || (s.passengers ?? -1) > (cur.passengers ?? -1)) first.set(s.name, s)
  }
  return [...first.values()].filter((s) => readings.get(s.name)!.size === 1)
}

// 濁点・半濁点の付け外し（「おやしらず」→「おやじらず」のような紛らわしい選択肢を作る）。ぢ・づは不自然なので使わない
const VOICING: Record<string, string[]> = {}
const pairs = [
  'かが',
  'きぎ',
  'くぐ',
  'けげ',
  'こご',
  'さざ',
  'しじ',
  'すず',
  'せぜ',
  'そぞ',
  'ただ',
  'てで',
  'とど',
  'はばぱ',
  'ひびぴ',
  'ふぶぷ',
  'へべぺ',
  'ほぼぽ',
]
for (const p of pairs) for (const c of p) VOICING[c] = [...p].filter((x) => x !== c)

/** 読みの1文字だけ濁点を付け外しした、ありそうで違う読み */
export function voicingVariants(kana: string): string[] {
  const out = new Set<string>()
  ;[...kana].forEach((c, i) => {
    for (const v of VOICING[c] ?? []) out.add([...kana].map((x, k) => (k === i ? v : x)).join(''))
  })
  out.delete(kana)
  return [...out]
}

export interface Question {
  station: Station
  /** 4つの選択肢（読み） */
  choices: string[]
  answer: number
}

/**
 * 1問作る。誤りの選択肢は、(1) 濁点を付け外しした読み、(2) 同じ漢字を含むほかの駅の読み、
 * (3) 文字数の近いほかの駅の読み、の順に集める。
 */
export function makeQuestion(pool: Station[], rng: Rng, exclude: Set<string> = new Set()): Question | null {
  const candidates = pool.filter((s) => !exclude.has(s.id))
  if (candidates.length === 0 || pool.length < 4) return null
  const station = pickOne(candidates, rng)
  const answer = station.kana!
  const wrong = new Set<string>()
  const add = (k: string) => {
    if (wrong.size < 3 && k !== answer) wrong.add(k)
  }
  const voiced = voicingVariants(answer)
  if (voiced.length) add(pickOne(voiced, rng))
  const chars = new Set(station.name)
  const sharing = shuffle(
    pool.filter(
      (s) =>
        s.id !== station.id &&
        Math.abs([...s.kana!].length - [...answer].length) <= 2 &&
        [...s.name].some((c) => chars.has(c)),
    ),
    rng,
  )
  for (const s of sharing) add(s.kana!)
  const len = [...answer].length
  const similar = shuffle(
    pool.filter((s) => Math.abs([...s.kana!].length - len) <= 1),
    rng,
  )
  for (const s of similar) add(s.kana!)
  if (wrong.size < 3) return null
  const choices = shuffle([answer, ...wrong], rng)
  return { station, choices, answer: choices.indexOf(answer) }
}

// --- 駅名しりとり ---
/** しりとりに使える駅: 読み仮名がひらがなだけの駅（同じ読みは1駅にまとめる） */
export function kanaPool(stations: Iterable<Station>): Station[] {
  const byKana = new Map<string, Station>()
  for (const s of stations) {
    if (!s.kana || !HIRAGANA.test(s.kana)) continue
    const cur = byKana.get(s.kana)
    if (!cur || (s.passengers ?? -1) > (cur.passengers ?? -1)) byKana.set(s.kana, s)
  }
  return [...byKana.values()]
}

const SMALL: Record<string, string> = {
  ぁ: 'あ',
  ぃ: 'い',
  ぅ: 'う',
  ぇ: 'え',
  ぉ: 'お',
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
  っ: 'つ',
  ゎ: 'わ',
}

/** しりとりで次の言葉が始まるべき文字（小さい字は大きく、長音は1つ前の字） */
export function lastSound(kana: string): string {
  const chars = [...kana].filter((c) => c !== 'ー')
  const c = chars[chars.length - 1] ?? ''
  return SMALL[c] ?? c
}

/**
 * start から駅名しりとりを続ける。同じ読みは2度使わず、「ん」で終わる駅は最後にしか選ばない。
 * つなげる駅が無くなるか max 駅に達したら終わる。
 */
export function shiritori(pool: Station[], start: Station, rng: Rng, max = 15): Station[] {
  const byHead = new Map<string, Station[]>()
  for (const s of pool) {
    const head = [...s.kana!][0]
    if (!byHead.has(head)) byHead.set(head, [])
    byHead.get(head)!.push(s)
  }
  const chain = [start]
  const used = new Set([start.kana])
  while (chain.length < max) {
    const tail = lastSound(chain[chain.length - 1].kana!)
    if (tail === 'ん') break
    const next = (byHead.get(tail) ?? []).filter((s) => !used.has(s.kana))
    if (next.length === 0) break
    const safe = next.filter((s) => lastSound(s.kana!) !== 'ん')
    const s = pickOne(safe.length ? safe : next, rng)
    chain.push(s)
    used.add(s.kana)
  }
  return chain
}
