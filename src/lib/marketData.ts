import type {
  Candle,
  ChartPeriod,
  MarketStock,
  StockFactors,
} from '../types/market'

const EASTMONEY_TOKEN = 'bd1d9ddb04089700cf9c27f6f7426281'
const DIRECT_QUOTE_BASE_URLS = [
  'https://push2delay.eastmoney.com/api/qt/clist/get',
  'https://82.push2.eastmoney.com/api/qt/clist/get',
  'https://16.push2.eastmoney.com/api/qt/clist/get',
  'https://36.push2.eastmoney.com/api/qt/clist/get',
  'https://48.push2.eastmoney.com/api/qt/clist/get',
  'https://push2.eastmoney.com/api/qt/clist/get',
]
const DIRECT_KLINE_BASE_URL =
  'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const PROXY_QUOTE_BASE_URL = '/api/eastmoney/clist'
const PROXY_KLINE_BASE_URL = '/api/eastmoney/kline'
const A_STOCK_FS =
  'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048'
const QUOTE_FIELDS = [
  'f12',
  'f13',
  'f14',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f15',
  'f16',
  'f17',
  'f18',
  'f20',
  'f21',
  'f23',
  'f62',
  'f100',
].join(',')

const LIVE_PROVIDER = '东方财富公开行情'
const DEFAULT_PAGE_SIZE = 100
const PAGE_BATCH_SIZE = 4
const KLINE_PERIOD_CONFIG = {
  minute: {
    klt: '1',
    limit: 120,
  },
  day: {
    klt: '101',
    limit: 120,
  },
  week: {
    klt: '102',
    limit: 156,
  },
  month: {
    klt: '103',
    limit: 120,
  },
} satisfies Record<ChartPeriod, { klt: string; limit: number }>
let jsonpSequence = 0

type EastMoneyValue = string | number | null | undefined

interface EastMoneyQuoteRow {
  f2?: EastMoneyValue
  f3?: EastMoneyValue
  f4?: EastMoneyValue
  f5?: EastMoneyValue
  f6?: EastMoneyValue
  f7?: EastMoneyValue
  f8?: EastMoneyValue
  f9?: EastMoneyValue
  f10?: EastMoneyValue
  f12?: EastMoneyValue
  f13?: EastMoneyValue
  f14?: EastMoneyValue
  f15?: EastMoneyValue
  f16?: EastMoneyValue
  f17?: EastMoneyValue
  f18?: EastMoneyValue
  f20?: EastMoneyValue
  f21?: EastMoneyValue
  f23?: EastMoneyValue
  f62?: EastMoneyValue
  f100?: EastMoneyValue
}

interface EastMoneyPageResponse {
  data?: {
    total?: number
    diff?: EastMoneyQuoteRow[]
  }
}

export interface NormalizedPage {
  total: number
  stocks: MarketStock[]
}

export interface EastMoneyListUrlOptions {
  page: number
  pageSize: number
  baseUrl?: string
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function toNumber(value: EastMoneyValue, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
  }

  return fallback
}

function toNullableNumber(value: EastMoneyValue) {
  const next = toNumber(value, Number.NaN)
  return Number.isFinite(next) ? next : null
}

