import { useEffect, useRef, useState } from 'react'
import type { Bookmark, Highlight } from '@/domain/models'
import type { SearchHit, TocItem } from '@/reader/types'

export type PanelTab = 'toc' | 'bookmarks' | 'highlights' | 'search'

interface ReaderPanelProps {
  open: boolean
  activeTab: PanelTab
  onTabChange: (tab: PanelTab) => void
  toc: TocItem[]
  /** TOC href of the chapter being read; marked and scrolled to in Contents. */
  currentChapterHref?: string
  /** Fallback for engines/books whose relocate carries no href. */
  currentChapterTitle?: string
  bookmarks: Bookmark[]
  highlights: Highlight[]
  onNavigate: (target: string) => void
  onSearch: (
    query: string,
    onProgress?: (hits: SearchHit[], fraction: number) => void,
  ) => Promise<SearchHit[]>
  onRemoveBookmark: (id: string) => void
  onRemoveHighlight: (id: string) => void
  onEditHighlightNote: (id: string, note: string) => void
  onClose: () => void
}

export function ReaderPanel({
  open,
  activeTab,
  onTabChange,
  toc,
  currentChapterHref,
  currentChapterTitle,
  bookmarks,
  highlights,
  onNavigate,
  onSearch,
  onRemoveBookmark,
  onRemoveHighlight,
  onEditHighlightNote,
  onClose,
}: ReaderPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState(0)
  const activeTocItem = useRef<HTMLButtonElement | null>(null)

  // Prefer the href (unique); labels are only a fallback for engines whose
  // location has no href. Marks the first matching entry.
  const currentTocIndex = toc.findIndex((item) =>
    currentChapterHref
      ? item.href === currentChapterHref
      : Boolean(currentChapterTitle) && item.label === currentChapterTitle,
  )

  // Bring the current chapter into view when the Contents drawer opens.
  useEffect(() => {
    if (open && activeTab === 'toc') {
      activeTocItem.current?.scrollIntoView({ block: 'center' })
    }
  }, [open, activeTab, currentTocIndex])

  const runSearch = async () => {
    if (query.trim().length < 2) return
    setSearching(true)
    setSearchProgress(0)
    setResults([])
    try {
      // Results stream in per chapter so long books show hits immediately.
      const hits = await onSearch(query, (partial, fraction) => {
        setResults(partial)
        setSearchProgress(fraction)
      })
      setResults(hits)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div
      className={`panel-overlay${open ? ' open' : ''}`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-tabs">
          <button
            className={activeTab === 'toc' ? 'active' : ''}
            onClick={() => onTabChange('toc')}
          >
            Contents
          </button>
          <button
            className={activeTab === 'bookmarks' ? 'active' : ''}
            onClick={() => onTabChange('bookmarks')}
          >
            Marks
          </button>
          <button
            className={activeTab === 'highlights' ? 'active' : ''}
            onClick={() => onTabChange('highlights')}
          >
            Notes
          </button>
          <button
            className={activeTab === 'search' ? 'active' : ''}
            onClick={() => onTabChange('search')}
          >
            Search
          </button>
        </div>

        <div className="panel-list">
          {activeTab === 'toc' &&
            (toc.length ? (
              toc.map((item, i) => {
                const current = i === currentTocIndex
                return (
                  <button
                    key={`${item.href}-${i}`}
                    ref={current ? activeTocItem : undefined}
                    className={`toc-item${current ? ' current' : ''}${item.level > 0 ? ' nested' : ''}`}
                    style={{ '--toc-indent': `${item.level * 16}px` } as React.CSSProperties}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => {
                      onNavigate(item.href)
                      onClose()
                    }}
                  >
                    <span className="toc-item-marker" aria-hidden="true" />
                    <span className="toc-item-label">{item.label || 'Untitled'}</span>
                    {current && <span className="toc-item-badge">Reading</span>}
                  </button>
                )
              })
            ) : (
              <p className="muted">No table of contents.</p>
            ))}

          {activeTab === 'bookmarks' &&
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

          {activeTab === 'highlights' &&
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

          {activeTab === 'search' && (
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
              {searching && (
                <p className="muted" style={{ padding: 8 }}>
                  Searching… {Math.round(searchProgress * 100)}%
                </p>
              )}
              {results.map((hit, i) => (
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
