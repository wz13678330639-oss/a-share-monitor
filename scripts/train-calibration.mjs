import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const EASTMONEY_TOKEN = 'bd1d9ddb04089700cf9c27f6f7426281'
const QUOTE_URL = 'https://push2.eastmoney.com/api/qt/clist/get'
const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const A_STOCK_FS =
  'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048'
const DEFAULT_SYMBOLS = ['300750', '688041', '600519', '601318']
const PROFILES = ['low', 'medium', 'high']
const SCORE_BUCKETS = [
  [35, 44],
  [45, 52],
  [53, 60],
  [61, 68],
  [69, 76],
  [77, 84],
  [85, 92],
]
const SYMBOL_LIMIT = Number(process.env.TRAIN_SYMBOL_LIMIT ?? 120)
const KLINE_LIMIT = Number(process.env.TRAIN_KLINE_LIMIT ?? 360)
const HORIZON_DAYS = Number(process.env.TRAIN_HORIZON_DAYS ?? 5)
const SUCCESS_RETURN_PCT = Number(process.env.TRAIN_SUCCESS_RETURN_PCT ?? 2)
const OUTPUT_FILE = resolve('public/model/learning-calibration.json')

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function round(value, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0
}

function buildSecid(marketCode, symbol) {
  return `${marketCode}.${symbol}`
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Referer: 'https://quote.eastmoney.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${url}`)
  }

  return response.json()
}

async function fetchUniverse() {
  const params = new URLSearchParams({
    pn: '1',
    pz: String(SYMBOL_LIMIT),
    po: '1',
    np: '1',
    ut: EASTMONEY_TOKEN,
    fltt: '2',
    invt: '2',
    fid: 'f6',
    fs: A_STOCK_FS,
    fields: 'f12,f13,f14,f100,f2,f6',
  })
  const payload = await fetchJson(`${QUOTE_URL}?${params.toString()}`)
  const rows = payload.data?.diff ?? []
  const items = rows
    .filter((row) => row.f12 && row.f14 && Number(row.f2) > 0)
    .map((row) => ({
      symbol: String(row.f12),
      secid: buildSecid(Number(row.f13 ?? 0), String(row.f12)),
      name: String(row.f14),
      sector: String(row.f100 ?? '未知'),
    }))
  const itemBySymbol = new Map(items.map((item) => [item.symbol, item]))

  for (const symbol of DEFAULT_SYMBOLS) {
    if (!itemBySymbol.has(symbol)) {
      itemBySymbol.set(symbol, {
        symbol,
        secid: buildSecid(symbol.startsWith('6') ? 1 : 0, symbol),
        name: symbol,
        sector: '自选',
      })
    }
  }

  return [...itemBySymbol.values()]
}

async function fetchDailyKlines(secid) {
  const params = new URLSearchParams({
    secid,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
    klt: '101',
    fqt: '1',
    beg: '0',
    end: '20500101',
    lmt: String(KLINE_LIMIT),
  })
  const payload = await fetchJson(`${KLINE_URL}?${params.toString()}`)

  return (payload.data?.klines ?? []).flatMap((line) => {
    const [
      date,
      open,
      close,
      high,
      low,
      volume,
      amount,
      amplitude,
      changePct,
      changeAmount,
      turnoverRate,
    ] = line.split(',')

    if (!date || !open || !close || !high || !low || !volume) {
      return []
    }

    return [
      {
        date,
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
        amount: Number(amount),
        amplitude: Number(amplitude),
        changePct: Number(changePct),
        changeAmount: Number(changeAmount),
        turnoverRate: Number(turnoverRate),
      },
    ]
  })
}

