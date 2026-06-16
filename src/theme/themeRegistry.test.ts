import { describe, expect, it } from 'vitest'
import { themeRegistry } from './themeRegistry'
import type { Theme } from './tokens'
import { lightTheme } from './themes'

describe('themeRegistry', () => {
  it('ships the ten built-in themes', () => {
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
      ]),
    )
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
