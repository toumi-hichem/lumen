import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '@/store/libraryStore'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import { Select } from '@/ui/Select'
import { t } from '@/i18n'
import { SUPPORTED_EXTENSIONS } from '@/reader/engineRegistry'
import { coverGradientCss } from '@/lib/coverPlaceholder'
import type { Book, BookStatus } from '@/domain/models'

type SortKey = 'added' | 'recent' | 'title' | 'author'

/** Picker filter derived from the engine registry so it always matches what
 *  importBook actually accepts. MIME types help pickers that ignore suffixes. */
const FILE_ACCEPT = [
  ...SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`),
  'application/epub+zip',
  'application/pdf',
  'text/plain',
].join(',')

const STATUS_FILTERS: Array<{ key: BookStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'unread', label: 'Unread' },
  { key: 'finished', label: 'Finished' },
]

export function LibraryScreen() {
  const navigate = useNavigate()
  const {
    books,
    collections,
    loading,
    importing,
    error,
    load,
    importFiles,
    remove,
    setStatus,
    createCollection,
    toggleBookInCollection,
    clearError,
  } = useLibraryStore()
  const fileInput = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('added')
  const [statusFilter, setStatusFilter] = useState<BookStatus | 'all'>('all')
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) void importFiles(event.target.files)
    event.target.value = ''
  }

  const recent = useMemo(
    () =>
      books
        .filter((b) => b.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .slice(0, 8),
    [books],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = books.filter((b) => {
      if (statusFilter !== 'all' && (b.status ?? 'unread') !== statusFilter) {
        return false
      }
      if (collectionFilter && !(b.collectionIds ?? []).includes(collectionFilter)) {
        return false
      }
      if (q && !`${b.title} ${b.author}`.toLowerCase().includes(q)) return false
      return true
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'title':
          return a.title.localeCompare(b.title)
        case 'author':
          return a.author.localeCompare(b.author)
        case 'recent':
          return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)
        default:
          return b.addedAt - a.addedAt
      }
    })
    return list
  }, [books, search, sort, statusFilter, collectionFilter])

  const newShelf = () => {
    const name = prompt('New shelf name')
    if (name) void createCollection(name)
  }

  return (
    <div className="app">
      <header className="appbar">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label="Back">
          <Icon path={icons.back} size={18} />
        </button>
        <h1>Library</h1>
        <button
          className="btn btn-primary"
          onClick={() => fileInput.current?.click()}
          disabled={importing}
        >
          {importing ? t('library.importing') : t('library.add')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          hidden
          onChange={onPick}
        />
      </header>

      <main className="screen-body">
        {error && (
          <div className="error-banner" onClick={clearError} role="alert">
            {error}
          </div>
        )}

        {!loading && books.length > 0 && (
          <>
            <div className="library-controls">
              <input
                className="select"
                placeholder="Search title or author…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select
                ariaLabel="Sort books"
                value={sort}
                onChange={(value) => setSort(value as SortKey)}
                options={[
                  { value: 'added', label: 'Recently added' },
                  { value: 'recent', label: 'Recently read' },
                  { value: 'title', label: 'Title' },
                  { value: 'author', label: 'Author' },
                ]}
              />
            </div>

            <div className="filter-row">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`chip ${statusFilter === f.key ? 'active' : ''}`}
                  onClick={() => setStatusFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
              <span className="filter-sep" />
              <button
                className={`chip ${collectionFilter === null ? 'active' : ''}`}
                onClick={() => setCollectionFilter(null)}
              >
                All shelves
              </button>
              {collections.map((c) => (
                <button
                  key={c.id}
                  className={`chip ${collectionFilter === c.id ? 'active' : ''}`}
                  onClick={() => setCollectionFilter(c.id)}
                >
                  {c.name}
                </button>
              ))}
              <button className="chip" onClick={newShelf}>
                ＋ Shelf
              </button>
            </div>
          </>
        )}

        {loading ? (
          <p className="muted">Loading library…</p>
        ) : books.length === 0 ? (
          <div className="empty-state">
            <h2>{t('library.empty.title')}</h2>
            <p>{t('library.empty.body')}</p>
          </div>
        ) : (
          <>
            {recent.length > 0 && !search && statusFilter === 'all' && !collectionFilter && (
              <section>
                <h2 className="row-title">{t('library.continue')}</h2>
                <div className="book-row">
                  {recent.map((book) => (
                    <BookCard
                      key={`recent-${book.id}`}
                      book={book}
                      collections={collections}
                      compact
                      onOpen={() => navigate(`/read/${book.id}`)}
                      onDetails={() => navigate(`/book/${book.id}`)}
                      onSetStatus={(s) => void setStatus(book.id, s)}
                      onToggleShelf={(c) => void toggleBookInCollection(book.id, c)}
                      onDelete={() => void confirmDelete(book, remove)}
                    />
                  ))}
                </div>
              </section>
            )}

            <h2 className="row-title">{t('library.all')}</h2>
            <div className="library-grid">
              {visible.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  collections={collections}
                  onOpen={() => navigate(`/read/${book.id}`)}
                  onDetails={() => navigate(`/book/${book.id}`)}
                  onSetStatus={(s) => void setStatus(book.id, s)}
                  onToggleShelf={(c) => void toggleBookInCollection(book.id, c)}
                  onDelete={() => void confirmDelete(book, remove)}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

async function confirmDelete(book: Book, remove: (id: string) => Promise<void>) {
  if (confirm(`Remove "${book.title}" from your library?`)) await remove(book.id)
}

interface BookCardProps {
  book: Book
  collections: { id: string; name: string }[]
  compact?: boolean
  onOpen: () => void
  onDetails: () => void
  onSetStatus: (status: BookStatus) => void
  onToggleShelf: (collectionId: string) => void
  onDelete: () => void
}

function BookCard({
  book,
  collections,
  compact,
  onOpen,
  onDetails,
  onSetStatus,
  onToggleShelf,
  onDelete,
}: BookCardProps) {
  const [menu, setMenu] = useState(false)
  return (
    <div className={`book-card ${compact ? 'compact' : ''}`}>
      <button
        className="book-cover-button"
        onClick={onOpen}
        style={{ border: 'none', padding: 0, background: 'none' }}
        aria-label={`Open ${book.title}`}
      >
        {book.coverUrl ? (
          <img className="book-cover" src={book.coverUrl} alt="" />
        ) : (
          <div className="book-cover book-cover-fallback" style={coverGradientCss(book.title)}>
            {book.title}
          </div>
        )}
      </button>
      <div className="book-meta">
        <p className="book-title">{book.title}</p>
        <p className="book-author">{book.author}</p>
        {book.status && book.status !== 'unread' && (
          <span className={`status-pill ${book.status}`}>{book.status}</span>
        )}
        {!compact && (
          <button className="card-menu-btn" onClick={() => setMenu((m) => !m)}>
            ⋯
          </button>
        )}
      </div>

      {menu && !compact && (
        <div className="card-menu">
          <button className="list-item" onClick={onDetails}>
            Details
          </button>
          <div className="card-menu-section">Status</div>
          {(['unread', 'reading', 'finished'] as BookStatus[]).map((s) => (
            <button key={s} className="list-item" onClick={() => onSetStatus(s)}>
              {s}
            </button>
          ))}
          {collections.length > 0 && <div className="card-menu-section">Shelves</div>}
          {collections.map((c) => (
            <button key={c.id} className="list-item" onClick={() => onToggleShelf(c.id)}>
              {(book.collectionIds ?? []).includes(c.id) && <Check size={14} />}
              {c.name}
            </button>
          ))}
          <button className="list-item danger" onClick={onDelete}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
