import { describe, expect, it } from 'vitest'
import { coverGradientCss, renderCoverPlaceholder } from './coverPlaceholder'

describe('coverGradientCss', () => {
  it('is deterministic for the same title', () => {
    expect(coverGradientCss('Dune')).toEqual(coverGradientCss('Dune'))
  })

  it('varies with the title', () => {
    expect(coverGradientCss('Dune')).not.toEqual(coverGradientCss('Foundation'))
  })
})

describe('renderCoverPlaceholder', () => {
  // jsdom has no canvas backend (the `canvas` package isn't installed), so
  // getContext('2d') returns null here; this asserts the graceful fallback
  // rather than the actual pixels, which only a real browser can rasterize.
  it('degrades to undefined without a 2D canvas context', () => {
    expect(renderCoverPlaceholder('Dune')).toBeUndefined()
  })
})
