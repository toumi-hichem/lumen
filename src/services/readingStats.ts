import type { ReadingSession } from '@/domain/models'

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
