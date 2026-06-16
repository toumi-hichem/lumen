import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { themeRegistry } from './themeRegistry'
import { applyReadingVars, applyThemeVars, ensureFontLoaded } from './applyTheme'
import { applyStatusBarTheme } from '@/lib/native'
import { daylightTheme } from './themes'
import { spectral } from './fonts'
import type { FontDefinition, Theme } from './tokens'

interface ThemeContextValue {
  theme: Theme
  font: FontDefinition
  /** All registered themes/fonts, for settings pickers. */
  themes: Theme[]
  fonts: FontDefinition[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const reading = useSettingsStore((s) => s.reading)

  const theme = useMemo(
    () => themeRegistry.getTheme(reading.themeId) ?? daylightTheme,
    [reading.themeId],
  )
  const font = useMemo(
    () => themeRegistry.getFont(reading.fontId) ?? spectral,
    [reading.fontId],
  )

  // Re-skin the app whenever the resolved theme changes.
  useEffect(() => {
    applyThemeVars(theme)
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
