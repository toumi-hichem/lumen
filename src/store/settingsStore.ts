import { create } from 'zustand'
import { loadJson, saveJson } from './persist'

const SETTINGS_KEY = 'lumen.settings.v1'

export interface ReadingPreferences {
  themeId: string
  fontId: string
  /** Font-size multiplier applied to the reader, 0.8–1.8. */
  fontScale: number
  /** Line height for body text, 1.2–2.2. */
  lineHeight: number
  /** Horizontal page margin in pixels. */
  margin: number
}

export interface TtsPreferences {
  engineId: string
  voiceId: string
  /** Speech rate multiplier, 0.5–2.0. */
  rate: number
  pitch: number
}

export interface AppSettings {
  reading: ReadingPreferences
  tts: TtsPreferences
}

export const defaultSettings: AppSettings = {
  reading: {
    themeId: 'light',
    fontId: 'system-serif',
    fontScale: 1,
    lineHeight: 1.6,
    margin: 24,
  },
  tts: {
    engineId: 'web-speech',
    voiceId: '',
    rate: 1,
    pitch: 1,
  },
}

interface SettingsState extends AppSettings {
  hydrated: boolean
  hydrate: () => Promise<void>
  setReading: (patch: Partial<ReadingPreferences>) => void
  setTts: (patch: Partial<TtsPreferences>) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaultSettings,
  hydrated: false,

  hydrate: async () => {
    const loaded = await loadJson<AppSettings>(SETTINGS_KEY, defaultSettings)
    // Merge so newly added defaults appear for users with older saved settings.
    set({
      reading: { ...defaultSettings.reading, ...loaded.reading },
      tts: { ...defaultSettings.tts, ...loaded.tts },
      hydrated: true,
    })
  },

  setReading: (patch) => {
    const reading = { ...get().reading, ...patch }
    set({ reading })
    void saveJson(SETTINGS_KEY, { reading, tts: get().tts })
  },

  setTts: (patch) => {
    const tts = { ...get().tts, ...patch }
    set({ tts })
    void saveJson(SETTINGS_KEY, { reading: get().reading, tts })
  },
}))
