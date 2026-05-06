import type {
  Candle,
  LearningCalibration,
  MarketStock,
  LearningRecord,
  RiskProfile,
  ScoredStock,
  SignalBreakdown,
  TradeAction,
  TradeMarker,
  TradePlan,
} from '../types/market'

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, precision = 0) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function average(values: number[]) {
  if (!values.length) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function resolveAction(overallScore: number, profile: RiskProfile): TradeAction {
  if (profile === 'low') {
    if (overallScore >= 88) return '分批低吸'
    if (overallScore >= 79) return '回踩再接'
    if (overallScore >= 70) return '观察支撑'
    return '等待确认'
  }

  if (profile === 'medium') {
    if (overallScore >= 88) return '顺势布局'
    if (overallScore >= 79) return '区间参与'
    if (overallScore >= 70) return '观察放量'
    return '继续筛选'
  }

  if (overallScore >= 88) return '强势跟随'
  if (overallScore >= 79) return '加速试单'
  if (overallScore >= 70) return '热点跟踪'
  return '只看不追'
}

function resolveConfidence(winRate: number | null, samples: number) {
  if (winRate === null || samples < 30) return '样本不足'
  if (winRate >= 86) return '校准偏高'
  if (winRate >= 78) return '值得跟踪'
  if (winRate >= 70) return '有待确认'
  return '信号一般'
}

function findLevels(candles: Candle[]) {
  const recent = candles.slice(-10)
  if (recent.length < 5) {
    return {
      support: 0,
      resistance: 0,
      ma5: 0,
      ma10: 0,
    }
  }

  const support = Math.min(...recent.map((item) => item.low))
  const resistance = Math.max(...recent.map((item) => item.high))
  const ma5 = average(candles.slice(-5).map((item) => item.close))
  const ma10 = average(recent.map((item) => item.close))

  return {
    support: round(support || 0, 2),
    resistance: round(resistance || 0, 2),
    ma5: round(ma5, 2),
    ma10: round(ma10, 2),
  }
}

function buildProfileFit(stock: MarketStock, profile: RiskProfile) {
  const desiredVolatility =
    profile === 'low' ? 24 : profile === 'medium' ? 48 : 72
  const volatilityFit =
    100 - Math.abs(stock.factors.volatilityRisk - desiredVolatility) * 1.35
  const messageBias =
    profile === 'high'
      ? stock.factors.newsHeat * 0.26 + stock.factors.capitalFlow * 0.24
      : stock.factors.policyHeat * 0.2 + stock.factors.capitalFlow * 0.2
  const styleBias =
    profile === 'low'
      ? stock.factors.stability * 0.42 +
        stock.factors.valuationSafety * 0.24 +
        stock.factors.trendStrength * 0.12
      : profile === 'medium'
        ? stock.factors.trendStrength * 0.22 +
          stock.factors.breakoutStrength * 0.18 +
          stock.factors.stability * 0.18
        : stock.factors.breakoutStrength * 0.34 +
          stock.factors.relativeStrength * 0.26 +
          stock.factors.volumeEnergy * 0.14

  return clamp(round(volatilityFit * 0.34 + messageBias * 0.24 + styleBias, 0))
}

function buildBreakdown(stock: MarketStock, profile: RiskProfile): SignalBreakdown {
  const messageScore = round(
    stock.factors.newsHeat * 0.44 +
      stock.factors.policyHeat * 0.28 +
      stock.factors.capitalFlow * 0.28,
  )
  const technicalScore = round(
    stock.factors.trendStrength * 0.26 +
      stock.factors.breakoutStrength * 0.28 +
      stock.factors.volumeEnergy * 0.18 +
      stock.factors.relativeStrength * 0.28,
  )
  const stabilityScore = round(
    stock.factors.stability * 0.46 +
      stock.factors.valuationSafety * 0.32 +
      (100 - stock.factors.volatilityRisk) * 0.22,
  )

  return {
    messageScore,
    technicalScore,
    stabilityScore,
    profileFit: buildProfileFit(stock, profile),
  }
}

function resolvePositionPct(
  profile: RiskProfile,
  signalScore: number,
  riskScore: number,
) {
  const base = profile === 'low' ? 18 : profile === 'medium' ? 28 : 36
  const signalBoost = Math.max(0, signalScore - 70) * 0.42
  const riskPenalty = Math.max(0, riskScore - 45) * 0.48
  const cap = profile === 'low' ? 35 : profile === 'medium' ? 50 : 65

  return clamp(round(base + signalBoost - riskPenalty), 5, cap)
}

export function buildTradePlan(
  stock: MarketStock,
  profile: RiskProfile,
  signalScore = 72,
  riskScore = 45,
): TradePlan | null {
  if (stock.candles.length < 5) {
    return null
  }

  const current = stock.candles.at(-1)?.close ?? stock.price
  const { support, resistance } = findLevels(stock.candles)
  const safeSupport = support || current * 0.96
  const safeResistance = Math.max(resistance || current * 1.04, current * 1.01)
  const nearLow = round(Math.max(safeSupport * 1.008, current * 0.982), 2)
  const nearClose = round(current * 0.998, 2)
  const chaseLine = round(current * 1.007, 2)

  const entries =
    profile === 'low'
      ? [nearLow, round(safeSupport * 1.018, 2)]
      : profile === 'medium'
        ? [nearClose, round((safeSupport + current) / 2, 2)]
        : [chaseLine, nearClose]

  const targets =
    profile === 'low'
      ? [round(current * 1.045, 2), round(safeResistance * 1.012, 2)]
      : profile === 'medium'
        ? [round(current * 1.062, 2), round(safeResistance * 1.028, 2)]
        : [round(current * 1.085, 2), round(safeResistance * 1.056, 2)]

  const stopLoss =
    profile === 'low'
      ? round(safeSupport * 0.973, 2)
      : profile === 'medium'
        ? round(safeSupport * 0.964, 2)
        : round(current * 0.952, 2)

  const markerBase = Math.max(stock.candles.length - 1, 1)
  const markers: TradeMarker[] = [
    {
      label: '试仓买点',
      value: entries[0],
      index: Math.max(markerBase - 5, 0),
      kind: 'buy',
    },
    {
      label: '二次确认',
      value: entries[1],
      index: Math.max(markerBase - 3, 0),
      kind: 'buy',
    },
    {
      label: '止盈观察',
      value: targets[0],
      index: Math.max(markerBase - 1, 0),
      kind: 'sell',
    },
    {
      label: '风控线',
      value: stopLoss,
      index: Math.max(markerBase - 2, 0),
      kind: 'risk',
    },
  ]

  return {
    entries,
    targets,
    stopLoss,
    holdingWindow:
      profile === 'low'
        ? '5-12个交易日'
        : profile === 'medium'
          ? '3-8个交易日'
          : '1-5个交易日',
    styleNote:
      profile === 'low'
        ? '等待回踩支撑区分批布局，优先保护回撤。'
        : profile === 'medium'
          ? '顺着趋势在回踩确认时参与，保留机动仓位。'
          : '只在强势延续时跟随，失速即撤。',
    positionPct: resolvePositionPct(profile, signalScore, riskScore),
    maxDrawdownPct: round(((entries[0] - stopLoss) / Math.max(entries[0], 1)) * 100),
    markers,
  }
}

const MIN_CALIBRATION_SAMPLES = 30
const SIGNAL_BUCKET_WIDTH = 8

function calibrateWinRate(
  profile: RiskProfile,
  signalScore: number,
  learningRecords: LearningRecord[] = [],
  calibrationModel: LearningCalibration | null = null,
) {
  const records = learningRecords.filter(
    (record) =>
      record.profile === profile &&
      record.success !== null &&
      Math.abs(record.signalScore - signalScore) <= SIGNAL_BUCKET_WIDTH,
  )

  if (records.length >= MIN_CALIBRATION_SAMPLES) {
    const wins = records.filter((record) => record.success).length

    return {
      calibratedWinRate: clamp(round((wins / records.length) * 100), 1, 99),
      calibrationSamples: records.length,
    }
  }

  const trainedBucket = calibrationModel?.buckets.find(
    (bucket) =>
      bucket.profile === profile &&
      signalScore >= bucket.scoreMin &&
      signalScore <= bucket.scoreMax,
  )

  if (trainedBucket) {
    return {
      calibratedWinRate: trainedBucket.winRate,
      calibrationSamples: trainedBucket.samples + records.length,
    }
  }

  return {
    calibratedWinRate: null,
    calibrationSamples: records.length,
  }
}

function buildNarrative(
  stock: MarketStock,
  breakdown: SignalBreakdown,
  overallScore: number,
  riskScore: number,
  profile: RiskProfile,
) {
  const narratives = [
    `消息面 ${breakdown.messageScore} 分，${stock.headline}`,
    `技术面 ${breakdown.technicalScore} 分，趋势强度 ${stock.factors.trendStrength} / 量能 ${stock.factors.volumeEnergy}。`,
    `匹配度 ${breakdown.profileFit} 分，当前策略更适合${
      profile === 'low' ? '低风险埋伏' : profile === 'medium' ? '平衡跟随' : '高弹性交易'
    }。`,
  ]

  if (overallScore >= 84) {
    narratives.push(`综合分 ${overallScore}，当前属于可以执行的一档信号。`)
  } else {
    narratives.push(`综合分 ${overallScore}，更适合放入跟踪池等待确认。`)
  }

  if (riskScore <= 34) {
    narratives.push('风险值较低，允许更靠近支撑位做计划。')
  } else if (riskScore >= 65) {
    narratives.push('风险值偏高，必须严格执行止损与仓位控制。')
  }

  return narratives
}

export function scoreStock(
  stock: MarketStock,
  profile: RiskProfile,
  learningRecords: LearningRecord[] = [],
  calibrationModel: LearningCalibration | null = null,
): ScoredStock {
  const breakdown = buildBreakdown(stock, profile)

  const weightedOverall =
    profile === 'low'
      ? breakdown.messageScore * 0.24 +
        breakdown.technicalScore * 0.22 +
        breakdown.stabilityScore * 0.38 +
        breakdown.profileFit * 0.16
      : profile === 'medium'
        ? breakdown.messageScore * 0.25 +
          breakdown.technicalScore * 0.34 +
          breakdown.stabilityScore * 0.22 +
          breakdown.profileFit * 0.19
        : breakdown.messageScore * 0.23 +
          breakdown.technicalScore * 0.43 +
          breakdown.stabilityScore * 0.12 +
          breakdown.profileFit * 0.22

  const riskScore = clamp(
    round(
      profile === 'low'
        ? stock.factors.volatilityRisk * 0.44 +
            (100 - stock.factors.stability) * 0.34 +
            (100 - stock.factors.capitalFlow) * 0.22
        : profile === 'medium'
          ? stock.factors.volatilityRisk * 0.52 +
              (100 - stock.factors.stability) * 0.2 +
              (100 - stock.factors.capitalFlow) * 0.28
          : stock.factors.volatilityRisk * 0.63 +
              (100 - stock.factors.stability) * 0.12 +
              (100 - stock.factors.capitalFlow) * 0.25,
    ),
  )

  const overallScore = clamp(round(weightedOverall))
  const signalScore = clamp(
    round(
      overallScore * 0.56 +
        breakdown.profileFit * 0.24 +
        (100 - riskScore) * 0.2,
    ),
    35,
    92,
  )
  const { calibratedWinRate, calibrationSamples } = calibrateWinRate(
    profile,
    signalScore,
    learningRecords,
    calibrationModel,
  )
  const action = resolveAction(overallScore, profile)

  return {
    symbol: stock.symbol,
    secid: stock.secid,
    profile,
    name: stock.name,
    market: stock.market,
    sector: stock.sector,
    theme: stock.theme,
    price: stock.price,
    changePct: stock.changePct,
    turnoverBillion: stock.turnoverBillion,
    volumeRatio: stock.volumeRatio,
    amplitude: stock.amplitude,
    hotRank: stock.hotRank,
    headline: stock.headline,
    tags: stock.tags,
    signalScore,
    overallScore,
    riskScore,
    calibratedWinRate,
    calibrationSamples,
    winRate: calibratedWinRate,
    action,
    confidenceLabel: resolveConfidence(calibratedWinRate, calibrationSamples),
    breakdown,
    tradePlan: buildTradePlan(stock, profile, signalScore, riskScore),
    factors: stock.factors,
    candles: stock.candles,
    dataSource: stock.dataSource,
    updatedAt: stock.updatedAt,
    narrative: buildNarrative(
      stock,
      breakdown,
      overallScore,
      riskScore,
      profile,
    ),
  }
}

export function buildDailyPicks(
  stocks: MarketStock[],
  profile: RiskProfile,
  count = 4,
  learningRecords: LearningRecord[] = [],
  calibrationModel: LearningCalibration | null = null,
) {
  const scored = stocks
    .map((stock) =>
      scoreStock(stock, profile, learningRecords, calibrationModel),
    )
    .sort((left, right) => profilePickScore(right, profile) - profilePickScore(left, profile))
  const preferred = scored.filter((stock) => isPreferredForProfile(stock, profile))
  const pool = preferred.length >= count ? preferred : scored

  return diversifyByTheme(pool, count)
}

function profilePickScore(stock: ScoredStock, profile: RiskProfile) {
  if (profile === 'low') {
    return (
      stock.breakdown.stabilityScore * 1.45 +
      (100 - stock.riskScore) * 1.35 +
      stock.signalScore * 0.55 +
      stock.breakdown.messageScore * 0.25
    )
  }

  if (profile === 'medium') {
    return (
      stock.overallScore * 0.92 +
      stock.signalScore * 0.72 +
      stock.breakdown.technicalScore * 0.54 -
      Math.abs(stock.riskScore - 48) * 0.9
    )
  }

  return (
    stock.breakdown.technicalScore * 1.25 +
    stock.factors.relativeStrength * 0.95 +
    stock.factors.volumeEnergy * 0.72 +
    stock.factors.newsHeat * 0.45 -
    stock.breakdown.stabilityScore * 0.18
  )
}

function isPreferredForProfile(stock: ScoredStock, profile: RiskProfile) {
  if (profile === 'low') {
    return stock.riskScore <= 55 && stock.breakdown.stabilityScore >= 55
  }

  if (profile === 'medium') {
    return stock.riskScore >= 28 && stock.riskScore <= 68
  }

  return stock.breakdown.technicalScore >= 55 || stock.factors.relativeStrength >= 58
}

function diversifyByTheme(stocks: ScoredStock[], count: number) {
  const selected: ScoredStock[] = []
  const themes = new Set<string>()

  for (const stock of stocks) {
    if (selected.length >= count) {
      break
    }

    if (!themes.has(stock.theme)) {
      selected.push(stock)
      themes.add(stock.theme)
    }
  }

  for (const stock of stocks) {
    if (selected.length >= count) {
      break
    }

    if (!selected.some((item) => item.symbol === stock.symbol)) {
      selected.push(stock)
    }
  }

  return selected
}

export function buildWatchlistInsights(
  stocks: MarketStock[],
  watchSymbols: string[],
  profile: RiskProfile,
  learningRecords: LearningRecord[] = [],
  calibrationModel: LearningCalibration | null = null,
) {
  const watchSet = new Set(watchSymbols)

  return stocks
    .filter((stock) => watchSet.has(stock.symbol))
    .map((stock) =>
      scoreStock(stock, profile, learningRecords, calibrationModel),
    )
    .sort((left, right) => right.signalScore - left.signalScore)
}

export function buildAdaptiveReview(stocks: ScoredStock[], profile: RiskProfile) {
  if (!stocks.length) {
    return {
      avgWinRate: null,
      confidence: '暂无样本',
      learningScore: 0,
      bias: '等待自选股样本',
      summary: '当前自选股为空，系统会在加入股票后记录真实信号样本。',
      nextOptimization: '先建立自选池，再积累信号、未来收益和最大回撤样本。',
      focus: ['加入自选股', '等待行情同步', '建立复盘样本'],
    }
  }

  const calibratedStocks = stocks.filter((stock) => stock.winRate !== null)
  const avgWinRate = calibratedStocks.length
    ? round(average(calibratedStocks.map((stock) => stock.winRate ?? 0)))
    : null
  const avgRisk = round(average(stocks.map((stock) => stock.riskScore)))
  const avgSignal = round(average(stocks.map((stock) => stock.signalScore)))
  const avgMessage = round(
    average(stocks.map((stock) => stock.breakdown.messageScore)),
  )
  const avgTechnical = round(
    average(stocks.map((stock) => stock.breakdown.technicalScore)),
  )
  const avgStability = round(
    average(stocks.map((stock) => stock.breakdown.stabilityScore)),
  )
  const highConfidenceCount = calibratedStocks.filter(
    (stock) => (stock.winRate ?? 0) >= 75,
  ).length
  const riskPressure = stocks.filter((stock) => stock.riskScore >= 58).length
  const leader =
    [
      ['消息面', avgMessage],
      ['技术面', avgTechnical],
      ['稳定度', avgStability],
    ].toSorted((left, right) => Number(right[1]) - Number(left[1]))[0]?.[0] ??
    '综合因子'
  const weak =
    [
      ['消息面', avgMessage],
      ['技术面', avgTechnical],
      ['稳定度', avgStability],
    ].toSorted((left, right) => Number(left[1]) - Number(right[1]))[0]?.[0] ??
    '风险过滤'
  const confidence =
    avgWinRate === null
      ? '待校准'
      : avgWinRate >= 78
        ? '强信号'
        : avgWinRate >= 68
          ? '可跟踪'
          : '谨慎观察'
  const learningScore = clamp(
    round(avgSignal * 0.52 + (100 - avgRisk) * 0.24 + calibratedStocks.length * 0.6),
  )
  const bias =
    profile === 'low'
      ? `当前更偏向${leader}，下一轮会继续压低回撤阈值。`
      : profile === 'medium'
        ? `当前更偏向${leader}，下一轮会平衡趋势确认与风险过滤。`
        : `当前更偏向${leader}，下一轮会提高强势延续和失速撤退的权重。`

  return {
    avgWinRate,
    confidence,
    learningScore,
    bias,
    summary:
      avgWinRate === null
        ? `当前自选池信号均分 ${avgSignal}，尚无足够真实结果样本，暂不显示预测胜率。`
        : `今日自选池校准胜率 ${avgWinRate}%，高置信样本 ${highConfidenceCount}/${calibratedStocks.length}，平均风险 ${avgRisk}。`,
    nextOptimization:
      calibratedStocks.length < 30
        ? '校准样本不足，系统会先记录信号后的未来收益、最大回撤和持有窗口结果。'
        : riskPressure > stocks.length / 2
          ? `风险压力偏高，系统下一轮会降低高波动标的权重，并提高${weak}的过滤要求。`
          : `风险压力可控，系统下一轮会优先保留${leader}强、且校准表现稳定的标的。`,
    focus: [
      `${leader}权重 +${profile === 'high' ? 8 : 5}%`,
      `${weak}过滤阈值 +${riskPressure ? 6 : 3}%`,
      `风险惩罚 ${riskPressure ? '上调' : '维持'}`,
    ],
  }
}

export function buildMarketOverview(
  stocks: MarketStock[],
  profile: RiskProfile,
  learningRecords: LearningRecord[] = [],
  calibrationModel: LearningCalibration | null = null,
) {
  const scoredStocks = stocks.map((stock) =>
    scoreStock(stock, profile, learningRecords, calibrationModel),
  )
  const picks = scoredStocks
    .toSorted((left, right) => right.overallScore - left.overallScore)
    .slice(0, 30)
  const upCount = stocks.filter((stock) => stock.changePct > 0).length
  const downCount = stocks.filter((stock) => stock.changePct < 0).length
  const avgSignalScore = round(average(picks.map((item) => item.signalScore)))
  const avgRisk = round(average(picks.map((item) => item.riskScore)))
  const mood = round(average(picks.map((item) => item.breakdown.messageScore)))
  const strongestSector =
    picks
      .map((item) => item.theme)
      .reduce<Record<string, number>>((groups, theme) => {
        groups[theme] = (groups[theme] ?? 0) + 1
        return groups
      }, {})

  return {
    avgSignalScore,
    avgRisk,
    mood,
    upCount,
    downCount,
    total: stocks.length,
    dominantTheme:
      Object.entries(strongestSector).toSorted((left, right) => right[1] - left[1])[0]?.[0] ??
      '暂无',
  }
}
