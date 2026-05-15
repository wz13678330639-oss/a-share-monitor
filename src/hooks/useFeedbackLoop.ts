import { useEffect, useMemo, useState } from 'react'
import type { RiskProfile, ScoredStock } from '../types/market'
import {
  buildFeedbackReport,
  createPredictionBatch,
  defaultStrategyWeights,
  mergeReviewedRecords,
  trainOnlineModel,
  tuneStrategyWeights,
  type FeedbackReport,
  type OnlineModel,
  type PredictionRecord,
  type StrategyWeights,
} from '../lib/feedbackLoop'

const storageKey = 'a-share-feedback-loop-v1'

interface FeedbackLoopState {
  records: PredictionRecord[]
  weights: Record<RiskProfile, StrategyWeights>
  lastReport: FeedbackReport | null
  models: Partial<Record<RiskProfile, OnlineModel>>
}

const defaultState: FeedbackLoopState = {
  records: [],
  weights: defaultStrategyWeights,
  lastReport: null,
  models: {},
}

function todayKey(date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

function readStoredState(): FeedbackLoopState {
  if (typeof window === 'undefined') {
    return defaultState
  }

  try {
    const raw = window.localStorage.getItem(storageKey)

    if (!raw) {
      return defaultState
    }

    const parsed = JSON.parse(raw) as Partial<FeedbackLoopState>

    return {
      records: parsed.records ?? [],
      weights: {
        ...defaultStrategyWeights,
        ...parsed.weights,
      },
      lastReport: parsed.lastReport ?? null,
      models: parsed.models ?? {},
    }
  } catch {
    return defaultState
  }
}

export function useFeedbackLoop(picks: ScoredStock[], profile: RiskProfile) {
  const [state, setState] = useState<FeedbackLoopState>(() => readStoredState())
  const tradeDate = todayKey()

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  }, [state])

  const todaysRecords = useMemo(
    () =>
      state.records.filter(
        (record) => record.tradeDate === tradeDate && record.profile === profile,
      ),
    [profile, state.records, tradeDate],
  )

  const openRecords = useMemo(
    () =>
      state.records.filter(
        (record) => record.reviewStatus === 'open' && record.profile === profile,
      ),
    [profile, state.records],
  )

  function captureTodayPredictions() {
    if (!picks.length) {
      return
    }

    const batch = createPredictionBatch({
      picks,
      profile,
      tradeDate,
      createdAt: new Date().toISOString(),
    })

    setState((current) => {
      const existingIds = new Set(current.records.map((record) => record.id))
      const nextRecords = [
        ...current.records,
        ...batch.records.filter((record) => !existingIds.has(record.id)),
      ]

      return {
        ...current,
        records: nextRecords,
      }
    })
  }

  function runReview(scoredStocks: ScoredStock[]) {
    const currentPrices = new Map(
      scoredStocks.map((stock) => [stock.symbol, stock.price]),
    )
    const report = buildFeedbackReport({
      records: state.records,
      currentPrices,
      reviewDate: tradeDate,
      profile,
    })

    setState((current) => {
      const nextWeights = tuneStrategyWeights(current.weights[profile], report)
      const model = trainOnlineModel({
        previousModel: current.models[profile] ?? null,
        reviewedRecords: report.reviewedRecords,
        baseWeights: nextWeights,
        profile,
      })

      return {
        records: mergeReviewedRecords(current.records, report.reviewedRecords),
        weights: {
          ...current.weights,
          [profile]: nextWeights,
        },
        lastReport: report,
        models: {
          ...current.models,
          [profile]: model,
        },
      }
    })
  }

  function resetLoop() {
    setState(defaultState)
  }

  return {
    captureTodayPredictions,
    openRecords,
    report: state.lastReport,
    resetLoop,
    runReview,
    trainedModel: state.models[profile] ?? null,
    strategyWeights: state.weights[profile],
    todaysRecords,
    totalRecords: state.records.length,
  }
}
