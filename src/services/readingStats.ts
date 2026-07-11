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
  /** Minutes per day for the last 7 days, oldest first. */
  last7Days: DailyTotal[]
}

function localDateKey(timestamp: number): string {
  const d = new Date(timestamp)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
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
  const last7Days: DailyTotal[] = []
  for (let i = 6; i >= 0; i--) {
    const key = localDateKey(now - i * dayMs)
    last7Days.push({ date: key, minutes: Math.round(minutesByDay.get(key) ?? 0) })
  }

  // Streak: walk back from today while each day has activity.
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

  return {
    totalMinutes: Math.round(totalMs / 60000),
    sessionCount: sessions.length,
    currentStreak: streak,
    last7Days,
  }
}
