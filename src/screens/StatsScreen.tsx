import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sessionRepository } from '@/storage/sessionRepository'
import { bookRepository } from '@/storage/bookRepository'
import {
  computeBookTimes,
  computeReadingSpeed,
  computeStats,
  parseDateKey,
  type BookTime,
  type DailyTotal,
  type ReadingStats,
} from '@/services/readingStats'

interface BookTimeRow extends BookTime {
  title: string
  author?: string
}

export function StatsScreen() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<ReadingStats | null>(null)
  const [finished, setFinished] = useState(0)
  const [wpm, setWpm] = useState<number | null>(null)
  const [wordsRead, setWordsRead] = useState(0)
  const [bookTimes, setBookTimes] = useState<BookTimeRow[]>([])

  useEffect(() => {
    void Promise.all([sessionRepository.findAll(), bookRepository.findAll()]).then(
      ([sessions, books]) => {
        setStats(computeStats(sessions))
        setFinished(books.filter((b) => b.status === 'finished').length)
        const wordCounts = new Map(
          books
            .filter((b) => b.wordCount != null)
            .map((b) => [b.id, b.wordCount as number]),
        )
        const speed = computeReadingSpeed(sessions, wordCounts)
        setWpm(speed.wpm)
        setWordsRead(speed.wordsRead)
        const titles = new Map(books.map((b) => [b.id, b]))
        setBookTimes(
          computeBookTimes(sessions)
            .filter((t) => t.minutes >= 1)
            .slice(0, 6)
            .map((t) => ({
              ...t,
              title: titles.get(t.bookId)?.title ?? 'Removed book',
              author: titles.get(t.bookId)?.author,
            })),
        )
      },
    )
  }, [])

  return (
    <div className="app">
      <header className="appbar">
        <button className="btn btn-icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <h1>Reading stats</h1>
      </header>

      <main className="screen-body">
        {!stats ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="stats-grid">
              <Stat label="Today" value={formatMinutes(stats.todayMinutes)} />
              <Stat
                label="Day streak"
                value={`${stats.currentStreak}`}
                sub={stats.longestStreak > 1 ? `best ${stats.longestStreak}` : undefined}
              />
              <Stat label="Total time" value={formatMinutes(stats.totalMinutes)} />
              <Stat
                label="Sessions"
                value={`${stats.sessionCount}`}
                sub={
                  stats.sessionCount > 0
                    ? `~${formatMinutes(stats.avgSessionMinutes)} each`
                    : undefined
                }
              />
              <Stat label="Finished" value={`${finished}`} />
              <Stat
                label="Reading speed"
                value={wpm != null ? `${wpm} wpm` : '—'}
                sub={wordsRead >= 1000 ? `${formatWords(wordsRead)} words` : undefined}
              />
            </div>

            <section className="settings-section" style={{ marginTop: 24 }}>
              <h2>Last 7 days</h2>
              <WeekBars days={stats.last7Days} />
            </section>

            <section className="settings-section">
              <h2>Last 12 weeks</h2>
              <Heatmap days={stats.last84Days} />
              <div className="heatmap-legend" aria-hidden="true">
                <span>Less</span>
                <span className="heatmap-cell level-0" />
                <span className="heatmap-cell level-1" />
                <span className="heatmap-cell level-2" />
                <span className="heatmap-cell level-3" />
                <span className="heatmap-cell level-4" />
                <span>More</span>
              </div>
              {stats.bestDay && (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Best day: {formatDate(stats.bestDay.date)} —{' '}
                  {formatMinutes(stats.bestDay.minutes)} · {stats.activeDays} active{' '}
                  {stats.activeDays === 1 ? 'day' : 'days'} overall
                </p>
              )}
            </section>

            {bookTimes.length > 0 && (
              <section className="settings-section">
                <h2>Most read books</h2>
                <div className="book-times">
                  {bookTimes.map((b) => (
                    <div key={b.bookId} className="book-time-row">
                      <div className="book-time-head">
                        <span className="book-time-title">{b.title}</span>
                        <span className="muted">{formatMinutes(b.minutes)}</span>
                      </div>
                      <div className="book-time-track">
                        <div
                          className="book-time-fill"
                          style={{
                            width: `${(b.minutes / bookTimes[0].minutes) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function WeekBars({ days }: { days: DailyTotal[] }) {
  const max = Math.max(1, ...days.map((d) => d.minutes))
  return (
    <div className="bar-chart">
      {days.map((d) => (
        <div key={d.date} className="bar-col" title={`${formatDate(d.date)} — ${d.minutes} min`}>
          {d.minutes === max && d.minutes > 0 && (
            <span className="bar-label">{formatMinutes(d.minutes)}</span>
          )}
          <div className="bar" style={{ height: `${(d.minutes / max) * 100}%` }} />
          <small>{weekdayLetter(d.date)}</small>
        </div>
      ))}
    </div>
  )
}

/** GitHub-style activity heatmap: columns are weeks, rows Monday–Sunday. */
function Heatmap({ days }: { days: DailyTotal[] }) {
  if (days.length === 0) return null
  const max = Math.max(1, ...days.map((d) => d.minutes))
  // Pad the front so the first column starts on a Monday.
  const firstDow = (parseDateKey(days[0].date).getDay() + 6) % 7
  const cells: (DailyTotal | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...days,
  ]
  const weeks: (DailyTotal | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return (
    <div className="heatmap" role="img" aria-label="Daily reading activity, last 12 weeks">
      {weeks.map((week, i) => (
        <div key={i} className="heatmap-col">
          {week.map((day, j) =>
            day === null ? (
              <span key={`pad-${j}`} className="heatmap-cell empty" />
            ) : (
              <span
                key={day.date}
                className={`heatmap-cell level-${heatLevel(day.minutes, max)}`}
                title={`${formatDate(day.date)} — ${day.minutes} min`}
              />
            ),
          )}
        </div>
      ))}
    </div>
  )
}

function heatLevel(minutes: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0
  const ratio = minutes / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-value">{value}</div>
      <div className="muted">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function formatWords(words: number): string {
  if (words >= 1_000_000) return `${(words / 1_000_000).toFixed(1)}M`
  if (words >= 1000) return `${Math.round(words / 1000)}k`
  return `${words}`
}

function formatDate(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function weekdayLetter(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)
}
