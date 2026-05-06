import type {
  LearningCalibration,
  LearningRecord,
  ScoredStock,
} from '../types/market'

const STORAGE_KEY = 'canvas-alpha-learning-v1'
const HORIZON_DAYS = 5
const SUCCESS_RETURN_PCT = 2
const MAX_RECORDS = 1200
const CALIBRATION_MODEL_URL = '/model/learning-calibration.json'

function round(value: number, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function tradingDayKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function isLearningRecord(value: unknown): value is LearningRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Partial<LearningRecord>
  return (
    typeof record.id === 'string' &&
    typeof record.symbol === 'string' &&
    typeof record.profile === 'string' &&
    typeof record.signalScore === 'number' &&
    typeof record.entryPrice === 'number'
  )
}

export function loadLearningRecords() {
  if (!canUseStorage()) {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isLearningRecord) : []
  } catch {
    return []
  }
}

export function saveLearningRecords(records: LearningRecord[]) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(records.slice(-MAX_RECORDS)),
  )
}

export function refreshLearningRecords(
  records: LearningRecord[],
  candidates: ScoredStock[],
  now = new Date(),
) {
  const bySymbol = new Map(candidates.map((stock) => [stock.symbol, stock]))
  const today = tradingDayKey(now)
  const nextRecords = records.map((record) => {
    if (record.resolvedAt || new Date(record.dueAt) > now) {
      return record
    }

    const current = bySymbol.get(record.symbol)
    if (!current) {
      return record
    }

    const returnPct = round(
      ((current.price - record.entryPrice) / Math.max(record.entryPrice, 1)) *
        100,
    )

    return {
      ...record,
      exitPrice: current.price,
      resolvedAt: now.toISOString(),
      returnPct,
      success: returnPct >= SUCCESS_RETURN_PCT,
    }
  })
  const existingOpenKeys = new Set(
    nextRecords
      .filter((record) => !record.resolvedAt)
      .map((record) => `${record.symbol}:${record.profile}:${tradingDayKey(new Date(record.startedAt))}`),
  )
  const newRecords = candidates.flatMap((stock) => {
    const key = `${stock.symbol}:${stock.profile}:${today}`

    if (existingOpenKeys.has(key)) {
      return []
    }

    return [
      {
        id: `${key}:${stock.signalScore}`,
        symbol: stock.symbol,
        name: stock.name,
        profile: stock.profile,
        signalScore: stock.signalScore,
        entryPrice: stock.price,
        startedAt: now.toISOString(),
        dueAt: addDays(now, HORIZON_DAYS).toISOString(),
        exitPrice: null,
        resolvedAt: null,
        returnPct: null,
        success: null,
      },
    ]
  })

  return [...nextRecords, ...newRecords].slice(-MAX_RECORDS)
}

function isLearningCalibration(value: unknown): value is LearningCalibration {
  if (!value || typeof value !== 'object') {
    return false
  }

  const model = value as Partial<LearningCalibration>
  return (
    typeof model.generatedAt === 'string' &&
    typeof model.totalSamples === 'number' &&
    Array.isArray(model.buckets)
  )
}

export async function loadTrainedCalibration() {
  try {
    const response = await fetch(CALIBRATION_MODEL_URL, { cache: 'no-store' })

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    return isLearningCalibration(payload) ? payload : null
  } catch {
    return null
  }
}
