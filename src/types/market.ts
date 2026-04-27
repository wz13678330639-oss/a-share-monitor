export type RiskProfile = 'low' | 'medium' | 'high'

export type ChartPeriod = 'minute' | 'day' | 'week' | 'month'

export type TradeAction =
  | '等待确认'
  | '观察支撑'
  | '回踩再接'
  | '分批低吸'
  | '继续筛选'
  | '观察放量'
  | '区间参与'
  | '顺势布局'
  | '只看不追'
  | '热点跟踪'
  | '加速试单'
  | '强势跟随'

export type DataSourceMode = 'live' | 'fallback'

export interface Candle {
  label: string
  open: number
  close: number
  low: number
  high: number
  volume: number
}

export interface StockFactors {
  newsHeat: number
  policyHeat: number
  capitalFlow: number
  trendStrength: number
  breakoutStrength: number
  volumeEnergy: number
  stability: number
  valuationSafety: number
  volatilityRisk: number
  relativeStrength: number
}

export interface StockSeed {
  symbol: string
  secid?: string
  name: string
  market?: string
  sector: string
  theme: string
  turnoverBillion: number
  hotRank: number
  tags: string[]
  headline: string
  drift: number
  sway: number
  seed: number
  basePrice: number
  factors: StockFactors
}

export interface MarketStock {
  symbol: string
  secid: string
  name: string
  market: string
  sector: string
  theme: string
  turnoverBillion: number
  hotRank: number
  tags: string[]
  headline: string
  factors: StockFactors
  price: number
  changePct: number
  volumeRatio: number
  amplitude: number
  open: number
  high: number
  low: number
  previousClose: number
  volume: number
  amount: number
  turnoverRate: number
  pe: number | null
  pb: number | null
  marketCap: number | null
  floatMarketCap: number | null
  mainNetInflow: number
  dataSource: string
  updatedAt: string
  candles: Candle[]
}

export interface DataSourceStatus {
  mode: DataSourceMode
  provider: string
  message: string
  updatedAt: string
  total: number
}

export interface SignalBreakdown {
  messageScore: number
  technicalScore: number
  stabilityScore: number
  profileFit: number
}

export interface TradeMarker {
  label: string
  value: number
  index: number
  kind: 'buy' | 'sell' | 'risk'
}

export interface TradePlan {
  entries: number[]
  targets: number[]
  stopLoss: number
  holdingWindow: string
  styleNote: string
  positionPct: number
  maxDrawdownPct: number
  markers: TradeMarker[]
}

export interface ScoredStock {
  symbol: string
  secid: string
  name: string
  market: string
  sector: string
  theme: string
  price: number
  changePct: number
  turnoverBillion: number
  volumeRatio: number
  amplitude: number
  hotRank: number
  headline: string
  tags: string[]
  overallScore: number
  riskScore: number
  winRate: number
  action: TradeAction
  confidenceLabel: string
  breakdown: SignalBreakdown
  tradePlan: TradePlan
  factors: StockFactors
  candles: Candle[]
  dataSource: string
  updatedAt: string
  narrative: string[]
}
