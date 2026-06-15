import { describe, expect, it } from 'vitest'
import { computeStats } from './readingStats'
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
