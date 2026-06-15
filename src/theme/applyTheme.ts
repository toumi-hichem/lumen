import type { FontDefinition, Theme } from './tokens'
import { themeToCssVars } from './cssVars'

/**
 * Write a theme's CSS variables to a target element's inline style (default:
 * the document root). Because all styling reads these variables, this single
 * write re-skins the entire app instantly.
 */
export function applyThemeVars(
  theme: Theme,
  target: HTMLElement = document.documentElement,
): void {
  const vars = themeToCssVars(theme.tokens)
  for (const [name, value] of Object.entries(vars)) {
    target.style.setProperty(name, value)
  }
  // Drive native form controls / scrollbars to match the theme mode.
  target.style.setProperty('color-scheme', theme.mode)
  target.dataset.theme = theme.id
}

/** Apply reading typography preferences as CSS variables. */
export function applyReadingVars(
  font: FontDefinition,
  fontScale: number,
  lineHeight: number,
  margin: number,
  target: HTMLElement = document.documentElement,
): void {
  target.style.setProperty('--reader-font-family', font.stack)
  target.style.setProperty('--reader-font-scale', String(fontScale))
  target.style.setProperty('--reader-line-height', String(lineHeight))
  target.style.setProperty('--reader-margin', `${margin}px`)
}

const injectedFontUrls = new Set<string>()

/**
 * Lazily inject a webfont stylesheet the first time its font is selected.
 * No-op for system fonts (no url) and for already-injected urls.
 */
export function ensureFontLoaded(font: FontDefinition): void {
  if (!font.url || injectedFontUrls.has(font.url)) return
  if (typeof document === 'undefined') return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = font.url
  link.dataset.fontId = font.id
  document.head.appendChild(link)
  injectedFontUrls.add(font.url)
}
