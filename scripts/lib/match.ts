/** Wikidata の路線項目 */
export interface WdLine {
  qid: string
  label: string
  aliases: string[]
  operators: string[]
  colors: string[]
}

export interface LineMatch {
  qid: string
  label: string
  /** label = 項目名と一致, alias = 別名と一致, suffix = 項目名の末尾と一致, manual = 人が確認した対応表 */
  how: 'label' | 'alias' | 'suffix' | 'manual'
}

/** 社名の表記ゆれ（全角・半角、空白）をそろえる。例: 国土数値情報の「WILLER（全角スペース）TRAINS」と Wikidata の「WILLER TRAINS」 */
const normalizeName = (name: string) => name.normalize('NFKC').replace(/\s+/g, '')

/** 国土数値情報の運営会社名と Wikidata の運営者名が同じ会社を指すか */
export function sameOperator(rawCompany: string, rawOperator: string): boolean {
  const company = normalizeName(rawCompany)
  const operator = normalizeName(rawOperator)
  if (!company || !operator) return false
  // 例: 国土数値情報「東京都」と Wikidata「東京都交通局」
  return company === operator || operator.startsWith(company) || company.startsWith(operator)
}

/**
 * 国土数値情報の路線名から、Wikidata で探すときの名前の候補を作る。
 * 元の名前に近いものほど先に並べる（照合ではこの順に優先する）。
 */
export function nameVariants(line: string): string[] {
  const names: string[] = [line]
  const add = (n: string) => {
    if (n && !names.includes(n)) names.push(n)
  }
  // 大阪メトロなどの「1号線(御堂筋線)」→「御堂筋線」
  const paren = /^(.+?)[(（](.+)[)）]$/.exec(line)
  if (paren) add(paren[2])
  // 東京メトロなどの「4号線丸ノ内線」→「丸ノ内線」
  add(line.replace(/^\d+号線(?=.+線$)/, ''))
  // JRの法令上の線名「東北線」→ 通称「東北本線」
  for (const n of [...names]) {
    if (n.endsWith('線') && !n.endsWith('本線') && !n.endsWith('新幹線')) add(n.slice(0, -1) + '本線')
  }
  return names
}

/**
 * 国土数値情報の1路線に対応する Wikidata 項目を探す。
 * 運営者が一致する項目に限り、項目名 > 別名 > 項目名の末尾 の順、各段階では元の名前に近い候補から順に探す。
 * 同じ段階・同じ候補で複数の項目に分かれたら、取り違えを避けて「該当なし」にする。
 */
export function matchLine(company: string, line: string, items: WdLine[]): LineMatch | null {
  const variants = nameVariants(line)
  const candidates = items.filter((it) => it.operators.some((op) => sameOperator(company, op)))
  const tiers: [LineMatch['how'], (it: WdLine, name: string) => boolean][] = [
    ['label', (it, name) => it.label === name],
    ['alias', (it, name) => it.aliases.includes(name)],
    ['suffix', (it, name) => name.length >= 2 && it.label.endsWith(name)],
  ]
  for (const [how, test] of tiers) {
    for (const name of variants) {
      const hits = candidates.filter((it) => test(it, name))
      const qids = new Set(hits.map((h) => h.qid))
      if (qids.size === 1) return { qid: hits[0].qid, label: hits[0].label, how }
      if (qids.size > 1) return null
    }
  }
  return null
}

/** 色の値を #RRGGBB にそろえる。1つに決まらない・形式が違う場合は null */
export function singleColor(colors: string[]): string | null {
  const valid = [...new Set(colors.map((c) => c.trim().toUpperCase()).filter((c) => /^[0-9A-F]{6}$/.test(c)))]
  return valid.length === 1 ? `#${valid[0]}` : null
}

/** "1872-10-14T00:00:00Z/11" のような値の中で最も古いものを、精度に応じて YYYY / YYYY-MM / YYYY-MM-DD で返す */
export function earliestDate(values: string[]): string {
  const dates = values
    .map((v) => {
      const [time, prec] = v.split('/')
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(time)
      if (!m) return null
      const p = Number(prec)
      const text = p >= 11 ? `${m[1]}-${m[2]}-${m[3]}` : p === 10 ? `${m[1]}-${m[2]}` : `${m[1]}`
      return { sort: time, text }
    })
    .filter((d): d is { sort: string; text: string } => d != null)
    .sort((a, b) => a.sort.localeCompare(b.sort))
  return dates[0]?.text ?? ''
}

/** earliestDate と同じ形式の値の中で最も新しいもの */
export function latestDate(values: string[]): string {
  const sorted = values
    .filter((v) => /^\d{4}-\d{2}-\d{2}/.test(v))
    .sort()
    .reverse()
  return sorted.length ? earliestDate([sorted[0]]) : ''
}

/** 「直流1500V鉄道電化」→「直流1500V」 */
export const shortElectrification = (label: string) => label.replace(/(による)?鉄道電化$/, '')

/** 英語名「Tōkyō Station」→ 検索用のローマ字「tokyo」 */
export function romajiFromEnglish(label: string): string {
  return label
    .replace(/\s*\(.*\)$/, '')
    .replace(/\s+(Station|Stop|Tram Stop)$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * 車両の運用事業者名が、このアプリの事業者（国土数値情報の運営会社名）を指すか。
 * 「JR東」のような短い別名が「JR東海交通事業」に前方一致しないよう、
 * 完全一致か「Wikidata 側の名前が事業者名で始まる」（例: 東京都 → 東京都交通局）だけを認める。
 */
export function isOperatorOf(rawCompany: string, rawOperator: string): boolean {
  const company = normalizeName(rawCompany)
  const operator = normalizeName(rawOperator)
  return company === operator || (operator.length > company.length && operator.startsWith(company))
}

/** 公式サイトが複数登録されているとき: 優先ランクの値、なければ最も短いURL（トップページのことが多い） */
export function pickWebsite(values: { url: string; preferred: boolean }[]): string {
  const preferred = values.filter((v) => v.preferred)
  const pool = preferred.length ? preferred : values
  return [...pool].sort((a, b) => a.url.length - b.url.length || a.url.localeCompare(b.url))[0]?.url ?? ''
}

/** Wikidata の画像（P18）の値「http://commons.wikimedia.org/wiki/Special:FilePath/X.jpg」からファイル名を取り出す */
export function commonsFileName(value: string): string {
  const m = /Special:FilePath\/(.+)$/.exec(value)
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : ''
}
