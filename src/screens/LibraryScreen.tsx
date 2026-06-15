import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '@/store/libraryStore'
import type { Book } from '@/domain/models'

export function LibraryScreen() {
  const navigate = useNavigate()
  const { books, loading, importing, error, load, importFiles, remove, clearError } =
    useLibraryStore()
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) void importFiles(event.target.files)
    event.target.value = ''
  }

  const onDelete = (book: Book) => {
    if (confirm(`Remove "${book.title}" from your library?`)) void remove(book.id)
  }

  return (
    <div className="app">
      <header className="appbar">
        <h1>Lumen</h1>
        <button
          className="btn"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
        >
          Settings
        </button>
        <button
          className="btn btn-primary"
          onClick={() => fileInput.current?.click()}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Add book'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".epub,.txt,.md,.markdown,application/epub+zip,text/plain"
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

        {loading ? (
          <p className="muted">Loading library…</p>
        ) : books.length === 0 ? (
          <div className="empty-state">
            <h2>Your library is empty</h2>
            <p>Add an EPUB or text file to start reading.</p>
          </div>
        ) : (
          <div className="library-grid">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onOpen={() => navigate(`/read/${book.id}`)}
                onDelete={() => onDelete(book)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

interface BookCardProps {
  book: Book
  onOpen: () => void
  onDelete: () => void
}

function BookCard({ book, onOpen, onDelete }: BookCardProps) {
  return (
    <div
      className="book-card"
      onContextMenu={(e) => {
        e.preventDefault()
        onDelete()
      }}
    >
      <button
        className="book-cover-button"
        onClick={onOpen}
        style={{ border: 'none', padding: 0, background: 'none' }}
        aria-label={`Open ${book.title}`}
      >
        {book.coverUrl ? (
          <img className="book-cover" src={book.coverUrl} alt="" />
        ) : (
          <div className="book-cover book-cover-fallback">{book.title}</div>
        )}
      </button>
      <div className="book-meta">
        <p className="book-title">{book.title}</p>
        <p className="book-author">{book.author}</p>
      </div>
    </div>
  )
}
