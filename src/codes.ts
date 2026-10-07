import type { CompanyType } from './types'

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  1: '新幹線',
  2: 'JR在来線',
  3: '公営鉄道',
  4: '民営鉄道',
  5: '第三セクター',
}

/** 国土数値情報「鉄道区分コード」（RailwayClassCd） */
export const RAIL_TYPE_LABELS: Record<string, string> = {
  '11': '普通鉄道（JR）',
  '12': '普通鉄道',
  '13': '鋼索鉄道（ケーブルカー）',
  '14': '懸垂式鉄道',
  '15': '跨座式鉄道',
  '16': '案内軌条式鉄道',
  '17': '無軌条鉄道（トロリーバス）',
  '21': '軌道（路面電車など）',
  '22': '懸垂式モノレール',
  '23': '跨座式モノレール',
  '24': '案内軌条式',
  '25': '浮上式',
}

/**
 * 補正表に公式の路線カラーが無い路線に使う、事業者種別ごとの既定色。
 * 公式の色ではないので、画面では「既定色」と分かるように扱う。
 */
export const DEFAULT_LINE_COLORS: Record<CompanyType, string> = {
  1: '#1f5fbf',
  2: '#2e8b57',
  3: '#e07b00',
  4: '#c2185b',
  5: '#7b4fb0',
}

/** 都道府県（全国地方公共団体コード順）と地方区分 */
export const REGIONS: { name: string; prefs: string[] }[] = [
  { name: '北海道', prefs: ['北海道'] },
  { name: '東北', prefs: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
  { name: '関東', prefs: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
  { name: '中部', prefs: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
  { name: '近畿', prefs: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
  { name: '中国', prefs: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'] },
  { name: '四国', prefs: ['徳島県', '香川県', '愛媛県', '高知県'] },
  { name: '九州・沖縄', prefs: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
]

export const PREFECTURES = REGIONS.flatMap((r) => r.prefs)
