import { describe, expect, it } from 'vitest'
import {
  computeBookTimes,
  computeReadingSpeed,
  computeStats,
  parseDateKey,
} from './readingStats'
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

  it('returns zeroed enriched fields for no sessions', () => {
    const stats = computeStats([], now)
    expect(stats.longestStreak).toBe(0)
    expect(stats.todayMinutes).toBe(0)
    expect(stats.avgSessionMinutes).toBe(0)
    expect(stats.activeDays).toBe(0)
    expect(stats.bestDay).toBeNull()
    expect(stats.last84Days).toHaveLength(84)
  })

  it('reports minutes read today and the average session length', () => {
    const stats = computeStats(
      [session(now, 30), session(now, 10), session(now - 2 * DAY, 20)],
      now,
    )
    expect(stats.todayMinutes).toBe(40)
    expect(stats.avgSessionMinutes).toBe(20)
    expect(stats.activeDays).toBe(2)
  })

  it('finds the longest historical streak across gaps', () => {
    // A 5-day run ending 10 days ago beats the current 2-day run.
    const stats = computeStats(
      [
        ...[10, 11, 12, 13, 14].map((d) => session(now - d * DAY, 10)),
        session(now, 10),
        session(now - DAY, 10),
      ],
      now,
    )
    expect(stats.longestStreak).toBe(5)
    expect(stats.currentStreak).toBe(2)
  })

  it('reports the best day', () => {
    const stats = computeStats([session(now - 3 * DAY, 90), session(now - DAY, 25)], now)
    expect(stats.bestDay?.minutes).toBe(90)
  })

  it('orders daily ranges oldest first, ending today', () => {
    const stats = computeStats([session(now, 5)], now)
    expect(stats.last7Days[6].minutes).toBe(5)
    expect(stats.last84Days[83].minutes).toBe(5)
    expect(stats.last84Days[0].date < stats.last84Days[83].date).toBe(true)
  })
})

describe('computeBookTimes', () => {
  const now = new Date('2026-06-15T12:00:00').getTime()

  function bookSession(bookId: string, startedAt: number, minutes: number): ReadingSession {
    return { ...session(startedAt, minutes), id: `${bookId}-${startedAt}`, bookId }
  }

  it('aggregates per book and sorts most-read first', () => {
    const times = computeBookTimes([
      bookSession('a', now, 10),
      bookSession('b', now - DAY, 30),
      bookSession('a', now - 2 * DAY, 15),
    ])
    expect(times.map((t) => t.bookId)).toEqual(['b', 'a'])
    expect(times[1].minutes).toBe(25)
    expect(times[1].sessions).toBe(2)
  })

  it('tracks the most recent read per book', () => {
    const older = bookSession('a', now - 5 * DAY, 10)
    const newer = bookSession('a', now - DAY, 10)
    const [time] = computeBookTimes([older, newer])
    expect(time.lastReadAt).toBe(newer.endedAt)
  })
})

describe('parseDateKey', () => {
  it('round-trips a local date key', () => {
    const date = parseDateKey('2026-07-18')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(6)
    expect(date.getDate()).toBe(18)
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
