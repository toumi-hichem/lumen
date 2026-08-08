import { describe, expect, it } from 'vitest'
import { createSmoothScroller, type SmoothScrollOptions } from './smoothScroll'

/** Drives the scroller with a fixed 16ms frame clock, no rAF involved. */
function harness(options: Partial<SmoothScrollOptions> = {}) {
  const moves: number[] = []
  let time = 0
  let pending: ((t: number) => void) | null = null
  const scroller = createSmoothScroller((px) => moves.push(px), {
    now: () => time,
    schedule: (cb) => {
      pending = cb
      return 1
    },
    cancelScheduled: () => {
      pending = null
    },
    ...options,
  })

  const runFrames = (count = 200) => {
    for (let i = 0; i < count && pending; i++) {
      const cb = pending
      pending = null
      time += 16
      cb(time)
    }
  }

  return {
    scroller,
    moves,
    runFrames,
    total: () => moves.reduce((sum, px) => sum + px, 0),
  }
}

describe('createSmoothScroller', () => {
  it('travels the requested distance and then stops', () => {
    const h = harness()
    h.scroller.scrollBy(600)
    h.runFrames()
    expect(h.total()).toBe(600)
    expect(h.scroller.isScrolling()).toBe(false)
  })

  it('only ever writes whole pixels', () => {
    const h = harness()
    h.scroller.scrollBy(613)
    h.runFrames()
    for (const px of h.moves) expect(Number.isInteger(px)).toBe(true)
    expect(h.total()).toBe(613)
  })

  it('accelerates then decelerates instead of jumping', () => {
    const h = harness()
    h.scroller.scrollBy(600)
    h.runFrames()
    const peak = Math.max(...h.moves)
    const first = h.moves[0]
    const last = h.moves[h.moves.length - 1]
    expect(first).toBeLessThan(peak / 2)
    expect(last).toBeLessThan(peak / 2)
    // Enough frames that the motion is visible rather than a single hop.
    expect(h.moves.length).toBeGreaterThan(15)
  })

  it('never overshoots the target on any frame', () => {
    const h = harness()
    h.scroller.scrollBy(400)
    h.runFrames()
    let travelled = 0
    for (const px of h.moves) {
      travelled += px
      expect(travelled).toBeLessThanOrEqual(400 + 1e-6)
    }
  })

  it('extends the trip when a second press lands mid-scroll', () => {
    const h = harness()
    h.scroller.scrollBy(600)
    h.runFrames(3)
    expect(h.scroller.isScrolling()).toBe(true)
    h.scroller.scrollBy(600)
    h.runFrames()
    expect(h.total()).toBe(1200)
  })

  it('caps how much distance held presses can queue', () => {
    const h = harness({ maxPendingRatio: 2 })
    for (let i = 0; i < 10; i++) h.scroller.scrollBy(300)
    h.runFrames()
    expect(h.total()).toBe(600)
  })

  it('abandons the remaining distance when the direction reverses', () => {
    const h = harness()
    h.scroller.scrollBy(600)
    h.runFrames(3)
    const forward = h.total()
    h.scroller.scrollBy(-600)
    h.runFrames()
    expect(h.total() - forward).toBe(-600)
  })

  it('drops queued distance on cancel', () => {
    const h = harness()
    h.scroller.scrollBy(600)
    h.runFrames(3)
    const travelled = h.total()
    h.scroller.cancel()
    h.runFrames()
    expect(h.total()).toBe(travelled)
    expect(h.scroller.isScrolling()).toBe(false)
  })

  it('ignores a zero distance', () => {
    const h = harness()
    h.scroller.scrollBy(0)
    expect(h.scroller.isScrolling()).toBe(false)
    expect(h.moves).toHaveLength(0)
  })
})
