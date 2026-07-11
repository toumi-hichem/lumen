import { describe, expect, it } from 'vitest'
import { computeReadingSpeed, computeStats } from './readingStats'
import type { ReadingSession } from '@/domain/models'

const DAY = 86_400_000

function session(startedAt: number, minutes: number): ReadingSession {
  return {
    id: `s-${startedAt}`,
    bookId: 'b',
    startedAt,
    endedAt: startedAt + minutes * 60000,
    durationMs: minutes * 60000,
  }
}

describe('computeStats', () => {
  const now = new Date('2026-06-15T12:00:00').getTime()

  it('returns zeros for no sessions', () => {
    const stats = computeStats([], now)
    expect(stats.totalMinutes).toBe(0)
    expect(stats.currentStreak).toBe(0)
    expect(stats.last7Days).toHaveLength(7)
  })

  it('sums total minutes and session count', () => {
    const stats = computeStats([session(now, 30), session(now - DAY, 15)], now)
    expect(stats.totalMinutes).toBe(45)
    expect(stats.sessionCount).toBe(2)
  })

  it('counts a consecutive day streak including today', () => {
    const stats = computeStats(
      [session(now, 10), session(now - DAY, 10), session(now - 2 * DAY, 10)],
      now,
    )
    expect(stats.currentStreak).toBe(3)
  })

  it('breaks the streak on a gap', () => {
    const stats = computeStats([session(now, 10), session(now - 2 * DAY, 10)], now)
    expect(stats.currentStreak).toBe(1)
  })

  it('still counts a streak from yesterday when nothing read today', () => {
    const stats = computeStats([session(now - DAY, 10), session(now - 2 * DAY, 10)], now)
    expect(stats.currentStreak).toBe(2)
  })
})

function speedSession(
  minutes: number,
  startProgress?: number,
  endProgress?: number,
  bookId = 'b',
): ReadingSession {
  return {
    id: `s-${startProgress}-${endProgress}-${minutes}`,
    bookId,
    startedAt: 0,
    endedAt: minutes * 60000,
    durationMs: minutes * 60000,
    startProgress,
    endProgress,
  }
}

describe('computeReadingSpeed', () => {
  const words = new Map([['b', 60_000]])

  it('derives wpm from progress deltas and word counts', () => {
    // 10% of a 60k-word book in 30 minutes = 200 wpm.
    const speed = computeReadingSpeed([speedSession(30, 0.2, 0.3)], words)
    expect(speed.wpm).toBe(200)
    expect(speed.wordsRead).toBe(6000)
  })

  it('averages across sessions', () => {
    const speed = computeReadingSpeed(
      [speedSession(30, 0.0, 0.1), speedSession(30, 0.1, 0.3)],
      words,
    )
    // 18k words in 60 minutes.
    expect(speed.wpm).toBe(300)
  })

  it('ignores sessions without progress data, backwards jumps and unknown books', () => {
    const speed = computeReadingSpeed(
      [
        speedSession(30, 0.2, 0.3),
        speedSession(500, undefined, undefined), // legacy session
        speedSession(500, 0.9, 0.1), // jumped back
        speedSession(500, 0.1, 0.9, 'unknown-book'),
      ],
      words,
    )
    expect(speed.wpm).toBe(200)
  })

  it('returns null wpm when the sample is too small', () => {
    expect(computeReadingSpeed([speedSession(2, 0.0, 0.01)], words).wpm).toBeNull()
    expect(computeReadingSpeed([], words).wpm).toBeNull()
  })
})
