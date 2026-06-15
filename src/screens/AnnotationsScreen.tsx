import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Book, Highlight, HighlightColor } from '@/domain/models'
import { bookRepository } from '@/storage/bookRepository'
import { highlightRepository } from '@/storage/highlightRepository'
import {
  downloadText,
  highlightsToJson,
  highlightsToMarkdown,
} from '@/services/annotationExport'

const COLORS: Array<HighlightColor | 'all'> = [
  'all',
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
]

export function AnnotationsScreen() {
  const navigate = useNavigate()
  const [books, setBooks] = useState<Book[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [colorFilter, setColorFilter] = useState<HighlightColor | 'all'>('all')

  useEffect(() => {
    void Promise.all([bookRepository.findAll(), highlightRepository.findAll()]).then(
      ([b, h]) => {
        setBooks(b)
        setHighlights(h)
      },
    )
  }, [])

  const titleById = useMemo(
    () => new Map(books.map((b) => [b.id, b.title])),
    [books],
  )

  const filtered = useMemo(
    () =>
      colorFilter === 'all'
        ? highlights
        : highlights.filter((h) => h.color === colorFilter),
    [highlights, colorFilter],
  )

  const exportMd = () =>
    downloadText('highlights.md', highlightsToMarkdown(books, filtered), 'text/markdown')
  const exportJson = () =>
    downloadText('highlights.json', highlightsToJson(filtered), 'application/json')

  return (
    <div className="app">
      <header className="appbar">
        <button className="btn" onClick={() => navigate(-1)} aria-label="Back">
          ←
        </button>
        <h1>Highlights</h1>
        <button className="btn" onClick={exportMd} disabled={!filtered.length}>
          Export .md
        </button>
        <button className="btn" onClick={exportJson} disabled={!filtered.length}>
          Export .json
        </button>
      </header>

      <main className="screen-body">
        <div className="filter-row">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`chip ${colorFilter === c ? 'active' : ''}`}
              onClick={() => setColorFilter(c)}
            >
              {c === 'all' ? (
                'All'
              ) : (
                <span
                  className="swatch"
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    background: `var(--hl-${c})`,
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>No highlights yet.</p>
          </div>
        ) : (
          filtered
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((hl) => (
              <div key={hl.id} className="card annotation-card">
                <button
                  className="annotation-text"
                  onClick={() => navigate(`/read/${hl.bookId}`)}
                >
                  <span
                    className="swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      background: `var(--hl-${hl.color})`,
                      marginRight: 8,
                    }}
                  />
                  {hl.text}
                </button>
                {hl.note && <div className="hl-note">{hl.note}</div>}
                <small className="muted">{titleById.get(hl.bookId) ?? 'Unknown'}</small>
              </div>
            ))
        )}
      </main>
    </div>
  )
}
