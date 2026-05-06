import { describe, expect, it } from 'vitest'
import { stockUniverse } from '../data/stockUniverse'
import {
  buildAdaptiveReview,
  buildDailyPicks,
  buildTradePlan,
  scoreStock,
} from './analysisEngine'

describe('analysisEngine', () => {
  it('prefers stable leaders for low risk and high momentum names for high risk', () => {
    const defensive = stockUniverse.find((item) => item.symbol === '600519')!
    const momentum = stockUniverse.find((item) => item.symbol === '688041')!

    const lowDefensive = scoreStock(defensive, 'low')
    const lowMomentum = scoreStock(momentum, 'low')
    const highDefensive = scoreStock(defensive, 'high')
    const highMomentum = scoreStock(momentum, 'high')

    expect(lowDefensive.overallScore).toBeGreaterThan(lowMomentum.overallScore)
    expect(highMomentum.overallScore).toBeGreaterThan(highDefensive.overallScore)
  })

  it('returns different top pick structures for different risk profiles', () => {
    const lowPicks = buildDailyPicks(stockUniverse, 'low', 3)
    const highPicks = buildDailyPicks(stockUniverse, 'high', 3)

    expect(lowPicks[0].action).toMatch(/低吸|回踩|观察/)
    expect(highPicks[0].action).toMatch(/强势|试单|跟踪/)
    expect(lowPicks.map((item) => item.symbol)).not.toEqual(
      highPicks.map((item) => item.symbol),
    )
  })

  it('keeps low and high risk recommendation pools materially different', () => {
    const lowPicks = buildDailyPicks(stockUniverse, 'low', 4)
    const mediumPicks = buildDailyPicks(stockUniverse, 'medium', 4)
    const highPicks = buildDailyPicks(stockUniverse, 'high', 4)
    const lowSymbols = new Set(lowPicks.map((item) => item.symbol))
    const overlap = highPicks.filter((item) => lowSymbols.has(item.symbol))
    const averageRisk = (items: typeof lowPicks) =>
      items.reduce((sum, item) => sum + item.riskScore, 0) / items.length

    expect(overlap.length).toBeLessThanOrEqual(1)
    expect(averageRisk(lowPicks)).toBeLessThan(averageRisk(highPicks))
    expect(mediumPicks.map((item) => item.symbol)).not.toEqual(
      lowPicks.map((item) => item.symbol),
    )
  })

  it('produces profile-specific trade plans with visible buy and risk markers', () => {
    const stable = stockUniverse.find((item) => item.symbol === '601318')!
    const breakout = stockUniverse.find((item) => item.symbol === '601127')!

    const lowPlan = buildTradePlan(stable, 'low')
    const highPlan = buildTradePlan(breakout, 'high')

    expect(lowPlan).not.toBeNull()
    expect(highPlan).not.toBeNull()
    if (!lowPlan || !highPlan) {
      throw new Error('Expected trade plans for seeded K-line fixtures.')
    }

    expect(lowPlan.entries[0]).toBeLessThanOrEqual(stable.price)
    expect(lowPlan.stopLoss).toBeLessThan(lowPlan.entries[0])
    expect(highPlan.entries[0]).toBeGreaterThan(breakout.price)
    expect(highPlan.targets[0]).toBeGreaterThan(highPlan.entries[0])
    expect(highPlan.markers.some((item) => item.kind === 'risk')).toBe(true)
  })

  it('summarizes watchlist prediction quality and optimization focus', () => {
    const scored = stockUniverse
      .slice(0, 4)
      .map((stock) => scoreStock(stock, 'medium'))
    const review = buildAdaptiveReview(scored, 'medium')

    expect(review.avgWinRate).toBeNull()
    expect(review.summary).toContain('信号均分')
    expect(review.nextOptimization).toContain('校准样本不足')
    expect(review.focus).toHaveLength(3)
  })
})
