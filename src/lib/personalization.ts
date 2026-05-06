import type { FocusPreset } from '../types/market'

const watchlistPresets: Record<FocusPreset, string[]> = {
  defensive: ['600519', '601318', '600036', '600000'],
  balanced: ['300750', '002594', '603019', '688041'],
  aggressive: ['688041', '601127', '600111', '002371'],
}

export function buildPresetWatchlist(focusPreset: FocusPreset) {
  return watchlistPresets[focusPreset].slice()
}
