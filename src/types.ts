// データ生成スクリプト（scripts/build-data.ts）とアプリが共有する、公開データの型

export type BBox = [number, number, number, number]

/** 国土数値情報の事業者種別コード: 1=新幹線, 2=JR在来線, 3=公営鉄道, 4=民営鉄道, 5=第三セクター */
export type CompanyType = 1 | 2 | 3 | 4 | 5

export interface Source {
  id: string
  title: string
  /** データ詳細ページ */
  url: string
  license: string
  edition: string
  /** 取得日（YYYY-MM-DD） */
  retrievedAt: string
  /** 画面に出す出典表記 */
  credit: string
}

export interface Meta {
  generatedAt: string
  /** 乗降客数の年度（例: 2024 = 2024年度） */
  passengerYear: number | null
  sources: Source[]
  counts: { lines: number; stations: number; companies: number }
}

export interface Line {
  id: string
  /** 元データ上の路線名 */
  name: string
  /** 表示名（補正表に愛称・系統名があればそれ、なければ name） */
  displayName: string
  company: string
  companyType: CompanyType
  /** 国土数値情報の鉄道区分コード（"11" など） */
  railType: string
  shinkansen: boolean
  color: string
  /** override = 補正表, wikidata = Wikidata の路線色, default = 種別ごとの既定色 */
  colorSource: 'override' | 'wikidata' | 'default'
  /** 対応する Wikidata 項目（Q番号） */
  wikidata?: string
  /** ミニ新幹線などの通称区間: 実際に走る路線と区間（両端の駅名） */
  via?: { line: string; from: string; to: string }[]
  /** 開業日（Wikidata。精度に応じて YYYY / YYYY-MM / YYYY-MM-DD） */
  opened?: string
  /** 軌間（mm、Wikidata） */
  gaugeMm?: number[]
  /** 電化方式（Wikidata。例: 直流1500V, 非電化） */
  electrification?: string[]
  /** 通過する都道府県（駅の所在地から） */
  prefs: string[]
  /** 地図上の線形から計算した延長（営業キロではない） */
  lengthKm: number
  bbox: BBox
  /** 主経路に沿った駅の並び（駅ID） */
  stations: string[]
}

export interface PassengerRow {
  company: string
  line: string
  value: number
  remarks: string | null
}

export interface Station {
  id: string
  name: string
  lon: number
  lat: number
  lines: string[]
  /** 所在地（国土数値情報の行政区域から判定） */
  pref?: string
  city?: string
  /** 読み仮名（ひらがな、Wikidata） */
  kana?: string
  /** 検索用のローマ字（Wikidataの英語名から） */
  romaji?: string
  /** 開業日（Wikidata） */
  opened?: string
  wikidata?: string
  /** 最新年度の1日あたり乗降客数（駅としての合計）。非公開・データなしは null */
  passengers: number | null
  /** 直近の年度別推移 [年度, 乗降客数|null] */
  history: [number, number | null][]
  /** 最新年度の内訳（元データの代表行ごと） */
  breakdown: PassengerRow[]
}
