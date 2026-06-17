import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '@/store/libraryStore'
import { bookmarkRepository } from '@/storage/bookmarkRepository'
import { highlightRepository } from '@/storage/highlightRepository'
import { sessionRepository } from '@/storage/sessionRepository'
import { computeStats } from '@/services/readingStats'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import { homeSections, type HomeContext } from './home/sections'
import { t } from '@/i18n'
import type { Book } from '@/domain/models'

export function HomeScreen() {
  const navigate = useNavigate()
  const { books, load } = useLibraryStore()
  const [counts, setCounts] = useState({ bookmarks: 0, highlights: 0, streak: 0 })

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void Promise.all([
      bookmarkRepository.findAll(),
      highlightRepository.findAll(),
      sessionRepository.findAll(),
    ]).then(([bookmarks, highlights, sessions]) => {
      setCounts({
        bookmarks: bookmarks.length,
        highlights: highlights.length,
        streak: computeStats(sessions).currentStreak,
      })
    })
  }, [])

  const recent = useMemo(
    () =>
      books
        .filter((b) => b.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .slice(0, 8),
    [books],
  )

  const ctx: HomeContext = {
    bookCount: books.length,
    bookmarkCount: counts.bookmarks,
    highlightCount: counts.highlights,
    streak: counts.streak,
  }

  return (
    <div className="app">
      <header className="appbar">
        <h1>{t('app.name')}</h1>
        <button
          className="btn btn-icon"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
        >
          <Icon path={icons.settings} size={20} />
        </button>
      </header>

      <main className="screen-body">
        {recent.length > 0 && (
          <section>
            <h2 className="row-title">{t('library.continue')}</h2>
            <div className="book-row">
              {recent.map((book) => (
                <ContinueCard
                  key={book.id}
                  book={book}
                  onOpen={() => navigate(`/read/${book.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        <h2 className="row-title">Browse</h2>
        <div className="home-grid">
          {homeSections.map((s) => (
            <button
              key={s.id}
              className="card home-tile"
              onClick={() => navigate(s.route)}
            >
              <span className="home-tile-icon">
                <Icon path={icons[s.icon]} size={20} />
              </span>
              <span className="home-tile-text">
                <span className="home-tile-title">{s.title}</span>
                <span className="home-tile-preview muted">{s.preview(ctx)}</span>
              </span>
              <Icon path={icons.chevronRight} size={18} className="home-tile-chevron" />
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

function ContinueCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  return (
    <button
      className="continue-card"
      onClick={onOpen}
      aria-label={`Continue ${book.title}`}
    >
      {book.coverUrl ? (
        <img className="book-cover" src={book.coverUrl} alt="" />
      ) : (
        <div className="book-cover book-cover-fallback" style={coverGradient(book.title)}>
          {book.title}
        </div>
      )}
      <span className="continue-title">{book.title}</span>
    </button>
  )
}

/** Deterministic cover gradient from the title, used when no cover art. */
function coverGradient(title: string): React.CSSProperties {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hash} 50% 45%), hsl(${(hash + 40) % 360} 55% 35%))`,
    color: '#fff',
  }
}
