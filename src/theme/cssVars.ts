import type { Theme, ThemeTokens } from './tokens'

/**
 * Flatten a theme's tokens into CSS custom properties. The naming scheme is
 * `--<group>-<token>` (kebab-cased), e.g. `--color-surface-alt`,
 * `--reader-page-background`, `--hl-yellow`. The whole UI and the reader
 * stylesheet consume only these variables, so swapping a theme is a single
 * write to :root — no component re-render required for colors.
 */
export function themeToCssVars(tokens: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const [key, value] of Object.entries(tokens.color)) {
    vars[`--color-${kebab(key)}`] = value
  }
  for (const [key, value] of Object.entries(tokens.reader)) {
    vars[`--reader-${kebab(key)}`] = value
  }
  for (const [key, value] of Object.entries(tokens.highlight)) {
    vars[`--hl-${key}`] = value
  }
  return vars
}

/** Variables needed to style content inside the reader iframe document. */
export function readerCssVars(theme: Theme): Record<string, string> {
  const { reader } = theme.tokens
  return {
    '--reader-page-background': reader.pageBackground,
    '--reader-page-text': reader.pageText,
    '--reader-page-link': reader.pageLink,
    '--reader-selection-background': reader.selectionBackground,
    '--reader-selection-text': reader.selectionText,
  }
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}
