import { describe, expect, it } from 'vitest'
import { engineHint, listTtsEngines } from './registry'

const base = { id: 'x', name: 'X', requiresAssets: false, available: true }

describe('engineHint', () => {
  it('flags an engine the runtime cannot use at all', () => {
    expect(engineHint({ ...base, available: false }, false)).toBe('unavailable')
  })

  it('prefers "unavailable" over "needs assets"', () => {
    expect(engineHint({ ...base, available: false, requiresAssets: true }, false)).toBe(
      'unavailable',
    )
  })

  it('flags an asset-backed engine whose assets are not downloaded', () => {
    expect(engineHint({ ...base, requiresAssets: true }, false)).toBe('needs assets')
  })

  // The bug this replaced: the hint came straight off the static requiresAssets
  // flag, so it read "needs assets" forever, even once installed.
  it('shows no hint once the assets are installed', () => {
    expect(engineHint({ ...base, requiresAssets: true }, true)).toBeUndefined()
  })

  it('shows no hint for a ready engine that needs no assets', () => {
    expect(engineHint(base, false)).toBeUndefined()
  })
})

describe('listTtsEngines', () => {
  it('exposes an assets probe for engines that require assets', () => {
    for (const engine of listTtsEngines()) {
      if (engine.requiresAssets) {
        expect(engine.assetsReady, `${engine.id} must report asset state`).toBeTypeOf(
          'function',
        )
      }
    }
  })

  it('marks supertonic as requiring assets', () => {
    const supertonic = listTtsEngines().find((e) => e.id === 'supertonic')
    expect(supertonic?.requiresAssets).toBe(true)
  })
})
