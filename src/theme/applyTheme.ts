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
  // Mode attribute drives mode-scoped styling (e.g. dark shadows) without
  // hardcoding theme-id lists in CSS.
  target.dataset.mode = theme.mode
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme.tokens.color.background
  // Persist a tiny hint the index.html pre-paint script reads before React
  // mounts, so the first frame already has the right theme (no flash). Uses
  // localStorage directly because the script runs before any bundle code.
  try {
    localStorage.setItem(
      'lumen.theme.hint',
      JSON.stringify({
        id: theme.id,
        bg: theme.tokens.color.background,
        scheme: theme.mode,
      }),
    )
  } catch {
    // localStorage can be unavailable (private mode, storage disabled).
  }
}

let transitionTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Apply a theme with an animated transition. Uses the View Transitions API
 * (smooth full-page cross-fade, including the reader iframe) when available,
 * falling back to CSS color transitions via a temporary root class. Honors
 * prefers-reduced-motion by switching instantly.
 */
export function transitionThemeVars(theme: Theme): void {
  // No visual change (e.g. re-applied on remount) — skip the animation.
  if (document.documentElement.dataset.theme === theme.id) {
    applyThemeVars(theme)
    return
  }

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion) {
    applyThemeVars(theme)
    return
  }

  // Older WebViews lack the View Transitions API, hence the runtime check.
  if (typeof document.startViewTransition === 'function') {
    const transition = document.startViewTransition(() => applyThemeVars(theme))
    // Rapid switches or a hidden tab abort the transition and reject these
    // promises; the theme is still applied, so silence the expected errors.
    transition.ready.catch(() => {})
    transition.finished.catch(() => {})
    return
  }

  // Fallback: let every surface transition its colors for one beat.
  const root = document.documentElement
  root.classList.add('theme-transition')
  applyThemeVars(theme)
  if (transitionTimer) clearTimeout(transitionTimer)
  transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 450)
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

const loadedFontIds = new Set<string>()

/**
 * Lazily load a webfont the first time its font is selected. The loader
 * code-splits the bundled, same-origin font CSS so it downloads on demand.
 * No-op for fonts with no loader (system fonts and the eagerly-bundled UI
 * fonts) and for already-loaded fonts.
 */
export function ensureFontLoaded(font: FontDefinition): void {
  if (!font.load || loadedFontIds.has(font.id)) return
  loadedFontIds.add(font.id)
  void font.load().catch(() => loadedFontIds.delete(font.id))
}
