import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { themeRegistry } from './themeRegistry'
import {
  applyReadingVars,
  applyThemeVars,
  ensureFontLoaded,
  transitionThemeVars,
} from './applyTheme'
import { applyStatusBarTheme } from '@/lib/native'
import { daylightTheme } from './themes'
import { spectral } from './fonts'
import type { FontDefinition, Theme, ThemeFamily, ThemeMode } from './tokens'

interface ThemeContextValue {
  /** The effective theme (after follow-system resolution). */
  theme: Theme
  font: FontDefinition
  /** All registered themes/fonts, for settings pickers. */
  themes: Theme[]
  fonts: FontDefinition[]
  /** Light/dark theme pairs, for the paired picker and mode toggle. */
  families: ThemeFamily[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const darkQuery = '(prefers-color-scheme: dark)'

function subscribeSystemMode(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia(darkQuery)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getSystemMode(): ThemeMode {
  if (typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia(darkQuery).matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const reading = useSettingsStore((s) => s.reading)
  const systemMode = useSyncExternalStore(subscribeSystemMode, getSystemMode)

  const theme = useMemo(() => {
    const picked = themeRegistry.getTheme(reading.themeId) ?? daylightTheme
    if (!reading.followSystemTheme || picked.mode === systemMode) return picked
    // Follow-system swaps within the family so the chosen look is kept.
    return themeRegistry.getCounterpart(picked) ?? picked
  }, [reading.themeId, reading.followSystemTheme, systemMode])

  const font = useMemo(
    () => themeRegistry.getFont(reading.fontId) ?? spectral,
    [reading.fontId],
  )

  // Re-skin the app whenever the resolved theme changes. The first paint is
  // instant (index.html already pre-painted the right palette); later
  // switches animate.
  const firstPaint = useRef(true)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      applyThemeVars(theme)
    } else {
      transitionThemeVars(theme)
    }
    void applyStatusBarTheme(theme.mode, theme.tokens.color.background)
  }, [theme])

  // Apply typography whenever font or any reading metric changes.
  useEffect(() => {
    ensureFontLoaded(font)
    applyReadingVars(
      font,
      reading.fontScale,
      reading.lineHeight,
      reading.margin,
    )
  }, [font, reading.fontScale, reading.lineHeight, reading.margin])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      font,
      themes: themeRegistry.listThemes(),
      fonts: themeRegistry.listFonts(),
      families: themeRegistry.listFamilies(),
    }),
    [theme, font],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
