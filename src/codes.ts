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
