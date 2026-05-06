import type { FocusPreset, RiskProfile, UiDensity, UserProfile } from '../types/market'

const PROFILE_STORAGE_KEY = 'canvas-alpha/profile'
const WATCHLIST_STORAGE_PREFIX = 'canvas-alpha/watchlist'

export interface UserProfileDraft {
  displayName: string
  riskProfile: RiskProfile
  focusPreset: FocusPreset
  density: UiDensity
}

export const defaultProfileDraft: UserProfileDraft = {
  displayName: '',
  riskProfile: 'medium',
  focusPreset: 'balanced',
  density: 'comfortable',
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function nowIso() {
  return new Date().toISOString()
}

function safeParse<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function isRiskProfile(value: unknown): value is RiskProfile {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isFocusPreset(value: unknown): value is FocusPreset {
  return value === 'defensive' || value === 'balanced' || value === 'aggressive'
}

function isDensity(value: unknown): value is UiDensity {
  return value === 'comfortable' || value === 'compact'
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const profile = value as Partial<UserProfile>
  return (
    typeof profile.id === 'string' &&
    typeof profile.displayName === 'string' &&
    isRiskProfile(profile.riskProfile) &&
    isFocusPreset(profile.focusPreset) &&
    isDensity(profile.density) &&
    typeof profile.createdAt === 'string' &&
    typeof profile.updatedAt === 'string'
  )
}

export function loadUserProfile() {
  if (!canUseStorage()) {
    return null
  }

  const parsed = safeParse<UserProfile>(window.localStorage.getItem(PROFILE_STORAGE_KEY))
  return parsed && isUserProfile(parsed) ? parsed : null
}

export function saveUserProfile(profile: UserProfile) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

export function clearUserProfile() {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.removeItem(PROFILE_STORAGE_KEY)
}

export function loadProfileWatchlist(profileId: string) {
  if (!canUseStorage()) {
    return []
  }

  return safeParse<string[]>(
    window.localStorage.getItem(`${WATCHLIST_STORAGE_PREFIX}:${profileId}`),
  )?.filter((item) => typeof item === 'string') ?? []
}

export function saveProfileWatchlist(profileId: string, symbols: string[]) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(
    `${WATCHLIST_STORAGE_PREFIX}:${profileId}`,
    JSON.stringify([...new Set(symbols)]),
  )
}

export function buildUserProfile(
  draft: UserProfileDraft,
  existing?: UserProfile | null,
): UserProfile {
  const trimmedName = draft.displayName.trim()
  const baseName = trimmedName || '访客'
  const id =
    existing?.id ??
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${baseName}-${Date.now()}`)

  const timestamp = nowIso()

  return {
    id,
    displayName: baseName,
    riskProfile: draft.riskProfile,
    focusPreset: draft.focusPreset,
    density: draft.density,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

export function makeInitialUserDraft(profile?: UserProfile | null): UserProfileDraft {
  if (!profile) {
    return defaultProfileDraft
  }

  return {
    displayName: profile.displayName,
    riskProfile: profile.riskProfile,
    focusPreset: profile.focusPreset,
    density: profile.density,
  }
}