function scoreWindow(window, profile) {
  const current = window.at(-1)
  const previous = window.at(-2) ?? current
  const closes = window.map((item) => item.close)
  const volumes = window.map((item) => item.volume)
  const ma5 = average(closes.slice(-5))
  const ma10 = average(closes.slice(-10))
  const ma20 = average(closes.slice(-20))
  const volume5 = average(volumes.slice(-5))
  const volume20 = average(volumes.slice(-20))
  const trendPct = ma20 > 0 ? ((ma5 - ma20) / ma20) * 100 : 0
  const tenDayPct =
    window.length >= 10
      ? ((current.close - window.at(-10).close) / window.at(-10).close) * 100
      : current.changePct
  const volumeRatio = volume20 > 0 ? volume5 / volume20 : 1
  const avgAmplitude = average(window.slice(-10).map((item) => item.amplitude))
  const amount = average(window.slice(-5).map((item) => item.amount || 0))
  const liquidity = clamp(42 + Math.log10(Math.max(amount, 1)) * 4.5, 20, 95)
  const capitalFlow = clamp(
    50 + current.changePct * 3 + (volumeRatio - 1) * 18,
    0,
    100,
  )
  const trendStrength = clamp(50 + trendPct * 4.2 + tenDayPct * 1.4, 12, 98)
  const breakoutStrength = clamp(
    44 + current.changePct * 3.8 + Math.max(trendPct, 0) * 3.2,
  )
  const volumeEnergy = clamp(liquidity + (volumeRatio - 1) * 24)
  const volatilityRisk = clamp(avgAmplitude * 8 + Math.abs(current.changePct) * 2.6, 8, 95)
  const stability = clamp(100 - volatilityRisk * 0.76 + liquidity * 0.12)
  const valuationSafety = clamp(64 - Math.max(trendPct, 0) * 1.2, 20, 92)
  const relativeStrength = clamp(50 + tenDayPct * 2.7 + trendPct * 2.2)
  const messageScore = round(
    clamp(48 + Math.abs(current.changePct) * 2.2 + volumeRatio * 8) * 0.44 +
      clamp(50 + liquidity * 0.18) * 0.28 +
      capitalFlow * 0.28,
    0,
  )
  const technicalScore = round(
    trendStrength * 0.26 +
      breakoutStrength * 0.28 +
      volumeEnergy * 0.18 +
      relativeStrength * 0.28,
    0,
  )
  const stabilityScore = round(
    stability * 0.46 +
      valuationSafety * 0.32 +
      (100 - volatilityRisk) * 0.22,
    0,
  )
  const desiredVolatility =
    profile === 'low' ? 24 : profile === 'medium' ? 48 : 72
  const volatilityFit =
    100 - Math.abs(volatilityRisk - desiredVolatility) * 1.35
  const profileFit = clamp(
    round(
      volatilityFit * 0.34 +
        (profile === 'high'
          ? capitalFlow * 0.24 + volumeEnergy * 0.18
          : capitalFlow * 0.2 + stability * 0.16) +
        (profile === 'low'
          ? stability * 0.42 + valuationSafety * 0.24 + trendStrength * 0.12
          : profile === 'medium'
            ? trendStrength * 0.22 +
              breakoutStrength * 0.18 +
              stability * 0.18
            : breakoutStrength * 0.34 +
              relativeStrength * 0.26 +
              volumeEnergy * 0.14),
      0,
    ),
  )
  const weightedOverall =
    profile === 'low'
      ? messageScore * 0.24 +
        technicalScore * 0.22 +
        stabilityScore * 0.38 +
        profileFit * 0.16
      : profile === 'medium'
        ? messageScore * 0.25 +
          technicalScore * 0.34 +
          stabilityScore * 0.22 +
          profileFit * 0.19
        : messageScore * 0.23 +
          technicalScore * 0.43 +
          stabilityScore * 0.12 +
          profileFit * 0.22
  const riskScore = clamp(
    round(
      profile === 'low'
        ? volatilityRisk * 0.44 + (100 - stability) * 0.34 + (100 - capitalFlow) * 0.22
        : profile === 'medium'
          ? volatilityRisk * 0.52 + (100 - stability) * 0.2 + (100 - capitalFlow) * 0.28
          : volatilityRisk * 0.63 + (100 - stability) * 0.12 + (100 - capitalFlow) * 0.25,
      0,
    ),
  )
  const overallScore = clamp(round(weightedOverall, 0))

  return clamp(
    round(overallScore * 0.56 + profileFit * 0.24 + (100 - riskScore) * 0.2, 0),
    35,
    92,
  )
}

function buildTrainingSamples(item, candles) {
  const samples = []

  for (let index = 30; index < candles.length - HORIZON_DAYS; index += 1) {
    const window = candles.slice(index - 30, index)
    const entry = candles[index]
    const exit = candles[index + HORIZON_DAYS]
    const returnPct = ((exit.close - entry.close) / Math.max(entry.close, 1)) * 100

    for (const profile of PROFILES) {
      samples.push({
        symbol: item.symbol,
        profile,
        signalScore: scoreWindow(window, profile),
        returnPct,
        success: returnPct >= SUCCESS_RETURN_PCT,
      })
    }
  }

  return samples
}

function buildBuckets(samples) {
  return PROFILES.flatMap((profile) =>
    SCORE_BUCKETS.flatMap(([scoreMin, scoreMax]) => {
      const scoped = samples.filter(
        (sample) =>
          sample.profile === profile &&
          sample.signalScore >= scoreMin &&
          sample.signalScore <= scoreMax,
      )

      if (!scoped.length) {
        return []
      }

      const wins = scoped.filter((sample) => sample.success).length

      return [
        {
          profile,
          scoreMin,
          scoreMax,
          samples: scoped.length,
          winRate: round((wins / scoped.length) * 100, 0),
          avgReturnPct: round(average(scoped.map((sample) => sample.returnPct))),
        },
      ]
    }),
  )
}

async function main() {
  console.log(`Fetching universe from EastMoney, limit=${SYMBOL_LIMIT}...`)
  const universe = await fetchUniverse()
  const allSamples = []

  for (let index = 0; index < universe.length; index += 1) {
    const item = universe[index]

    try {
      const candles = await fetchDailyKlines(item.secid)
      const samples = candles.length > 60 ? buildTrainingSamples(item, candles) : []
      allSamples.push(...samples)
      console.log(
        `${index + 1}/${universe.length} ${item.symbol} ${item.name}: ${samples.length} samples`,
      )
    } catch (error) {
      console.warn(
        `${index + 1}/${universe.length} ${item.symbol} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 70)
    })
  }

  const model = {
    generatedAt: new Date().toISOString(),
    provider: '东方财富公开历史日K',
    horizonDays: HORIZON_DAYS,
    successReturnPct: SUCCESS_RETURN_PCT,
    totalSamples: allSamples.length,
    buckets: buildBuckets(allSamples),
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true })
  await writeFile(OUTPUT_FILE, `${JSON.stringify(model, null, 2)}\n`, 'utf8')
  console.log(
    `Wrote ${OUTPUT_FILE}: ${model.totalSamples} samples, ${model.buckets.length} buckets`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
