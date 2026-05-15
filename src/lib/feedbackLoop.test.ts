import { describe, expect, it } from 'vitest'
import { stockUniverse } from '../data/stockUniverse'
import { scoreStock } from './analysisEngine'
import {
  buildFeedbackReport,
  createPredictionBatch,
  tuneStrategyWeights,
} from './feedbackLoop'

describe('feedbackLoop', () => {
  it('records predictions with an evaluation horizon and strategy snapshot', () => {
    const picks = stockUniverse
      .slice(0, 3)
      .map((stock) => scoreStock(stock, 'medium'))
    const batch = createPredictionBatch({
      picks,
      profile: 'medium',
      tradeDate: '2026-05-15',
      createdAt: '2026-05-15T08:30:00.000Z',
    })

    expect(batch.records).toHaveLength(3)
    expect(batch.records[0]).toMatchObject({
      profile: 'medium',
      tradeDate: '2026-05-15',
      reviewStatus: 'open',
      horizons: [1, 3, 5, 20],
    })
    expect(batch.records[0].strategyVersion).toBe(batch.strategyVersion)
  })

  it('reviews open predictions and computes hit rate and realized returns', () => {
    const picks = stockUniverse
      .slice(0, 3)
      .map((stock) => scoreStock(stock, 'medium'))
    const batch = createPredictionBatch({
      picks,
      profile: 'medium',
      tradeDate: '2026-05-15',
      createdAt: '2026-05-15T08:30:00.000Z',
    })
    const currentPrices = new Map([
      [picks[0].symbol, picks[0].price * 1.04],
      [picks[1].symbol, picks[1].price * 0.98],
      [picks[2].symbol, picks[2].price * 1.02],
    ])

    const report = buildFeedbackReport({
      records: batch.records,
      currentPrices,
      reviewDate: '2026-05-16',
      profile: 'medium',
    })

    expect(report.reviewedRecords).toHaveLength(3)
    expect(report.hitRate).toBeGreaterThan(0)
    expect(report.averageReturnPct).not.toBe(0)
    expect(report.summary).toContain('复盘')
    expect(report.reviewedRecords.every((item) => item.reviewStatus === 'reviewed')).toBe(true)
  })

  it('adjusts strategy weights from feedback quality without exceeding bounds', () => {
    const next = tuneStrategyWeights(
      {
        message: 25,
        technical: 34,
        stability: 22,
        profileFit: 19,
        riskPenalty: 18,
      },
      {
        hitRate: 72,
        averageReturnPct: 2.4,
        maxDrawdownPct: 4.5,
        reviewedCount: 8,
      },
    )

    expect(next.technical).toBeGreaterThan(34)
    expect(next.riskPenalty).toBeLessThanOrEqual(22)
    expect(Object.values(next).every((value) => value >= 5 && value <= 60)).toBe(true)
  })
})
