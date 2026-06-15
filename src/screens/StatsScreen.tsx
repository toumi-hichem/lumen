import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { sessionRepository } from '@/storage/sessionRepository'
import { bookRepository } from '@/storage/bookRepository'
import { computeStats, type ReadingStats } from '@/services/readingStats'

export function StatsScreen() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<ReadingStats | null>(null)
  const [finished, setFinished] = useState(0)

  useEffect(() => {
    void Promise.all([sessionRepository.findAll(), bookRepository.findAll()]).then(
      ([sessions, books]) => {
        setStats(computeStats(sessions))
        setFinished(books.filter((b) => b.status === 'finished').length)
      },
    )
  }, [])

  const maxMinutes = Math.max(1, ...(stats?.last7Days.map((d) => d.minutes) ?? [1]))

  return (
    <div className="app">
      <header className="appbar">
        <button className="btn" onClick={() => navigate(-1)} aria-label="Back">
          ←
        </button>
        <h1>Reading stats</h1>
      </header>

      <main className="screen-body">
        {!stats ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="stats-grid">
              <Stat label="Total time" value={formatMinutes(stats.totalMinutes)} />
              <Stat label="Day streak" value={`${stats.currentStreak}`} />
              <Stat label="Sessions" value={`${stats.sessionCount}`} />
              <Stat label="Finished" value={`${finished}`} />
            </div>

            <section className="settings-section" style={{ marginTop: 24 }}>
              <h2>Last 7 days</h2>
              <div className="bar-chart">
                {stats.last7Days.map((d) => (
                  <div key={d.date} className="bar-col">
                    <div
                      className="bar"
                      style={{ height: `${(d.minutes / maxMinutes) * 100}%` }}
                      title={`${d.minutes} min`}
                    />
                    <small>{d.date.slice(5)}</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-value">{value}</div>
      <div className="muted">{label}</div>
    </div>
  )
}

function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
