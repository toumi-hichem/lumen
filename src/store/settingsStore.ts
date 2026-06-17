import { create } from 'zustand'
import { loadJson, saveJson } from './persist'

const SETTINGS_KEY = 'lumen.settings.v1'

export type ReaderFlow = 'paginated' | 'scrolled'
export type TtsGranularity = 'sentence' | 'paragraph'

export interface ReadingPreferences {
  themeId: string
  fontId: string
  /** Font-size multiplier applied to the reader, 0.8–1.8. */
  fontScale: number
  /** Line height for body text, 1.2–2.2. */
  lineHeight: number
  /** Horizontal page margin in pixels. */
  margin: number
  /** Paginated (page-turn) vs scrolled (continuous) layout. */
  flow: ReaderFlow
  /** Justify body text. */
  justify: boolean
  /** Screen dimming overlay, 0.4 (dim) to 1 (full brightness). */
  brightness: number
  /** Warm/sepia overlay strength, 0 (off) to 1. */
  warmth: number
  /** Accessibility: wider page-turn tap targets. */
  largeTapZones: boolean
  /** Focus aid: bold word prefixes (bionic reading). Text/MOBI formats. */
  bionicReading: boolean
  /** Bionic fixation strength, 0.3 (light) to 0.7 (strong). */
  bionicStrength: number
  /** Extra letter spacing in em (dyslexia aid), 0–0.2. */
  letterSpacing: number
  /** Hide inline images to reduce visual clutter. */
  hideImages: boolean
  /** Keep the screen awake while reading. */
  keepAwake: boolean
  /** Auto-scroll speed in pixels per second (scrolled/text content). */
  autoScrollSpeed: number
}

export interface TtsPreferences {
  engineId: string
  voiceId: string
  /** Speech rate multiplier, 0.5–2.0. */
  rate: number
  pitch: number
  /** Chunking granularity for read-aloud. */
  granularity: TtsGranularity
  /** Continue narration into the next chapter automatically. */
  autoAdvance: boolean
  /** True once the user has explicitly picked an engine (suppresses the
   *  automatic switch to Supertonic when its assets become available). */
  engineChosen: boolean
}

export interface AppSettings {
  reading: ReadingPreferences
  tts: TtsPreferences
}

export const defaultSettings: AppSettings = {
  reading: {
    themeId: 'daylight',
    fontId: 'spectral',
    fontScale: 1,
    lineHeight: 1.6,
    margin: 24,
    flow: 'paginated',
    justify: false,
    brightness: 1,
    warmth: 0,
    largeTapZones: false,
    bionicReading: false,
    bionicStrength: 0.5,
    letterSpacing: 0,
    hideImages: false,
    keepAwake: false,
    autoScrollSpeed: 30,
  },
  tts: {
    engineId: 'web-speech',
    voiceId: '',
    rate: 1,
    pitch: 1,
    granularity: 'sentence',
    autoAdvance: true,
    engineChosen: false,
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
