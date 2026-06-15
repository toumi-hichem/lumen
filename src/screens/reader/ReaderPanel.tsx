import { useState } from 'react'
import type { Bookmark, Highlight } from '@/domain/models'
import type { TocItem } from '@/reader/types'

type Tab = 'toc' | 'bookmarks' | 'highlights'

interface ReaderPanelProps {
  toc: TocItem[]
  bookmarks: Bookmark[]
  highlights: Highlight[]
  onNavigate: (target: string) => void
  onRemoveBookmark: (id: string) => void
  onRemoveHighlight: (id: string) => void
  onClose: () => void
}

/** Slide-in navigation panel with TOC, bookmarks and highlights tabs. */
export function ReaderPanel({
  toc,
  bookmarks,
  highlights,
  onNavigate,
  onRemoveBookmark,
  onRemoveHighlight,
  onClose,
}: ReaderPanelProps) {
  const [tab, setTab] = useState<Tab>('toc')

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
            Bookmarks
          </button>
          <button
            className={tab === 'highlights' ? 'active' : ''}
            onClick={() => setTab('highlights')}
          >
            Highlights
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
                  <button
                    className="btn"
                    style={{ marginTop: 8 }}
                    onClick={() => onRemoveHighlight(hl.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">No highlights yet.</p>
            ))}
        </div>
      </aside>
    </div>
  )
}
