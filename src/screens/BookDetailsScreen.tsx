import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Book, ReadingProgress, ReadingSession } from '@/domain/models'
import { bookRepository } from '@/storage/bookRepository'
import { progressRepository } from '@/storage/progressRepository'
import { sessionRepository } from '@/storage/sessionRepository'
import { getWordCount } from '@/services/wordCount'
import {
  computeReadingSpeed,
  DEFAULT_WPM,
  type ReadingSpeed,
} from '@/services/readingStats'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'

interface Details {
  book: Book
  progress: ReadingProgress | null
  bookSessions: ReadingSession[]
  wordCount: number | null
  speed: ReadingSpeed
}

/** Per-book details: metadata, word count, and reading-time estimates based
 *  on the user's measured reading speed. */
export function BookDetailsScreen() {
  const { bookId = '' } = useParams()
  const navigate = useNavigate()
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let active = true
    async function load() {
      const book = await bookRepository.findById(bookId)
      if (!book) {
        if (active) setError('Book not found')
        return
      }
      const [progress, bookSessions, allSessions, allBooks] = await Promise.all([
        progressRepository.get(bookId),
        sessionRepository.findByBook(bookId),
        sessionRepository.findAll(),
        bookRepository.findAll(),
      ])
      // Word counting parses the whole file on first visit; render the page
      // with everything else first, then fill the estimates in.
      const wordCountByBook = new Map(
        allBooks
          .filter((b) => b.wordCount != null)
          .map((b) => [b.id, b.wordCount as number]),
      )
      if (active) {
        setDetails({
          book,
          progress: progress ?? null,
          bookSessions,
          wordCount: book.wordCount ?? null,
          speed: computeReadingSpeed(allSessions, wordCountByBook),
        })
      }
      if (book.wordCount == null) {
        const wordCount = await getWordCount(book)
        if (active && wordCount != null) {
          wordCountByBook.set(book.id, wordCount)
          setDetails((prev) =>
            prev
              ? {
                  ...prev,
                  wordCount,
                  speed: computeReadingSpeed(allSessions, wordCountByBook),
                }
              : prev,
          )
        }
      }
    }
    void load().catch((e) => {
      if (active) setError(e instanceof Error ? e.message : 'Failed to load')
    })
    return () => {
      active = false
    }
  }, [bookId])

  const book = details?.book
  const progressFraction = details?.progress?.location.progress ?? 0
  const wordCount = details?.wordCount ?? null
  const wpm = details?.speed.wpm ?? null
  const effectiveWpm = wpm ?? DEFAULT_WPM
  const totalMinutes = wordCount != null ? wordCount / effectiveWpm : null
  const remainingMinutes =
    wordCount != null ? ((1 - progressFraction) * wordCount) / effectiveWpm : null
  const timeSpentMs =
    details?.bookSessions.reduce((sum, s) => sum + s.durationMs, 0) ?? 0

  return (
    <div className="app">
      <header className="appbar">
        <button className="btn btn-icon" onClick={() => navigate(-1)} aria-label="Back">
          <Icon path={icons.back} size={18} />
        </button>
        <h1>Book details</h1>
      </header>

      <main className="screen-body">
        {error && <div className="error-banner">{error}</div>}
        {!error && !book && <p className="muted">Loading…</p>}
        {book && (
          <>
            <div className="book-details-header">
              {book.coverUrl ? (
                <img className="book-details-cover" src={book.coverUrl} alt="" />
              ) : (
                <div className="book-details-cover book-cover-fallback">{book.title}</div>
              )}
              <div>
                <h2 className="book-details-title">{book.title}</h2>
                <p className="muted">{book.author}</p>
                <p className="muted">
                  {book.format.toUpperCase()} · {formatBytes(book.fileSize)}
                  {book.language ? ` · ${book.language}` : ''}
                </p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 8 }}
                  onClick={() => navigate(`/read/${book.id}`)}
                >
                  {progressFraction > 0 ? 'Continue reading' : 'Start reading'}
                </button>
              </div>
            </div>

            <div className="stats-grid" style={{ marginTop: 20 }}>
              <Stat
                label="Word count"
                value={wordCount != null ? wordCount.toLocaleString() : 'Counting…'}
              />
              <Stat label="Progress" value={`${Math.round(progressFraction * 100)}%`} />
              <Stat
                label="Est. total time"
                value={totalMinutes != null ? formatMinutes(totalMinutes) : '—'}
              />
              <Stat
                label="Time left"
                value={remainingMinutes != null ? formatMinutes(remainingMinutes) : '—'}
              />
              <Stat label="Time spent" value={formatMinutes(timeSpentMs / 60_000)} />
              <Stat
                label="Your speed"
                value={wpm != null ? `${wpm} wpm` : `~${DEFAULT_WPM} wpm`}
              />
            </div>
            {wpm == null && (
              <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                Estimates use an average speed until enough reading has been
                tracked to measure yours.
              </p>
            )}

            <section className="settings-section" style={{ marginTop: 24 }}>
              <h2>File</h2>
              <DetailRow label="Added" value={formatDate(book.addedAt)} />
              {book.lastOpenedAt && (
                <DetailRow label="Last opened" value={formatDate(book.lastOpenedAt)} />
              )}
              <DetailRow label="Status" value={book.status ?? 'unread'} />
              <DetailRow
                label="Sessions"
                value={`${details?.bookSessions.length ?? 0}`}
              />
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="book-details-row">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function formatMinutes(total: number): string {
  const rounded = Math.round(total)
  if (rounded < 1) return '<1m'
  if (rounded < 60) return `${rounded}m`
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString()
}
