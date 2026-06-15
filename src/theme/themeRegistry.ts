import type { FontDefinition, Theme } from './tokens'
import { builtInThemes } from './themes'
import { builtInFonts } from './fonts'

/**
 * Central registry of available themes and fonts. Built-ins are registered at
 * module load; additional themes/fonts can be registered at runtime (e.g. from
 * a downloaded theme pack or a user-defined theme) without touching the rest
 * of the app. This is the seam that makes the system "modular from the start".
 */
class ThemeRegistry {
  private readonly themes = new Map<string, Theme>()
  private readonly fonts = new Map<string, FontDefinition>()

  constructor(themes: readonly Theme[], fonts: readonly FontDefinition[]) {
    themes.forEach((t) => this.themes.set(t.id, t))
    fonts.forEach((f) => this.fonts.set(f.id, f))
  }

  registerTheme(theme: Theme): void {
    this.themes.set(theme.id, theme)
  }

  registerFont(font: FontDefinition): void {
    this.fonts.set(font.id, font)
  }

  getTheme(id: string): Theme | undefined {
    return this.themes.get(id)
  }

  getFont(id: string): FontDefinition | undefined {
    return this.fonts.get(id)
  }

  listThemes(): Theme[] {
    return [...this.themes.values()]
  }

  listFonts(): FontDefinition[] {
    return [...this.fonts.values()]
  }
}

export const themeRegistry = new ThemeRegistry(builtInThemes, builtInFonts)
