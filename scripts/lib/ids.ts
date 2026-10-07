/** FNV-1a 32bit。データ更新をまたいで同じ入力から同じIDを作るための安定ハッシュ */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(input)) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function short(input: string): string {
  return fnv1a(input).toString(36).padStart(7, '0')
}

/** 路線ID: 事業者名＋路線名から作る */
export function lineId(company: string, line: string): string {
  return 'L' + short(`${company}|${line}`)
}

/**
 * 駅ID: 駅名＋代表座標（小数2桁≒1km格子）から作る。
 * 駅位置の小さな修正ではIDが変わらないようにするため、座標は粗く丸める。
 */
export function stationId(name: string, lon: number, lat: number): string {
  return 'S' + short(`${name}|${lat.toFixed(2)}|${lon.toFixed(2)}`)
}

/** 同じIDが既に使われていたら連番を付けて一意にする */
export function uniqueId(base: string, used: Set<string>): string {
  let id = base
  for (let i = 2; used.has(id); i++) id = `${base}-${i}`
  used.add(id)
  return id
}
