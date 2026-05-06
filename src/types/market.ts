export type RiskProfile = 'low' | 'medium' | 'high'

export type FocusPreset = 'defensive' | 'balanced' | 'aggressive'

export type UiDensity = 'comfortable' | 'compact'

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

export type DataSourceMode = 'live' | 'unavailable'

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
  profile: RiskProfile
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
  signalScore: number
  calibratedWinRate: number | null
  calibrationSamples: number
  winRate: number | null
  action: TradeAction
  confidenceLabel: string
  breakdown: SignalBreakdown
  tradePlan: TradePlan | null
  factors: StockFactors
  candles: Candle[]
  dataSource: string
  updatedAt: string
  narrative: string[]
}

export interface LearningRecord {
  id: string
  symbol: string
  name: string
  profile: RiskProfile
  signalScore: number
  entryPrice: number
  startedAt: string
  dueAt: string
  exitPrice: number | null
  resolvedAt: string | null
  returnPct: number | null
  success: boolean | null
}

export interface CalibrationBucket {
  profile: RiskProfile
  scoreMin: number
  scoreMax: number
  samples: number
  winRate: number
  avgReturnPct: number
}

export interface LearningCalibration {
  generatedAt: string
  provider: string
  horizonDays: number
  successReturnPct: number
  totalSamples: number
  buckets: CalibrationBucket[]
}

export interface UserProfile {
  id: string
  displayName: string
  riskProfile: RiskProfile
  focusPreset: FocusPreset
  density: UiDensity
  createdAt: string
  updatedAt: string
}
