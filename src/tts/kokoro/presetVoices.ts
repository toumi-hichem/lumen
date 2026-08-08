import type { TtsVoice } from '../types'

/**
 * A curated subset of Kokoro's 28 English voices (the rest are British
 * English or non-English), picked for a spread of quality grades and gender
 * balance, matching Supertonic's 10-voice roster shape. Ids are the voice
 * pack filenames (`voices/<id>.bin` in onnx-community/Kokoro-82M-v1.0-ONNX)
 * and are persisted in user settings — never rename them, only the names.
 */
export const PRESET_VOICES: TtsVoice[] = [
  { id: 'af_heart', name: 'Heart', gender: 'female' },
  { id: 'af_bella', name: 'Bella', gender: 'female' },
  { id: 'af_nicole', name: 'Nicole', gender: 'female' },
  { id: 'af_sarah', name: 'Sarah', gender: 'female' },
  { id: 'af_kore', name: 'Kore', gender: 'female' },
  { id: 'am_michael', name: 'Michael', gender: 'male' },
  { id: 'am_fenrir', name: 'Fenrir', gender: 'male' },
  { id: 'am_puck', name: 'Puck', gender: 'male' },
  { id: 'am_onyx', name: 'Onyx', gender: 'male' },
  { id: 'am_echo', name: 'Echo', gender: 'male' },
]

export const PRESET_IDS = new Set(PRESET_VOICES.map((v) => v.id))

export const DEFAULT_PRESET_ID = 'af_heart'

/** Unset/unknown voice ids (e.g. a fresh install) fall back to the default. */
export function presetVoiceId(voiceId: string | undefined): string {
  return voiceId && PRESET_IDS.has(voiceId) ? voiceId : DEFAULT_PRESET_ID
}
