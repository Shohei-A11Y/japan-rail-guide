export const formatNumber = (n: number) => n.toLocaleString('ja-JP')

export const formatKm = (km: number) => `${km.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} km`

/** 白と黒のどちらの文字が背景色の上で読みやすいか（WCAGの相対輝度で判定） */
export function textOn(hex: string): '#ffffff' | '#111111' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#ffffff'
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.179 ? '#111111' : '#ffffff'
}
