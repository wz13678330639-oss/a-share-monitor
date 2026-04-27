import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { defaultWatchSymbols, stockUniverse } from '../data/stockUniverse'
import {
  fetchAllAStocks,
  fetchStockKlines,
  mergeCandles,
} from '../lib/marketData'
import type { ChartPeriod, DataSourceStatus, MarketStock } from '../types/market'

const FALLBACK_STATUS: DataSourceStatus = {
  mode: 'fallback',
  provider: '备用演示行情',
  message: '正在使用备用演示数据，等待实时行情源恢复。',
  updatedAt: new Date().toISOString(),
  total: stockUniverse.length,
}

const LIVE_REFRESH_MS = 15000

export function useAStockMarket(activeSymbol: string, chartPeriod: ChartPeriod) {
  const [stocks, setStocks] = useState<MarketStock[]>(stockUniverse)
  const [status, setStatus] = useState<DataSourceStatus>(FALLBACK_STATUS)
  const [isLoading, setIsLoading] = useState(true)
  const stocksCountRef = useRef(stockUniverse.length)
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
            current.map((stock) => [stock.symbol, stock.candles]),
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
          ...FALLBACK_STATUS,
          message: `${message} 当前切换到备用演示数据。`,
          updatedAt: new Date().toISOString(),
          total: stocksCountRef.current || stockUniverse.length,
        })
        setStocks((current) => (current.length ? current : stockUniverse))
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
    stocksCountRef.current = stocks.length
  }, [stocks.length])

  useEffect(() => {
    if (!activeSymbol) {
      return
    }

    void refreshKline(activeSymbol, chartPeriod)
  }, [activeSymbol, chartPeriod])

  return {
    stocks,
    status,
    isLoading,
    defaultWatchSymbols,
    refreshQuotes,
  }
}
