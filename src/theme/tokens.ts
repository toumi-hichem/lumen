import type { HighlightColor } from '@/domain/models'

/**
 * The design-token contract. Every theme MUST provide a full set of these
 * tokens. Adding a new token here forces every theme to define it (compile
 * error otherwise), which keeps themes consistent as the system grows.
 *
 * Tokens are intentionally semantic ("surface", "textMuted") rather than
 * literal ("gray200") so themes can remap meaning freely.
 */
export interface ColorTokens {
  /** App background behind all surfaces. */
  background: string
  /** Card / panel / sheet background. */
  surface: string
  /** Secondary surface (toolbars, inputs). */
  surfaceAlt: string
  /** Primary body text. */
  text: string
  /** De-emphasised text (captions, metadata). */
  textMuted: string
  /** Brand / interactive accent. */
  primary: string
  /** Text/icon placed on top of `primary`. */
  onPrimary: string
  /** Hairline borders and dividers. */
  border: string
  /** Focus ring / selection accent. */
  accent: string
  /** Danger / destructive actions. */
  danger: string
}

/**
 * Reader-surface tokens. Kept separate from app chrome so the reading page can
 * use a paper-like palette while the surrounding UI stays dark, etc.
 */
export interface ReaderTokens {
  pageBackground: string
  pageText: string
  pageLink: string
  selectionBackground: string
  selectionText: string
  /** Background of the sentence/paragraph currently being read aloud. */
  readalongBackground: string
}

export type HighlightPalette = Record<HighlightColor, string>

export type ThemeMode = 'light' | 'dark'

export interface ThemeTokens {
  color: ColorTokens
  reader: ReaderTokens
  /** Highlight swatch colors, theme-aware so they read well in dark mode. */
  highlight: HighlightPalette
}

export interface Theme {
  /** Stable id used for persistence; never change once shipped. */
  readonly id: string
  /** Human label shown in settings. */
  readonly name: string
  readonly mode: ThemeMode
  /**
   * Family id grouping a light theme with its dark counterpart (e.g. Daylight
   * and Midnight are both family `lumen`). Each family has exactly one theme
   * per mode, which powers the light/dark toggle and the paired theme picker.
   */
  readonly family: string
  /** Human label for the family (shown once for the light/dark pair). */
  readonly familyName: string
  readonly tokens: ThemeTokens
}

/** A light/dark pair of themes sharing one visual identity. */
export interface ThemeFamily {
  readonly id: string
  readonly name: string
  readonly light: Theme
  readonly dark: Theme
}

/**
 * A registerable font. `stack` is the CSS font-family value. `load` is an
 * optional loader that lazily imports the font's (bundled, same-origin)
 * webfont CSS the first time the font is selected, which keeps the initial
 * payload small. Fonts loaded eagerly at startup (see uiFonts.ts) omit it.
 */
export interface FontDefinition {
  readonly id: string
  readonly name: string
  readonly stack: string
  readonly category: 'serif' | 'sans' | 'mono' | 'dyslexic'
  readonly load?: () => Promise<unknown>
}