function toText(value: EastMoneyValue, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function resolveMarket(marketCode: number, symbol: string) {
  if (marketCode === 1) {
    return '沪市'
  }

  if (marketCode === 0 && symbol.startsWith('8')) {
    return '北交所'
  }

  return '深市'
}

function buildSecid(marketCode: number, symbol: string) {
  return `${marketCode}.${symbol}`
}

function buildFactors(row: EastMoneyQuoteRow): StockFactors {
  const changePct = toNumber(row.f3)
  const amplitude = toNumber(row.f7)
  const turnoverRate = toNumber(row.f8)
  const amount = toNumber(row.f6)
  const marketCap = toNumber(row.f20)
  const mainNetInflow = toNumber(row.f62)
  const pe = toNumber(row.f9, 0)
  const pb = toNumber(row.f23, 0)
  const capitalBias =
    amount > 0 ? clamp(50 + (mainNetInflow / amount) * 620, 0, 100) : 50
  const liquidity = clamp(42 + Math.log10(Math.max(amount, 1)) * 4.8, 20, 95)
  const sizeSafety = clamp(42 + Math.log10(Math.max(marketCap, 1)) * 4.5, 20, 96)
  const valuationSafety = clamp(
    86 - Math.max(pe - 18, 0) * 0.95 - Math.max(pb - 3, 0) * 3.4,
    20,
    92,
  )
  const momentum = clamp(50 + changePct * 3.2 + turnoverRate * 1.4, 12, 98)
  const volatilityRisk = clamp(amplitude * 8 + Math.abs(changePct) * 2.6, 8, 95)

  return {
    newsHeat: clamp(48 + Math.abs(changePct) * 2.2 + turnoverRate * 1.3),
    policyHeat: clamp(50 + liquidity * 0.18),
    capitalFlow: capitalBias,
    trendStrength: momentum,
    breakoutStrength: clamp(44 + changePct * 3.8 + liquidity * 0.18),
    volumeEnergy: clamp(liquidity + turnoverRate * 2.1),
    stability: clamp(100 - volatilityRisk * 0.72 + sizeSafety * 0.18),
    valuationSafety,
    volatilityRisk,
    relativeStrength: clamp(50 + changePct * 4.1 + capitalBias * 0.12),
  }
}

function buildHeadline(name: string, sector: string, changePct: number) {
  if (changePct >= 5) {
    return `${name} 今日强势上行，${sector}方向资金关注度提升。`
  }

  if (changePct >= 1.5) {
    return `${name} 保持温和走强，适合结合量能与回踩位置跟踪。`
  }

  if (changePct <= -3) {
    return `${name} 日内回撤较大，需要先观察风控线和承接力度。`
  }

  return `${name} 维持震荡，等待消息面、资金面或技术位进一步确认。`
}

function buildQuoteCandles(row: EastMoneyQuoteRow): Candle[] {
  const current = toNumber(row.f2)
  const previous = toNumber(row.f18, current)
  const open = toNumber(row.f17, previous)
  const high = toNumber(row.f15, Math.max(open, current))
  const low = toNumber(row.f16, Math.min(open, current))
  const volume = toNumber(row.f5)
  const symbolSeed = String(row.f12 ?? '')
    .split('')
    .reduce((sum, item) => sum + item.charCodeAt(0), 0)
  const candles: Candle[] = []

  for (let index = 19; index >= 1; index -= 1) {
    const wave = Math.sin((symbolSeed + index) * 0.37) * 0.008
    const drift = (current - previous) / Math.max(previous, 1) / 20
    const close = round(previous * (1 + drift * (20 - index) + wave), 2)
    candles.push({
      label: `T-${index}`,
      open: round(close * (1 - wave * 0.32), 2),
      close,
      low: round(close * 0.985, 2),
      high: round(close * 1.015, 2),
      volume: round(volume * (0.56 + (20 - index) * 0.018), 0),
    })
  }

  candles.push({
    label: '实时',
    open: round(open, 2),
    close: round(current, 2),
    low: round(low, 2),
    high: round(high, 2),
    volume: round(volume, 0),
  })

  return candles
}

function normalizeQuote(row: EastMoneyQuoteRow): MarketStock | null {
  const symbol = toText(row.f12)
  const name = toText(row.f14)
  const marketCode = toNumber(row.f13, symbol.startsWith('6') ? 1 : 0)
  const price = toNumber(row.f2)

  if (!symbol || !name || price <= 0) {
    return null
  }

  const sector = toText(row.f100, resolveMarket(marketCode, symbol))
  const changePct = toNumber(row.f3)
  const amount = toNumber(row.f6)
  const mainNetInflow = toNumber(row.f62)
  const turnoverBillion = round(amount / 1000000000)
  const factors = buildFactors(row)

  return {
    symbol,
    secid: buildSecid(marketCode, symbol),
    name,
    market: resolveMarket(marketCode, symbol),
    sector,
    theme: sector,
    turnoverBillion,
    hotRank: Math.max(1, Math.round(100 - factors.newsHeat)),
    tags: [
      changePct >= 0 ? '上涨' : '回撤',
      mainNetInflow >= 0 ? '主力净流入' : '主力净流出',
      sector,
    ],
    headline: buildHeadline(name, sector, changePct),
    factors,
    price: round(price, 2),
    changePct: round(changePct),
    volumeRatio: round(Math.max(0.1, toNumber(row.f10, 1))),
    amplitude: round(toNumber(row.f7)),
    open: round(toNumber(row.f17, price)),
    high: round(toNumber(row.f15, price)),
    low: round(toNumber(row.f16, price)),
    previousClose: round(toNumber(row.f18, price)),
    volume: round(toNumber(row.f5), 0),
    amount,
    turnoverRate: round(toNumber(row.f8)),
    pe: toNullableNumber(row.f9),
    pb: toNullableNumber(row.f23),
    marketCap: toNullableNumber(row.f20),
    floatMarketCap: toNullableNumber(row.f21),
    mainNetInflow,
    dataSource: LIVE_PROVIDER,
    updatedAt: new Date().toISOString(),
    candles: buildQuoteCandles(row),
  }
}

export function buildEastMoneyListUrl({
  page,
  pageSize,
  baseUrl = PROXY_QUOTE_BASE_URL,
}: EastMoneyListUrlOptions) {
  const params = new URLSearchParams({
    pn: String(page),
    pz: String(pageSize),
    po: '1',
    np: '1',
    ut: EASTMONEY_TOKEN,
    fltt: '2',
    invt: '2',
    fid: 'f3',
    fs: A_STOCK_FS,
    fields: QUOTE_FIELDS,
  })

  return `${baseUrl}?${params.toString()}`
}

export function buildEastMoneyJsonpUrl(url: string, callbackName: string) {
  const base =
    typeof window === 'undefined' ? 'http://localhost' : window.location.href
  const next = new URL(url, base)
  next.searchParams.set('cb', callbackName)

  return next.toString()
}

export function buildEastMoneyKlineUrl(
  secid: string,
  limit = 80,
  baseUrl = DIRECT_KLINE_BASE_URL,
  period: ChartPeriod = 'day',
) {
  const periodConfig = KLINE_PERIOD_CONFIG[period]
  const params = new URLSearchParams({
    secid,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
    klt: periodConfig.klt,
    fqt: '1',
    beg: '0',
    end: '20500101',
    lmt: String(limit),
  })

  return `${baseUrl}?${params.toString()}`
}

export function normalizeEastMoneyPage(
  response: EastMoneyPageResponse,
): NormalizedPage {
  const rows = response.data?.diff ?? []
  const stocks = rows.flatMap((row) => {
    const stock = normalizeQuote(row)
    return stock ? [stock] : []
  })

  return {
    total: response.data?.total ?? stocks.length,
    stocks,
  }
}

export function normalizeEastMoneyKlines(
  klines: string[],
  period: ChartPeriod = 'day',
): Candle[] {
  return klines.slice(-KLINE_PERIOD_CONFIG[period].limit).flatMap((line) => {
    const [date, open, close, high, low, volume] = line.split(',')
    if (!date || !open || !close || !high || !low || !volume) {
      return []
    }

    const [dayPart, timePart] = date.split(' ')
    const [, month, day] = dayPart.split('-')
    const label =
      period === 'minute'
        ? (timePart ?? dayPart)
        : period === 'month'
          ? `${dayPart.slice(2, 4)}/${month}`
          : `${month}/${day}`

    return [
      {
        label,
        open: round(Number(open)),
        close: round(Number(close)),
        low: round(Number(low)),
        high: round(Number(high)),
        volume: round(Number(volume), 0),
      },
    ]
  })
}

export function mergeCandles(stock: MarketStock, candles: Candle[]): MarketStock {
  if (candles.length < 5) {
    return stock
  }

  return {
    ...stock,
    candles,
  }
}

export function filterByWatchOnly<T extends { symbol: string }>(
  stocks: T[],
  watchSymbols: string[],
  watchOnly: boolean,
) {
  if (!watchOnly) {
    return stocks
  }

  const watchSet = new Set(watchSymbols)
  return stocks.filter((stock) => watchSet.has(stock.symbol))
}

function canUseJsonp() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function delay(ms: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

function rotateQuoteBaseUrls(page: number) {
  const offset = page % DIRECT_QUOTE_BASE_URLS.length
  return [
    ...DIRECT_QUOTE_BASE_URLS.slice(offset),
    ...DIRECT_QUOTE_BASE_URLS.slice(0, offset),
  ]
}

function fetchJsonp<T>(url: string, timeoutMs = 12000): Promise<T> {
  if (!canUseJsonp()) {
    return Promise.reject(new Error('JSONP 只能在浏览器环境中使用。'))
  }

  return new Promise((resolve, reject) => {
    const callbackName = `__eastmoney_jsonp_${Date.now()}_${jsonpSequence++}`
    const script = document.createElement('script')
    const jsonpWindow = window as unknown as Window &
      Record<string, ((payload: T) => void) | undefined>
    const cleanup = () => {
      window.clearTimeout(timer)
      script.remove()
      delete jsonpWindow[callbackName]
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('东方财富 JSONP 行情请求超时。'))
    }, timeoutMs)

    jsonpWindow[callbackName] = (payload: T) => {
      cleanup()
      resolve(payload)
    }
    script.async = true
    script.src = buildEastMoneyJsonpUrl(url, callbackName)
    script.onerror = () => {
      cleanup()
      reject(new Error('东方财富 JSONP 行情请求失败。'))
    }

    document.head.append(script)
  })
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`行情请求失败：${response.status}`)
  }

  return (await response.json()) as T
}

