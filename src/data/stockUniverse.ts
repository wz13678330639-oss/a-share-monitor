import type { Candle, MarketStock, StockSeed } from '../types/market'

const monthLabels = [
  '03/28',
  '03/31',
  '04/01',
  '04/02',
  '04/03',
  '04/07',
  '04/08',
  '04/09',
  '04/10',
  '04/11',
  '04/14',
  '04/15',
  '04/16',
  '04/17',
  '04/18',
  '04/21',
  '04/22',
  '04/23',
  '04/24',
  '04/25',
  '04/26',
  '04/27',
  '04/28',
  '04/29',
]

function round(value: number, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function resolveSecid(symbol: string) {
  if (symbol.startsWith('6')) {
    return `1.${symbol}`
  }

  return `0.${symbol}`
}

function generateCandles(seed: StockSeed): Candle[] {
  const candles: Candle[] = []
  let close = seed.basePrice * (1 - seed.drift * 0.006)

  for (let index = 0; index < monthLabels.length; index += 1) {
    const wave =
      Math.sin((index + 1) * seed.seed * 0.17) * seed.sway +
      Math.cos((index + 2) * seed.seed * 0.11) * seed.sway * 0.58
    const microTrend = seed.drift + Math.sin(index * 0.35) * 0.18
    const open = close
    const nextClose = Math.max(
      seed.basePrice * 0.86,
      open * (1 + (microTrend + wave) / 420),
    )
    const rangeBoost = 0.005 + Math.abs(wave) * 0.0008
    const high = Math.max(open, nextClose) * (1 + rangeBoost)
    const low = Math.min(open, nextClose) * (1 - rangeBoost * 0.92)

    candles.push({
      label: monthLabels[index],
      open: round(open),
      close: round(nextClose),
      high: round(high),
      low: round(low),
      volume: round(960000 + Math.abs(wave) * 90000 + index * 16000, 0),
    })

    close = nextClose
  }

  return candles
}

function buildStock(seed: StockSeed): MarketStock {
  const candles = generateCandles(seed)
  const current = candles.at(-1)!
  const previous = candles.at(-2)!
  const amount = seed.turnoverBillion * 1000000000
  const market = seed.symbol.startsWith('6') ? '沪市' : '深市'

  return {
    symbol: seed.symbol,
    secid: seed.secid ?? resolveSecid(seed.symbol),
    name: seed.name,
    market,
    sector: seed.sector,
    theme: seed.theme,
    turnoverBillion: seed.turnoverBillion,
    hotRank: seed.hotRank,
    tags: seed.tags,
    headline: seed.headline,
    factors: seed.factors,
    price: current.close,
    changePct: round(((current.close - previous.close) / previous.close) * 100),
    volumeRatio: round(current.volume / previous.volume),
    amplitude: round(((current.high - current.low) / current.open) * 100),
    open: current.open,
    high: current.high,
    low: current.low,
    previousClose: previous.close,
    volume: current.volume,
    amount,
    turnoverRate: round(1.2 + seed.hotRank / 30),
    pe: round(12 + seed.factors.valuationSafety / 3),
    pb: round(1 + seed.factors.stability / 45),
    marketCap: amount * 18,
    floatMarketCap: amount * 12,
    mainNetInflow: amount * ((seed.factors.capitalFlow - 50) / 900),
    dataSource: '备用演示行情',
    updatedAt: new Date().toISOString(),
    candles,
  }
}

const stockSeeds: StockSeed[] = [
  {
    symbol: '600519',
    name: '贵州茅台',
    sector: '高端消费',
    theme: '白马防御',
    turnoverBillion: 4.16,
    hotRank: 16,
    tags: ['高股息防守', '机构回流', '消费修复'],
    headline: '北向资金回流白马板块，消费龙头承接稳定。',
    drift: 0.48,
    sway: 1.15,
    seed: 11,
    basePrice: 1668,
    factors: {
      newsHeat: 62,
      policyHeat: 58,
      capitalFlow: 78,
      trendStrength: 69,
      breakoutStrength: 51,
      volumeEnergy: 54,
      stability: 95,
      valuationSafety: 81,
      volatilityRisk: 24,
      relativeStrength: 64,
    },
  },
  {
    symbol: '300750',
    name: '宁德时代',
    sector: '储能电池',
    theme: '新能源主线',
    turnoverBillion: 6.39,
    hotRank: 8,
    tags: ['机构抱团', '量价共振', '产业链修复'],
    headline: '储能链订单预期回暖，新能源权重进入趋势反弹段。',
    drift: 0.74,
    sway: 1.85,
    seed: 14,
    basePrice: 228,
    factors: {
      newsHeat: 74,
      policyHeat: 71,
      capitalFlow: 82,
      trendStrength: 81,
      breakoutStrength: 74,
      volumeEnergy: 77,
      stability: 76,
      valuationSafety: 67,
      volatilityRisk: 43,
      relativeStrength: 79,
    },
  },
  {
    symbol: '002594',
    name: '比亚迪',
    sector: '智能汽车',
    theme: '出口与智驾',
    turnoverBillion: 5.82,
    hotRank: 10,
    tags: ['龙头趋势', '出海订单', '产业链联动'],
    headline: '整车出海与智驾主题共振，趋势股延续主升节奏。',
    drift: 0.81,
    sway: 1.94,
    seed: 17,
    basePrice: 242,
    factors: {
      newsHeat: 78,
      policyHeat: 74,
      capitalFlow: 80,
      trendStrength: 83,
      breakoutStrength: 79,
      volumeEnergy: 76,
      stability: 72,
      valuationSafety: 64,
      volatilityRisk: 48,
      relativeStrength: 84,
    },
  },
  {
    symbol: '688041',
    name: '海光信息',
    sector: '算力芯片',
    theme: '国产AI算力',
    turnoverBillion: 7.24,
    hotRank: 3,
    tags: ['强势主线', '情绪高地', '算力扩容'],
    headline: '国产算力链维持强势，资金持续向高弹性芯片股聚拢。',
    drift: 1.06,
    sway: 2.72,
    seed: 19,
    basePrice: 114,
    factors: {
      newsHeat: 88,
      policyHeat: 82,
      capitalFlow: 81,
      trendStrength: 90,
      breakoutStrength: 93,
      volumeEnergy: 86,
      stability: 57,
      valuationSafety: 48,
      volatilityRisk: 75,
      relativeStrength: 92,
    },
  },
  {
    symbol: '601127',
    name: '赛力斯',
    sector: '智能汽车',
    theme: '高景气题材',
    turnoverBillion: 6.91,
    hotRank: 4,
    tags: ['热点龙头', '高波动', '情绪穿越'],
    headline: '题材龙头高位换手后继续保持强承接，短线情绪活跃。',
    drift: 1.12,
    sway: 3.08,
    seed: 23,
    basePrice: 92,
    factors: {
      newsHeat: 91,
      policyHeat: 76,
      capitalFlow: 85,
      trendStrength: 88,
      breakoutStrength: 90,
      volumeEnergy: 91,
      stability: 51,
      valuationSafety: 44,
      volatilityRisk: 81,
      relativeStrength: 89,
    },
  },
  {
    symbol: '603019',
    name: '中科曙光',
    sector: '服务器',
    theme: 'AI基础设施',
    turnoverBillion: 4.67,
    hotRank: 7,
    tags: ['景气扩散', '资金回流', '中军品种'],
    headline: 'AI硬件分支扩散，核心中军在趋势上沿反复蓄势。',
    drift: 0.92,
    sway: 2.18,
    seed: 29,
    basePrice: 58,
    factors: {
      newsHeat: 80,
      policyHeat: 79,
      capitalFlow: 77,
      trendStrength: 84,
      breakoutStrength: 82,
      volumeEnergy: 74,
      stability: 64,
      valuationSafety: 58,
      volatilityRisk: 61,
      relativeStrength: 85,
    },
  },
  {
    symbol: '600036',
    name: '招商银行',
    sector: '银行',
    theme: '价值修复',
    turnoverBillion: 2.94,
    hotRank: 21,
    tags: ['低波防守', '高股息', '估值修复'],
    headline: '高股息风格回暖，银行权重提供组合回撤保护。',
    drift: 0.4,
    sway: 0.92,
    seed: 31,
    basePrice: 33,
    factors: {
      newsHeat: 56,
      policyHeat: 61,
      capitalFlow: 73,
      trendStrength: 65,
      breakoutStrength: 46,
      volumeEnergy: 49,
      stability: 91,
      valuationSafety: 86,
      volatilityRisk: 19,
      relativeStrength: 60,
    },
  },
  {
    symbol: '601318',
    name: '中国平安',
    sector: '保险金融',
    theme: '红利均衡',
    turnoverBillion: 3.48,
    hotRank: 18,
    tags: ['均衡配置', '机构偏好', '防守反击'],
    headline: '金融权重进入低位修复区间，适合作为中低风险底仓。',
    drift: 0.52,
    sway: 1.04,
    seed: 37,
    basePrice: 48,
    factors: {
      newsHeat: 58,
      policyHeat: 63,
      capitalFlow: 71,
      trendStrength: 67,
      breakoutStrength: 49,
      volumeEnergy: 52,
      stability: 88,
      valuationSafety: 79,
      volatilityRisk: 27,
      relativeStrength: 62,
    },
  },
]

export const stockUniverse = stockSeeds.map(buildStock)

export const defaultWatchSymbols = ['300750', '688041', '600519', '601318']
