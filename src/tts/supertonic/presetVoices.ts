import type { TtsVoice } from '../types'

/**
 * The ten Supertonic style presets with human display names. The ids map to
 * the style-vector files (voice_styles/<id>.json) and are persisted in user
 * settings and per-book overrides — never rename them, only the names.
 */
export const PRESET_VOICES: TtsVoice[] = [
  { id: 'M1', name: 'James', gender: 'male' },
  { id: 'M2', name: 'Daniel', gender: 'male' },
  { id: 'M3', name: 'Henry', gender: 'male' },
  { id: 'M4', name: 'Oliver', gender: 'male' },
  { id: 'M5', name: 'Thomas', gender: 'male' },
  { id: 'F1', name: 'Sophie', gender: 'female' },
  { id: 'F2', name: 'Emma', gender: 'female' },
  { id: 'F3', name: 'Olivia', gender: 'female' },
  { id: 'F4', name: 'Grace', gender: 'female' },
  { id: 'F5', name: 'Chloe', gender: 'female' },
]

export const PRESET_IDS = new Set(PRESET_VOICES.map((v) => v.id))

export const DEFAULT_PRESET_ID = 'M1'

/** Unset/unknown voice ids (e.g. a fresh install) fall back to the default. */
export function presetVoiceId(voiceId: string | undefined): string {
  return voiceId && PRESET_IDS.has(voiceId) ? voiceId : DEFAULT_PRESET_ID
}
