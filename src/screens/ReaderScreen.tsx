import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useReader } from './reader/useReader'
import { useTts } from './reader/useTts'
import { SelectionMenu } from './reader/SelectionMenu'
import { TtsBar } from './reader/TtsBar'
import { ReaderPanel } from './reader/ReaderPanel'

export function ReaderScreen() {
  const { bookId = '' } = useParams()
  const navigate = useNavigate()
  const reader = useReader(bookId)
  const tts = useTts()
  const [panelOpen, setPanelOpen] = useState(false)

  const startReadAloud = async () => {
    const chunks = await reader.getSectionText()
    if (chunks.length) tts.start(chunks)
  }

  if (reader.status === 'error') {
    return (
      <div className="app">
        <header className="appbar">
          <button className="btn" onClick={() => navigate('/')}>
            ← Library
          </button>
          <h1>Reader</h1>
        </header>
        <main className="screen-body">
          <div className="error-banner">{reader.error}</div>
        </main>
      </div>
    )
  }

  return (
    <div className="reader">
      <header className="appbar">
        <button className="btn" onClick={() => navigate('/')} aria-label="Back to library">
          ←
        </button>
        <button className="btn" onClick={() => setPanelOpen(true)}>
          ☰
        </button>
        <h1 style={{ fontSize: 15 }}>
          {reader.book?.title ?? 'Loading…'}
        </h1>
        <button
          className="btn"
          onClick={reader.addBookmark}
          disabled={!reader.location}
          aria-label="Add bookmark"
        >
          ＋ Bookmark
        </button>
        <button className="btn" onClick={() => navigate('/settings')}>
          Aa
        </button>
      </header>

      <div className="reader-viewport">
        <div
          ref={reader.containerRef}
          style={{ position: 'absolute', inset: 0 }}
        />
        {/* Tap zones for page turns (EPUB paginated flow). */}
        <div
          className="reader-tap-zone left"
          onClick={reader.prev}
          role="button"
          aria-label="Previous page"
        />
        <div
          className="reader-tap-zone right"
          onClick={reader.next}
          role="button"
          aria-label="Next page"
        />

        {reader.selection && (
          <SelectionMenu
            text={reader.selection.text}
            onHighlight={reader.addHighlight}
            onBookmark={() => {
              reader.addBookmark()
              reader.clearSelection()
            }}
            onDismiss={reader.clearSelection}
          />
        )}

        {reader.status === 'loading' && (
          <p className="muted" style={{ padding: 24 }}>
            Opening book…
          </p>
        )}
      </div>

      <div className="reader-progress" aria-hidden>
        <span style={{ width: `${(reader.location?.progress ?? 0) * 100}%` }} />
      </div>

      <TtsBar
        status={tts.status}
        engineId={tts.activeEngineId}
        error={tts.error}
        onPlay={() => void startReadAloud()}
        onPause={tts.pause}
        onResume={tts.resume}
        onStop={tts.stop}
      />

      {panelOpen && (
        <ReaderPanel
          toc={reader.toc}
          bookmarks={reader.bookmarks}
          highlights={reader.highlights}
          onNavigate={reader.goTo}
          onRemoveBookmark={reader.removeBookmark}
          onRemoveHighlight={reader.removeHighlight}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  )
}
