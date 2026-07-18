import type { ReadingSession } from '@/domain/models'

/** Fallback words-per-minute when there is not enough data to measure. */
export const DEFAULT_WPM = 220

export interface ReadingSpeed {
  /** Measured words per minute, or null when the sample is too small. */
  wpm: number | null
  wordsRead: number
  minutes: number
}

/**
 * Derive the user's reading speed from sessions that recorded start/end
 * progress, joined with the books' cached word counts. Sessions without
 * forward progress (e.g. TTS listening while paused on a page) contribute
 * nothing and are skipped.
 */
export function computeReadingSpeed(
  sessions: ReadingSession[],
  wordCountByBook: Map<string, number>,
): ReadingSpeed {
  let words = 0
  let ms = 0
  for (const s of sessions) {
    const wordCount = wordCountByBook.get(s.bookId)
    if (
      !wordCount ||
      s.startProgress === undefined ||
      s.endProgress === undefined
    ) {
      continue
    }
    const delta = s.endProgress - s.startProgress
    if (delta <= 0) continue
    words += delta * wordCount
    ms += s.durationMs
  }
  const minutes = ms / 60_000
  // Require a meaningful sample before reporting a number.
  if (minutes < 5 || words < 200) {
    return { wpm: null, wordsRead: Math.round(words), minutes }
  }
  return { wpm: Math.round(words / minutes), wordsRead: Math.round(words), minutes }
}

export interface DailyTotal {
  /** YYYY-MM-DD local date. */
  date: string
  minutes: number
}

export interface ReadingStats {
  totalMinutes: number
  sessionCount: number
  /** Consecutive days (ending today or yesterday) with reading activity. */
  currentStreak: number
  /** The longest run of consecutive reading days, all time. */
  longestStreak: number
  /** Minutes read today. */
  todayMinutes: number
  /** Average session length in minutes (0 when there are no sessions). */
  avgSessionMinutes: number
  /** Number of days with any reading activity, all time. */
  activeDays: number
  /** The single most-read day, or null with no activity. */
  bestDay: DailyTotal | null
  /** Minutes per day for the last 7 days, oldest first. */
  last7Days: DailyTotal[]
  /** Minutes per day for the last 84 days (12 weeks), oldest first. */
  last84Days: DailyTotal[]
}

function localDateKey(timestamp: number): string {
  const d = new Date(timestamp)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Parse a YYYY-MM-DD key back into a local-time Date. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Aggregate reading sessions into displayable stats. `now` is injectable. */
export function computeStats(
  sessions: ReadingSession[],
  now: number = Date.now(),
): ReadingStats {
  const minutesByDay = new Map<string, number>()
  let totalMs = 0
  for (const s of sessions) {
    totalMs += s.durationMs
    const key = localDateKey(s.startedAt)
    minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + s.durationMs / 60000)
  }

  const dayMs = 86_400_000
  const dailyRange = (days: number): DailyTotal[] => {
    const range: DailyTotal[] = []
    for (let i = days - 1; i >= 0; i--) {
      const key = localDateKey(now - i * dayMs)
      range.push({ date: key, minutes: Math.round(minutesByDay.get(key) ?? 0) })
    }
    return range
  }

  // Current streak: walk back from today while each day has activity.
  let streak = 0
  for (let i = 0; ; i++) {
    const key = localDateKey(now - i * dayMs)
    if ((minutesByDay.get(key) ?? 0) > 0) {
      streak += 1
    } else if (i === 0) {
      // Allow the streak to count from yesterday if nothing read yet today.
      continue
    } else {
      break
    }
  }

  // Longest streak: walk day by day from the earliest active day. Uses Date
  // stepping (not fixed 24h) so DST shifts can't split a run.
  let longestStreak = 0
  let bestDay: DailyTotal | null = null
  if (minutesByDay.size > 0) {
    let earliest: string | undefined
    for (const [key, minutes] of minutesByDay) {
      if (!earliest || key < earliest) earliest = key
      if (minutes > 0 && (!bestDay || minutes > bestDay.minutes)) {
        bestDay = { date: key, minutes: Math.round(minutes) }
      }
    }
    const cursor = parseDateKey(earliest as string)
    const end = localDateKey(now)
    let run = 0
    for (;;) {
      const key = localDateKey(cursor.getTime())
      run = (minutesByDay.get(key) ?? 0) > 0 ? run + 1 : 0
      if (run > longestStreak) longestStreak = run
      if (key >= end) break
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const activeDays = [...minutesByDay.values()].filter((m) => m > 0).length

  return {
    totalMinutes: Math.round(totalMs / 60000),
    sessionCount: sessions.length,
    currentStreak: streak,
    longestStreak,
    todayMinutes: Math.round(minutesByDay.get(localDateKey(now)) ?? 0),
    avgSessionMinutes:
      sessions.length > 0 ? Math.round(totalMs / sessions.length / 60000) : 0,
    activeDays,
    bestDay,
    last7Days: dailyRange(7),
    last84Days: dailyRange(84),
  }
}

export interface BookTime {
  bookId: string
  minutes: number
  sessions: number
  lastReadAt: number
}

/** Total reading time per book, most-read first. */
export function computeBookTimes(sessions: ReadingSession[]): BookTime[] {
  const byBook = new Map<string, BookTime>()
  for (const s of sessions) {
    const entry = byBook.get(s.bookId) ?? {
      bookId: s.bookId,
      minutes: 0,
      sessions: 0,
      lastReadAt: 0,
    }
    byBook.set(s.bookId, {
      ...entry,
      minutes: entry.minutes + s.durationMs / 60000,
      sessions: entry.sessions + 1,
      lastReadAt: Math.max(entry.lastReadAt, s.endedAt),
    })
  }
  return [...byBook.values()]
    .map((b) => ({ ...b, minutes: Math.round(b.minutes) }))
    .sort((a, b) => b.minutes - a.minutes)
}
