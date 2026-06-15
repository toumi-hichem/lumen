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
  readonly tokens: ThemeTokens
}

/**
 * A registerable font. `stack` is the CSS font-family value. `url` is an
 * optional webfont stylesheet to inject lazily when the font is selected,
 * which keeps the initial bundle small.
 */
export interface FontDefinition {
  readonly id: string
  readonly name: string
  readonly stack: string
  readonly category: 'serif' | 'sans' | 'mono' | 'dyslexic'
  readonly url?: string
}
