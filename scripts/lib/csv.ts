/** 補正表用の小さなCSVパーサ。ダブルクォートで囲んだ値（カンマ・改行・"" を含む）に対応 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== '') && !r[0].startsWith('#'))
  if (nonEmpty.length === 0) return []
  const header = nonEmpty[0].map((h) => h.trim())
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}

const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
/** 1行分の値をCSVの行にする */
export const csvRow = (values: (string | number)[]) => values.map((v) => csvField(String(v))).join(',')
