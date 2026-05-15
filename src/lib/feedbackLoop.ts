import type { RiskProfile, ScoredStock } from '../types/market'

export type ReviewStatus = 'open' | 'reviewed'

export interface StrategyWeights {
  message: number
  technical: number
  stability: number
  profileFit: number
  riskPenalty: number
}

export interface PredictionRecord {
  id: string
  symbol: string
  name: string
  profile: RiskProfile
  tradeDate: string
  createdAt: string
  strategyVersion: string
  entryPrice: number
  winRate: number
  riskScore: number
  action: string
  targetPrice: number
  stopLoss: number
  horizons: number[]
  reviewStatus: ReviewStatus
  reviewedAt?: string
  currentPrice?: number
  realizedReturnPct?: number
  maxDrawdownPct?: number
  hit?: boolean
  verdict?: string
}

export interface PredictionBatch {
  strategyVersion: string
  records: PredictionRecord[]
}

export interface FeedbackMetrics {
  reviewedCount: number
  hitRate: number
  averageReturnPct: number
  maxDrawdownPct: number
}

export interface FeedbackReport extends FeedbackMetrics {
  profile: RiskProfile
  reviewDate: string
  reviewedRecords: PredictionRecord[]
  summary: string
  nextAction: string
}

const horizons = [1, 3, 5, 20]

export const defaultStrategyWeights: Record<RiskProfile, StrategyWeights> = {
  low: {
    message: 24,
    technical: 22,
    stability: 38,
    profileFit: 16,
    riskPenalty: 22,
  },
  medium: {
    message: 25,
    technical: 34,
    stability: 22,
    profileFit: 19,
    riskPenalty: 18,
  },
  high: {
    message: 23,
    technical: 43,
    stability: 12,
    profileFit: 22,
    riskPenalty: 14,
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function average(values: number[]) {
  if (!values.length) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildStrategyVersion(profile: RiskProfile, tradeDate: string) {
  return `${profile}-${tradeDate.replaceAll('-', '')}-v1`
}

function buildRecordId(profile: RiskProfile, tradeDate: string, symbol: string) {
  return `${profile}:${tradeDate}:${symbol}`
}

export function createPredictionBatch({
  picks,
  profile,
  tradeDate,
  createdAt,
}: {
  picks: ScoredStock[]
  profile: RiskProfile
  tradeDate: string
  createdAt: string
}): PredictionBatch {
  const strategyVersion = buildStrategyVersion(profile, tradeDate)

  return {
    strategyVersion,
    records: picks.map((pick) => ({
      id: buildRecordId(profile, tradeDate, pick.symbol),
      symbol: pick.symbol,
      name: pick.name,
      profile,
      tradeDate,
      createdAt,
      strategyVersion,
      entryPrice: pick.price,
      winRate: pick.winRate,
      riskScore: pick.riskScore,
      action: pick.action,
      targetPrice: pick.tradePlan.targets[0],
      stopLoss: pick.tradePlan.stopLoss,
      horizons,
      reviewStatus: 'open',
    })),
  }
}

function reviewRecord(
  record: PredictionRecord,
  currentPrice: number,
  reviewDate: string,
): PredictionRecord {
  const realizedReturnPct = round(
    ((currentPrice - record.entryPrice) / Math.max(record.entryPrice, 0.01)) *
      100,
  )
  const stopDistancePct = round(
    ((record.entryPrice - record.stopLoss) / Math.max(record.entryPrice, 0.01)) *
      100,
  )
  const targetReturnPct = round(
    ((record.targetPrice - record.entryPrice) /
      Math.max(record.entryPrice, 0.01)) *
      100,
  )
  const hit =
    realizedReturnPct >= Math.max(1.2, targetReturnPct * 0.32) &&
    currentPrice > record.stopLoss
  const verdict = hit
    ? '走势符合预期，信号保留'
    : realizedReturnPct <= -stopDistancePct
      ? '触及风控，降低同类权重'
      : '未达预期，等待更多样本确认'

  return {
    ...record,
    currentPrice,
    realizedReturnPct,
    maxDrawdownPct: realizedReturnPct < 0 ? Math.abs(realizedReturnPct) : 0,
    hit,
    verdict,
    reviewStatus: 'reviewed',
    reviewedAt: `${reviewDate}T16:30:00.000+08:00`,
  }
}

export function buildFeedbackReport({
  records,
  currentPrices,
  reviewDate,
  profile,
}: {
  records: PredictionRecord[]
  currentPrices: Map<string, number>
  reviewDate: string
  profile: RiskProfile
}): FeedbackReport {
  const reviewedRecords = records
    .filter((record) => record.profile === profile)
    .map((record) => {
      const currentPrice = currentPrices.get(record.symbol)

      if (!currentPrice) {
        return record
      }

      return reviewRecord(record, currentPrice, reviewDate)
    })
    .filter((record) => record.reviewStatus === 'reviewed')

  const reviewedCount = reviewedRecords.length
  const hitRate = round(
    reviewedCount
      ? (reviewedRecords.filter((record) => record.hit).length / reviewedCount) *
          100
      : 0,
    1,
  )
  const averageReturnPct = round(
    average(reviewedRecords.map((record) => record.realizedReturnPct ?? 0)),
  )
  const maxDrawdownPct = round(
    Math.max(0, ...reviewedRecords.map((record) => record.maxDrawdownPct ?? 0)),
  )
  const summary = reviewedCount
    ? `复盘 ${reviewedCount} 条预测，命中率 ${hitRate}%，平均收益 ${averageReturnPct}%，最大回撤 ${maxDrawdownPct}%。`
    : '复盘样本不足，等待收盘后的实时价格写入。'
  const nextAction =
    hitRate >= 65 && averageReturnPct > 0
      ? '保留当前策略方向，略微提高趋势和消息确认权重。'
      : maxDrawdownPct >= 5
        ? '收紧风控阈值，降低高波动标的权重。'
        : '维持观察，继续积累样本后再调整。'

  return {
    profile,
    reviewDate,
    reviewedRecords,
    reviewedCount,
    hitRate,
    averageReturnPct,
    maxDrawdownPct,
    summary,
    nextAction,
  }
}

export function tuneStrategyWeights(
  weights: StrategyWeights,
  metrics: FeedbackMetrics,
): StrategyWeights {
  if (!metrics.reviewedCount) {
    return weights
  }

  const goodFeedback = metrics.hitRate >= 60 && metrics.averageReturnPct > 0
  const drawdownPressure = metrics.maxDrawdownPct >= 5

  return {
    message: clamp(
      round(weights.message + (goodFeedback ? 1.5 : -1), 1),
      5,
      60,
    ),
    technical: clamp(
      round(weights.technical + (goodFeedback ? 2 : -1), 1),
      5,
      60,
    ),
    stability: clamp(
      round(weights.stability + (drawdownPressure ? 2.5 : 0.5), 1),
      5,
      60,
    ),
    profileFit: clamp(round(weights.profileFit + 0.5, 1), 5, 60),
    riskPenalty: clamp(
      round(weights.riskPenalty + (drawdownPressure ? 2 : -0.5), 1),
      5,
      60,
    ),
  }
}

export function mergeReviewedRecords(
  existing: PredictionRecord[],
  reviewed: PredictionRecord[],
) {
  const reviewedById = new Map(reviewed.map((record) => [record.id, record]))

  return existing.map((record) => reviewedById.get(record.id) ?? record)
}
