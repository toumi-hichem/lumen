import { create } from 'zustand'
import { loadJson, saveJson } from './persist'

const SETTINGS_KEY = 'lumen.settings.v1'

export type ReaderFlow = 'paginated' | 'scrolled'
export type TtsGranularity = 'sentence' | 'paragraph'

export interface ReadingPreferences {
  themeId: string
  /** Follow the OS light/dark mode by swapping to the theme family's
   *  matching variant (the picked theme decides the family). */
  followSystemTheme: boolean
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
  /** Force text to wrap instead of overflowing horizontally. */
  softWrap: boolean
  /** Keep the screen awake while reading. */
  keepAwake: boolean
  /** Auto-scroll speed in pixels per second (scrolled/text content). */
  autoScrollSpeed: number
  /** Ordered list of action IDs shown in the reader footer action bar. */
  footerActionIds: string[]
}

export interface TtsPreferences {
  engineId: string
  voiceId: string
  /** Last selected voice per engine, so switching engines restores the pick. */
  voiceByEngine: Record<string, string>
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
    // Auto by default: a fresh install matches the device's light/dark mode
    // rather than forcing a light page on someone reading at night.
    followSystemTheme: true,
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
    softWrap: true,
    // A book open on screen is being read, not idled on; the display staying
    // lit is the expected behaviour, so this is on unless turned off.
    keepAwake: true,
    autoScrollSpeed: 30,
    footerActionIds: ['theme', 'tts', 'autoscroll', 'toc', 'bookmarks', 'search', 'settings'],
  },
  tts: {
    engineId: 'web-speech',
    voiceId: '',
    voiceByEngine: {},
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
    const prev = get().tts
    const tts = { ...prev, ...patch }
    if (patch.voiceId !== undefined) {
      // Remember the pick for this engine so switching back restores it.
      tts.voiceByEngine = { ...prev.voiceByEngine, [tts.engineId]: patch.voiceId }
    } else if (patch.engineId !== undefined && patch.engineId !== prev.engineId) {
      // Engine changed without an explicit voice: restore its last voice
      // (voice ids are engine-specific, so the old one would be invalid).
      tts.voiceId = prev.voiceByEngine[patch.engineId] ?? ''
    }
    set({ tts })
    void saveJson(SETTINGS_KEY, { reading: get().reading, tts })
  },
}))
