import { unzlibSync } from 'fflate'

/** 地理院タイルの標高タイル（PNG）。精度の高いものから順に使う */
export const DEM_TILES = [
  { id: 'DEM5A', zoom: 15, url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png' },
  { id: 'DEM10B', zoom: 14, url: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png' },
] as const

/** 経緯度 → タイル番号と、タイル内の画素位置（256×256） */
export function tilePixel(lon: number, lat: number, zoom: number) {
  const n = 2 ** zoom
  const fx = ((lon + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  const x = Math.floor(fx)
  const y = Math.floor(fy)
  return { x, y, px: Math.min(255, Math.floor((fx - x) * 256)), py: Math.min(255, Math.floor((fy - y) * 256)) }
}

/**
 * 標高PNGの1画素を標高（m）にする。地理院の仕様:
 * x = R×2^16 + G×2^8 + B、x < 2^23 なら x×0.01、x = 2^23 は値なし、x > 2^23 なら (x − 2^24)×0.01
 */
export function demValue(r: number, g: number, b: number): number | null {
  const x = r * 65536 + g * 256 + b
  if (x === 2 ** 23) return null
  return (x < 2 ** 23 ? x : x - 2 ** 24) * 0.01
}

/** 8bit RGB・インターレースなしの PNG を、画素ごとに RGB の並んだ配列にする（地理院の標高タイルの形式） */
export function decodeRgbPng(png: Uint8Array): { width: number; height: number; rgb: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let pos = 8
  let width = 0
  let height = 0
  const idat: Uint8Array[] = []
  while (pos < png.length) {
    const len = view.getUint32(pos)
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8))
    const body = png.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8)
      height = view.getUint32(pos + 12)
      const [depth, color, , , interlace] = body.subarray(8, 13)
      if (depth !== 8 || color !== 2 || interlace !== 0) throw new Error(`未対応のPNG形式 depth=${depth} color=${color}`)
    } else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const joined = new Uint8Array(idat.reduce((s, c) => s + c.length, 0))
  let off = 0
  for (const c of idat) {
    joined.set(c, off)
    off += c.length
  }
  const raw = unzlibSync(joined)
  const stride = width * 3
  const rgb = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = y * stride
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? rgb[row + i - 3] : 0
      const b = y > 0 ? rgb[row - stride + i] : 0
      const c = i >= 3 && y > 0 ? rgb[row - stride + i - 3] : 0
      let p: number
      if (filter === 0) p = 0
      else if (filter === 1) p = a
      else if (filter === 2) p = b
      else if (filter === 3) p = (a + b) >> 1
      else {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      rgb[row + i] = (src[i] + p) & 0xff
    }
  }
  return { width, height, rgb }
}
