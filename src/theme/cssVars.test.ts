import { describe, expect, it } from 'vitest'
import { readerCssVars, themeToCssVars } from './cssVars'
import { darkTheme, lightTheme } from './themes'

describe('themeToCssVars', () => {
  it('flattens color, reader and highlight tokens to kebab-cased vars', () => {
    const vars = themeToCssVars(lightTheme.tokens)
    expect(vars['--color-surface-alt']).toBe(lightTheme.tokens.color.surfaceAlt)
    expect(vars['--reader-page-background']).toBe(
      lightTheme.tokens.reader.pageBackground,
    )
    expect(vars['--hl-yellow']).toBe(lightTheme.tokens.highlight.yellow)
  })

  it('produces a value for every token', () => {
    const vars = themeToCssVars(darkTheme.tokens)
    expect(Object.values(vars).every((v) => typeof v === 'string' && v)).toBe(true)
  })
})

describe('readerCssVars', () => {
  it('exposes the reader selection background', () => {
    const vars = readerCssVars(darkTheme)
    expect(vars['--reader-selection-background']).toBe(
      darkTheme.tokens.reader.selectionBackground,
    )
  })
})
