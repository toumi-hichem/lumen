import { useState } from 'react'
import type { Bookmark, Highlight } from '@/domain/models'
import type { SearchHit, TocItem } from '@/reader/types'

type Tab = 'toc' | 'bookmarks' | 'highlights' | 'search'

interface ReaderPanelProps {
  toc: TocItem[]
  bookmarks: Bookmark[]
  highlights: Highlight[]
  onNavigate: (target: string) => void
  onSearch: (query: string) => Promise<SearchHit[]>
  onRemoveBookmark: (id: string) => void
  onRemoveHighlight: (id: string) => void
  onEditHighlightNote: (id: string, note: string) => void
  onClose: () => void
}

/** Slide-in navigation panel with TOC, bookmarks and highlights tabs. */
export function ReaderPanel({
  toc,
  bookmarks,
  highlights,
  onNavigate,
  onSearch,
  onRemoveBookmark,
  onRemoveHighlight,
  onEditHighlightNote,
  onClose,
}: ReaderPanelProps) {
  const [tab, setTab] = useState<Tab>('toc')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)

  const runSearch = async () => {
    if (query.trim().length < 2) return
    setSearching(true)
    setResults(await onSearch(query))
    setSearching(false)
  }

  return (
    <div className="panel-overlay" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-tabs">
          <button
            className={tab === 'toc' ? 'active' : ''}
            onClick={() => setTab('toc')}
          >
            Contents
          </button>
          <button
            className={tab === 'bookmarks' ? 'active' : ''}
            onClick={() => setTab('bookmarks')}
          >
            Marks
          </button>
          <button
            className={tab === 'highlights' ? 'active' : ''}
            onClick={() => setTab('highlights')}
          >
            Notes
          </button>
          <button
            className={tab === 'search' ? 'active' : ''}
            onClick={() => setTab('search')}
          >
            Search
          </button>
        </div>

        <div className="panel-list">
          {tab === 'toc' &&
            (toc.length ? (
              toc.map((item, i) => (
                <button
                  key={`${item.href}-${i}`}
                  className="list-item"
                  style={{ paddingLeft: 12 + item.level * 16 }}
                  onClick={() => {
                    onNavigate(item.href)
                    onClose()
                  }}
                >
                  {item.label || 'Untitled'}
                </button>
              ))
            ) : (
              <p className="muted">No table of contents.</p>
            ))}

          {tab === 'bookmarks' &&
            (bookmarks.length ? (
              bookmarks.map((bm) => (
                <div key={bm.id} className="list-item">
                  <button
                    style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
                    onClick={() => {
                      onNavigate(bm.cfi)
                      onClose()
                    }}
                  >
                    <strong>{bm.label}</strong>
                    {bm.excerpt && <div><small>{bm.excerpt.slice(0, 80)}</small></div>}
                  </button>
                  <button
                    className="btn"
                    style={{ marginTop: 8 }}
                    onClick={() => onRemoveBookmark(bm.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">No bookmarks yet.</p>
            ))}

          {tab === 'highlights' &&
            (highlights.length ? (
              highlights.map((hl) => (
                <div key={hl.id} className="list-item">
                  <button
                    style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
                    onClick={() => {
                      onNavigate(hl.cfiRange)
                      onClose()
                    }}
                  >
                    <span
                      className="swatch"
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        background: `var(--hl-${hl.color})`,
                        marginRight: 8,
                      }}
                    />
                    <small>{hl.text.slice(0, 100)}</small>
                  </button>
                  {hl.note && (
                    <div className="hl-note">{hl.note}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      className="btn"
                      onClick={() => {
                        const note = prompt('Note', hl.note ?? '')
                        if (note !== null) onEditHighlightNote(hl.id, note)
                      }}
                    >
                      {hl.note ? 'Edit note' : 'Add note'}
                    </button>
                    <button className="btn" onClick={() => onRemoveHighlight(hl.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No highlights yet.</p>
            ))}

          {tab === 'search' && (
            <div>
              <div style={{ display: 'flex', gap: 8, padding: 8 }}>
                <input
                  className="select"
                  style={{ flex: 1 }}
                  placeholder="Search in book…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                />
                <button className="btn btn-primary" onClick={() => void runSearch()}>
                  Go
                </button>
              </div>
              {searching && <p className="muted" style={{ padding: 8 }}>Searching…</p>}
              {!searching &&
                results.map((hit, i) => (
                  <button
                    key={`${hit.anchor}-${i}`}
                    className="list-item"
                    onClick={() => {
                      onNavigate(hit.anchor)
                      onClose()
                    }}
                  >
                    {hit.chapterTitle && (
                      <div><small>{hit.chapterTitle}</small></div>
                    )}
                    {hit.excerpt}
                  </button>
                ))}
              {!searching && query.length >= 2 && results.length === 0 && (
                <p className="muted" style={{ padding: 8 }}>No matches.</p>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