export async function fetchEastMoneyPage(page: number, pageSize: number) {
  let lastError: unknown

  try {
    const payload = await fetchJson<EastMoneyPageResponse>(
      buildEastMoneyListUrl({ page, pageSize }),
    )

    return normalizeEastMoneyPage(payload)
  } catch (error) {
    lastError = error
  }

  if (canUseJsonp()) {
    for (const baseUrl of rotateQuoteBaseUrls(page)) {
      try {
        return normalizeEastMoneyPage(
          await fetchJson<EastMoneyPageResponse>(
            buildEastMoneyListUrl({ page, pageSize, baseUrl }),
          ),
        )
      } catch {
        // Some browsers or edge nodes may reject CORS fetch; JSONP is the next fallback.
      }

      try {
        return normalizeEastMoneyPage(
          await fetchJsonp<EastMoneyPageResponse>(
            buildEastMoneyListUrl({ page, pageSize, baseUrl }),
          ),
        )
      } catch {
        // Try the next EastMoney edge node, then the local proxy fallback.
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('行情列表请求失败。')
}

export function buildEastMoneyPageBatches(
  total: number,
  pageSize: number,
  batchSize = PAGE_BATCH_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pages = Array.from({ length: totalPages - 1 }, (_, index) => index + 2)
  const batches: number[][] = []

  for (let index = 0; index < pages.length; index += batchSize) {
    batches.push(pages.slice(index, index + batchSize))
  }

  return batches
}

async function fetchEastMoneyPageWithRetry(
  page: number,
  pageSize: number,
  attempts = 3,
) {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchEastMoneyPage(page, pageSize)
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await delay(180 * attempt)
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`第 ${page} 页行情请求失败。`)
}

export async function fetchAllAStocks(pageSize = DEFAULT_PAGE_SIZE) {
  const firstPage = await fetchEastMoneyPage(1, pageSize)
  const pageBatches = buildEastMoneyPageBatches(
    firstPage.total,
    pageSize,
    PAGE_BATCH_SIZE,
  )
  const restPages: NormalizedPage[] = []

  for (const batch of pageBatches) {
    const pages = await Promise.all(
      batch.map((page) => fetchEastMoneyPageWithRetry(page, pageSize)),
    )
    restPages.push(...pages)

    if (pageBatches.length > 1) {
      await delay(80)
    }
  }

  return {
    total: firstPage.total,
    stocks: [...firstPage.stocks, ...restPages.flatMap((page) => page.stocks)],
  }
}

export async function fetchStockKlines(
  secid: string,
  period: ChartPeriod = 'day',
) {
  const periodConfig = KLINE_PERIOD_CONFIG[period]
  const urls = [
    buildEastMoneyKlineUrl(secid, periodConfig.limit, PROXY_KLINE_BASE_URL, period),
    buildEastMoneyKlineUrl(secid, periodConfig.limit, DIRECT_KLINE_BASE_URL, period),
  ]
  let lastError: unknown

  for (const url of urls) {
    try {
      const payload = await fetchJson<{
        data?: {
          klines?: string[]
        }
      }>(url)

      return normalizeEastMoneyKlines(payload.data?.klines ?? [], period)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('K线请求失败。')
}
