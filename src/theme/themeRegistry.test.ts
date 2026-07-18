import { describe, expect, it } from 'vitest'
import { themeRegistry } from './themeRegistry'
import type { Theme } from './tokens'
import { builtInThemes, lightTheme } from './themes'

describe('themeRegistry', () => {
  it('ships the built-in themes', () => {
    const ids = themeRegistry.listThemes().map((t) => t.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'daylight',
        'sepia',
        'midnight',
        'carbon',
        'solarized',
        'nord',
        'contrast',
        'forest',
        'dusk',
        'e-ink',
        'ember',
        'solarized-dark',
        'frost',
        'meadow',
        'lilac',
        'contrast-dark',
      ]),
    )
  })

  it('pairs every built-in theme into a light/dark family', () => {
    for (const theme of builtInThemes) {
      const counterpart = themeRegistry.getCounterpart(theme)
      expect(counterpart, `${theme.id} should have a counterpart`).toBeDefined()
      expect(counterpart?.family).toBe(theme.family)
      expect(counterpart?.mode).not.toBe(theme.mode)
      // The counterpart's counterpart is the theme itself (exactly one pair).
      expect(themeRegistry.getCounterpart(counterpart as Theme)?.id).toBe(theme.id)
    }
  })

  it('lists families with both variants present', () => {
    const families = themeRegistry.listFamilies()
    expect(families.length).toBe(builtInThemes.length / 2)
    for (const family of families) {
      expect(family.light.mode).toBe('light')
      expect(family.dark.mode).toBe('dark')
      expect(family.light.family).toBe(family.id)
      expect(family.dark.family).toBe(family.id)
    }
  })

  it('supports runtime registration of new themes (extensibility)', () => {
    const custom: Theme = {
      ...lightTheme,
      id: 'custom-test',
      name: 'Custom Test',
    }
    themeRegistry.registerTheme(custom)
    expect(themeRegistry.getTheme('custom-test')?.name).toBe('Custom Test')
  })

  it('returns undefined for unknown themes', () => {
    expect(themeRegistry.getTheme('does-not-exist')).toBeUndefined()
  })
})
