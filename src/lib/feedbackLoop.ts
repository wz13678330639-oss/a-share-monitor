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

export interface FeatureWeights {
  message: number
  technical: number
  stability: number
  profileFit: number
  riskControl: number
}

export interface OnlineModel {
  profile: RiskProfile
  version: string
  mode: 'warmup' | 'active'
  sampleCount: number
  trainingRounds: number
  featureWeights: FeatureWeights
  winRateAdjustment: number
  lastTrainedAt: string
  summary: string
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

function normalizeFeatureWeights(weights: FeatureWeights): FeatureWeights {
  const positive = {
    message: Math.max(0, weights.message),
    technical: Math.max(0, weights.technical),
    stability: Math.max(0, weights.stability),
    profileFit: Math.max(0, weights.profileFit),
    riskControl: Math.max(0, weights.riskControl),
  }
  const total =
    positive.message +
    positive.technical +
    positive.stability +
    positive.profileFit +
    positive.riskControl

  if (!total) {
    return {
      message: 0.2,
      technical: 0.28,
      stability: 0.2,
      profileFit: 0.18,
      riskControl: 0.14,
    }
  }

  return {
    message: round(positive.message / total, 3),
    technical: round(positive.technical / total, 3),
    stability: round(positive.stability / total, 3),
    profileFit: round(positive.profileFit / total, 3),
    riskControl: round(positive.riskControl / total, 3),
  }
}

function weightsToFeatures(weights: StrategyWeights): FeatureWeights {
  return normalizeFeatureWeights({
    message: weights.message,
    technical: weights.technical,
    stability: weights.stability,
    profileFit: weights.profileFit,
    riskControl: weights.riskPenalty,
  })
}

export function trainOnlineModel({
  previousModel,
  reviewedRecords,
  baseWeights,
  profile,
}: {
  previousModel: OnlineModel | null
  reviewedRecords: PredictionRecord[]
  baseWeights: StrategyWeights
  profile: RiskProfile
}): OnlineModel {
  const sampleCount = reviewedRecords.length
  const trainingRounds = (previousModel?.trainingRounds ?? 0) + 1
  const previousWeights = previousModel?.featureWeights ?? weightsToFeatures(baseWeights)

  if (!sampleCount) {
    return {
      profile,
      version: `${profile}-model-r${trainingRounds}`,
      mode: 'warmup',
      sampleCount: 0,
      trainingRounds,
      featureWeights: previousWeights,
      winRateAdjustment: 0,
      lastTrainedAt: new Date().toISOString(),
      summary: '暂无已复盘样本，模型训练等待真实反馈。',
    }
  }

  const hitRate =
    reviewedRecords.filter((record) => record.hit).length / sampleCount
  const averageReturn = average(
    reviewedRecords.map((record) => record.realizedReturnPct ?? 0),
  )
  const averageDrawdown = average(
    reviewedRecords.map((record) => record.maxDrawdownPct ?? 0),
  )
  const averageRisk = average(reviewedRecords.map((record) => record.riskScore))
  const averageWinRate = average(reviewedRecords.map((record) => record.winRate))
  const learningRate = sampleCount < 20 ? 0.08 : 0.18
  const qualitySignal = clamp(hitRate * 100 + averageReturn * 4 - averageDrawdown * 3, 0, 100)
  const technicalDelta = qualitySignal >= 58 ? learningRate : -learningRate * 0.6
  const riskDelta = averageDrawdown >= 4 || averageRisk >= 62 ? learningRate : -learningRate * 0.35
  const stabilityDelta = averageDrawdown >= 4 ? learningRate * 0.8 : learningRate * 0.25
  const messageDelta = averageReturn > 0 ? learningRate * 0.45 : -learningRate * 0.3
  const profileDelta =
    Math.abs(averageWinRate - qualitySignal) <= 18
      ? learningRate * 0.35
      : -learningRate * 0.25

  const featureWeights = normalizeFeatureWeights({
    message: previousWeights.message + messageDelta,
    technical: previousWeights.technical + technicalDelta,
    stability: previousWeights.stability + stabilityDelta,
    profileFit: previousWeights.profileFit + profileDelta,
    riskControl: previousWeights.riskControl + riskDelta,
  })
  const rawAdjustment = (hitRate - 0.5) * 10 + averageReturn * 0.65 - averageDrawdown * 0.35
  const winRateAdjustment = round(
    clamp(rawAdjustment, sampleCount < 20 ? -4 : -8, sampleCount < 20 ? 4 : 8),
    1,
  )
  const mode = sampleCount < 20 ? 'warmup' : 'active'
  const direction =
    winRateAdjustment > 0
      ? '提高同类信号胜率修正'
      : winRateAdjustment < 0
        ? '降低同类信号胜率修正'
        : '保持胜率修正不变'

  return {
    profile,
    version: `${profile}-model-r${trainingRounds}`,
    mode,
    sampleCount,
    trainingRounds,
    featureWeights,
    winRateAdjustment,
    lastTrainedAt: new Date().toISOString(),
    summary: `训练 ${sampleCount} 条复盘样本，命中率 ${round(hitRate * 100, 1)}%，平均收益 ${round(averageReturn)}%，${direction}。`,
  }
}
