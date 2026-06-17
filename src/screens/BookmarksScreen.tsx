import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Book, Bookmark } from '@/domain/models'
import { bookRepository } from '@/storage/bookRepository'
import { bookmarkRepository } from '@/storage/bookmarkRepository'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'

export function BookmarksScreen() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<Book[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  useEffect(() => {
    void Promise.all([bookRepository.findAll(), bookmarkRepository.findAll()]).then(
      ([b, m]) => {
        setBooks(b)
        setBookmarks(m)
      },
    )
  }, [])

  const titleById = useMemo(() => new Map(books.map((b) => [b.id, b.title])), [books])

  const sorted = useMemo(
    () => [...bookmarks].sort((a, b) => b.createdAt - a.createdAt),
    [bookmarks],
  )

  const remove = async (id: string) => {
    await bookmarkRepository.delete(id)
    setBookmarks((list) => list.filter((m) => m.id !== id))
  }

  return (
    <div className="app">
      <header className="appbar">
        <button className="btn btn-icon" onClick={() => navigate(-1)} aria-label="Back">
          <Icon path={icons.back} size={18} />
        </button>
        <h1>Bookmarks</h1>
      </header>

      <main className="screen-body">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <p>No bookmarks yet.</p>
          </div>
        ) : (
          sorted.map((bm) => (
            <div key={bm.id} className="card annotation-card bookmark-row">
              <button
                className="annotation-text"
                onClick={() => navigate(`/read/${bm.bookId}`)}
              >
                <span className="bookmark-label">{bm.label || 'Bookmark'}</span>
                {bm.excerpt && <span className="bookmark-excerpt muted">{bm.excerpt}</span>}
                <small className="muted">{titleById.get(bm.bookId) ?? 'Unknown'}</small>
              </button>
              <button
                className="btn btn-icon"
                onClick={() => void remove(bm.id)}
                aria-label="Remove bookmark"
              >
                <Icon path={icons.close} size={16} />
              </button>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
