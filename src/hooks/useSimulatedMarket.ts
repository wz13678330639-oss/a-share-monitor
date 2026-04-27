import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import type { MarketStock } from '../types/market'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function tickStock(stock: MarketStock, tick: number, index: number): MarketStock {
  const phase = tick * 0.78 + index * 0.91
  const trendBias =
    (stock.factors.trendStrength + stock.factors.capitalFlow - 100) / 62000
  const temperature =
    (stock.factors.newsHeat + stock.factors.volumeEnergy - 100) / 92000
  const wave =
    Math.sin(phase) * 0.0018 +
    Math.cos(phase * 0.62) * 0.0011 +
    (stock.hotRank < 6 ? Math.sin(phase * 1.3) * 0.0007 : 0)
  const delta = trendBias + temperature + wave
  const lastCandle = stock.candles.at(-1)!
  const previousClose = stock.candles.at(-2)!.close
  const nextPrice = round(
    clamp(stock.price * (1 + delta), stock.price * 0.992, stock.price * 1.008),
  )
  const nextHigh = round(Math.max(lastCandle.high, nextPrice, lastCandle.open))
  const nextLow = round(Math.min(lastCandle.low, nextPrice, lastCandle.open))
  const nextVolume = round(
    clamp(lastCandle.volume * (1 + Math.abs(delta) * 42 + 0.006), 0.85, 6.2),
    3,
  )
  const nextCandles = [
    ...stock.candles.slice(0, -1),
    {
      ...lastCandle,
      close: nextPrice,
      high: nextHigh,
      low: nextLow,
      volume: nextVolume,
    },
  ]

  return {
    ...stock,
    price: nextPrice,
    changePct: round(((nextPrice - previousClose) / previousClose) * 100),
    volumeRatio: round(
      clamp(nextVolume / stock.candles.at(-2)!.volume, 0.82, 3.8),
    ),
    amplitude: round(
      clamp(((nextHigh - nextLow) / lastCandle.open) * 100, 0.5, 8.6),
    ),
    candles: nextCandles,
    factors: {
      ...stock.factors,
      newsHeat: clamp(
        round(stock.factors.newsHeat + Math.sin(phase * 1.12) * 1.8, 0),
        40,
        97,
      ),
      capitalFlow: clamp(
        round(stock.factors.capitalFlow + Math.cos(phase * 0.92) * 1.6, 0),
        40,
        96,
      ),
      volumeEnergy: clamp(
        round(stock.factors.volumeEnergy + Math.sin(phase * 0.74) * 1.4, 0),
        35,
        98,
      ),
      relativeStrength: clamp(
        round(stock.factors.relativeStrength + Math.cos(phase * 0.48) * 1.1, 0),
        35,
        98,
      ),
    },
  }
}

export function useSimulatedMarket(initialStocks: MarketStock[]) {
  const [stocks, setStocks] = useState(initialStocks)

  const advance = useEffectEvent(() => {
    startTransition(() => {
      setStocks((current) =>
        current.map((stock, index) => tickStock(stock, Date.now() / 1000, index)),
      )
    })
  })

  useEffect(() => {
    const timer = window.setInterval(() => advance(), 2200)
    return () => window.clearInterval(timer)
  }, [])

  return stocks
}
