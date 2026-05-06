import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import {
  fetchAllAStocks,
  fetchStockKlines,
  mergeCandles,
} from '../lib/marketData'
import type { ChartPeriod, DataSourceStatus, MarketStock } from '../types/market'

const DEFAULT_WATCH_SYMBOLS = ['300750', '688041', '600519', '601318']

const UNAVAILABLE_STATUS: DataSourceStatus = {
  mode: 'unavailable',
  provider: '真实行情未连接',
  message: '当前没有可用的真实行情数据，系统已暂停评分和操作建议。',
  updatedAt: new Date().toISOString(),
  total: 0,
}

const LIVE_REFRESH_MS = 15000

export function useAStockMarket(activeSymbol: string, chartPeriod: ChartPeriod) {
  const [stocks, setStocks] = useState<MarketStock[]>([])
  const [status, setStatus] = useState<DataSourceStatus>(UNAVAILABLE_STATUS)
  const [isLoading, setIsLoading] = useState(true)
  const isRefreshingRef = useRef(false)

  const refreshQuotes = useCallback(async () => {
    if (isRefreshingRef.current) {
      return
    }

    isRefreshingRef.current = true

    try {
      const page = await fetchAllAStocks()

      startTransition(() => {
        setStocks((current) => {
          const candlesBySymbol = new Map(
            current
              .filter((stock) => stock.candles.length >= 5)
              .map((stock) => [stock.symbol, stock.candles]),
          )

          return page.stocks.map((stock) => ({
            ...stock,
            candles: candlesBySymbol.get(stock.symbol) ?? stock.candles,
          }))
        })
        setStatus({
          mode: 'live',
          provider: '东方财富公开行情',
          message:
            '已同步全市场 A 股公开行情。公开行情源可能存在延迟或访问限制，交易级准确建议接入正式授权行情服务。',
          updatedAt: new Date().toISOString(),
          total: page.total,
        })
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '实时行情源暂时不可用。'

      startTransition(() => {
        setStatus({
          ...UNAVAILABLE_STATUS,
          message: `${message} 已暂停评分和操作建议，等待真实行情源恢复。`,
          updatedAt: new Date().toISOString(),
          total: 0,
        })
        setStocks([])
      })
    } finally {
      setIsLoading(false)
      isRefreshingRef.current = false
    }
  }, [])

  const refreshKline = useEffectEvent(
    async (symbol: string, period: ChartPeriod) => {
    const active = stocks.find((stock) => stock.symbol === symbol)

    if (!active || status.mode !== 'live') {
      return
    }

    try {
      const candles = await fetchStockKlines(active.secid, period)
      startTransition(() => {
        setStocks((current) =>
          current.map((stock) =>
            stock.symbol === symbol ? mergeCandles(stock, candles) : stock,
          ),
        )
      })
    } catch {
      // The quote stream is still useful when historical K-line refresh fails.
    }
  })

  useEffect(() => {
    void refreshQuotes()
    const timer = window.setInterval(() => void refreshQuotes(), LIVE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refreshQuotes])

  useEffect(() => {
    if (!activeSymbol) {
      return
    }

    void refreshKline(activeSymbol, chartPeriod)
  }, [activeSymbol, chartPeriod, status.mode, stocks.length])

  return {
    stocks,
    status,
    isLoading,
    defaultWatchSymbols: DEFAULT_WATCH_SYMBOLS,
    refreshQuotes,
  }
}
