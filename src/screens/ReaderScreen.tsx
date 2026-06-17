import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useReader } from './reader/useReader'
import { useTts } from './reader/useTts'
import { useReadAlong } from './reader/useReadAlong'
import { useKeepAwake } from './reader/useKeepAwake'
import { useAutoScroll } from './reader/useAutoScroll'
import { SelectionMenu } from './reader/SelectionMenu'
import { TtsBar } from './reader/TtsBar'
import { ReaderPanel } from './reader/ReaderPanel'
import { useSettingsStore } from '@/store/settingsStore'
import { bookSettingsRepository } from '@/storage/bookSettingsRepository'
import { hapticTick } from '@/lib/native'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'

export function ReaderScreen() {
  const { bookId = '' } = useParams()
  const navigate = useNavigate()
  const reader = useReader(bookId)
  const ttsPrefs = useSettingsStore((s) => s.tts)
  const setTts = useSettingsStore((s) => s.setTts)
  const reading = useSettingsStore((s) => s.reading)
  const [panelOpen, setPanelOpen] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [autoScroll, setAutoScroll] = useState(false)

  const format = reader.book?.format
  const canAutoScroll = format === 'text' || format === 'mobi' || format === 'azw3'

  // Keep the screen awake while reading when the user enables it.
  useKeepAwake(reader.status === 'ready' && reading.keepAwake)

  // Steady auto-scroll for continuous (text/MOBI) content.
  useAutoScroll({
    active: autoScroll && canAutoScroll,
    speed: reading.autoScrollSpeed,
    scrollBy: reader.scrollByPixels,
  })

  const maxChars = ttsPrefs.granularity === 'paragraph' ? 1200 : 240

  // onComplete is read through a ref so the controller (created once) always
  // runs the latest auto-advance closure with access to reader + tts.
  const advanceRef = useRef<() => void>(() => {})

  const tts = useTts({
    bookTitle: reader.book?.title,
    author: reader.book?.author,
    onComplete: () => advanceRef.current(),
    onNext: () => void reader.next(),
    onPrev: () => void reader.prev(),
  })

  advanceRef.current = async () => {
    if (!ttsPrefs.autoAdvance) return
    await reader.next()
    // Let the next section render before extracting its chunks.
    await new Promise((r) => setTimeout(r, 500))
    const chunks = await reader.getSpeakableChunks(maxChars)
    if (chunks.length) tts.start(chunks)
  }

  // Read-along: highlight + scroll to the spoken chunk.
  useReadAlong({
    status: tts.status,
    chunkIndex: tts.chunkIndex,
    chunks: tts.chunks,
    locate: reader.locateChunk,
    clear: reader.clearSpokenHighlight,
  })

  // Per-book voice memory: recall the voice/engine/rate last used for this book.
  useEffect(() => {
    const id = reader.book?.id
    if (!id) return
    void bookSettingsRepository.get(id).then((saved) => {
      if (!saved) return
      setTts({
        ...(saved.ttsEngineId ? { engineId: saved.ttsEngineId } : {}),
        ...(saved.ttsVoiceId !== undefined ? { voiceId: saved.ttsVoiceId } : {}),
        ...(saved.ttsRate ? { rate: saved.ttsRate } : {}),
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader.book?.id])

  const rememberVoice = () => {
    if (!reader.book) return
    void bookSettingsRepository.save({
      bookId: reader.book.id,
      ttsEngineId: ttsPrefs.engineId,
      ttsVoiceId: ttsPrefs.voiceId,
      ttsRate: ttsPrefs.rate,
    })
  }

  const startReadAloud = async () => {
    const chunks = await reader.getSpeakableChunks(maxChars)
    if (chunks.length) {
      tts.start(chunks)
      rememberVoice()
    }
  }

  const readFromSelection = async () => {
    const text = reader.selection?.text
    reader.clearSelection()
    const chunks = await reader.getSpeakableChunks(maxChars)
    if (!chunks.length) return
    let index = 0
    if (text) {
      const needle = text.replace(/\s+/g, ' ').trim().slice(0, 30).toLowerCase()
      const found = chunks.findIndex((c) => c.text.toLowerCase().includes(needle))
      if (found >= 0) index = found
    }
    tts.start(chunks, index)
    rememberVoice()
  }

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    reader.goToPercentage((event.clientX - rect.left) / rect.width)
  }

  const turn = (dir: 'next' | 'prev') => {
    void hapticTick()
    if (dir === 'next') reader.next()
    else reader.prev()
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

  const dimOpacity = 1 - Math.max(0.4, Math.min(1, reading.brightness))
  const warmOpacity = Math.max(0, Math.min(1, reading.warmth)) * 0.4

  return (
    <div className={`reader ${immersive ? 'immersive' : ''}`}>
      <header className="appbar">
        <button className="btn btn-icon" onClick={() => navigate('/')} aria-label="Back to library">
          <Icon path={icons.back} size={18} />
        </button>
        <button className="btn btn-icon" onClick={() => setPanelOpen(true)} aria-label="Open menu">
          ☰
        </button>
        <h1 style={{ fontSize: 15 }}>{reader.book?.title ?? 'Loading…'}</h1>
        {canAutoScroll && (
          <button
            className={`btn btn-icon ${autoScroll ? 'btn-primary' : ''}`}
            onClick={() => setAutoScroll((v) => !v)}
            aria-label={autoScroll ? 'Stop auto-scroll' : 'Start auto-scroll'}
            aria-pressed={autoScroll}
          >
            <Icon path={autoScroll ? icons.close : icons.chevronDown} size={18} />
          </button>
        )}
        <button
          className="btn btn-icon"
          onClick={reader.addBookmark}
          disabled={!reader.location}
          aria-label="Add bookmark"
        >
          <Icon path={icons.bookmark} size={18} />
        </button>
        <button className="btn btn-icon" onClick={() => navigate('/settings')} aria-label="Settings">
          Aa
        </button>
      </header>

      <div
        className="reader-viewport"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={reader.containerRef} style={{ position: 'absolute', inset: 0 }} />

        {/* Reading-comfort overlays (do not capture input). */}
        {dimOpacity > 0 && (
          <div
            className="reader-overlay"
            style={{ background: `rgba(0,0,0,${dimOpacity})` }}
          />
        )}
        {warmOpacity > 0 && (
          <div
            className="reader-overlay"
            style={{
              background: `rgba(255,147,41,${warmOpacity})`,
              mixBlendMode: 'multiply',
            }}
          />
        )}

        <div
          className="reader-tap-zone left"
          style={{ width: reading.largeTapZones ? '30%' : '22%' }}
          onClick={() => turn('prev')}
          role="button"
          aria-label="Previous page"
        />
        <div
          className="reader-tap-zone right"
          style={{ width: reading.largeTapZones ? '30%' : '22%' }}
          onClick={() => turn('next')}
          role="button"
          aria-label="Next page"
        />
        <div
          className="reader-tap-zone center"
          style={{ left: reading.largeTapZones ? '30%' : '22%', right: reading.largeTapZones ? '30%' : '22%' }}
          onClick={() => setImmersive((v) => !v)}
          role="button"
          aria-label="Toggle distraction-free mode"
        />

        {reader.selection && (
          <SelectionMenu
            text={reader.selection.text}
            rect={reader.selection.rect}
            onHighlight={reader.addHighlight}
            onBookmark={() => {
              reader.addBookmark()
              reader.clearSelection()
            }}
            onReadHere={() => void readFromSelection()}
            onDismiss={reader.clearSelection}
          />
        )}

        {reader.status === 'loading' && (
          <p className="muted" style={{ padding: 24 }}>
            Opening book…
          </p>
        )}
      </div>

      <div
        className="reader-progress"
        onClick={seek}
        role="slider"
        aria-label="Reading position"
        aria-valuenow={Math.round((reader.location?.progress ?? 0) * 100)}
        tabIndex={0}
      >
        <span style={{ width: `${(reader.location?.progress ?? 0) * 100}%` }} />
      </div>

      <TtsBar
        status={tts.status}
        engineId={tts.activeEngineId}
        error={tts.error}
        sleepMinutes={tts.sleepMinutes}
        onPlay={() => void startReadAloud()}
        onPause={tts.pause}
        onResume={tts.resume}
        onStop={tts.stop}
        onSetSleep={tts.setSleepTimer}
      />

      {panelOpen && (
        <ReaderPanel
          toc={reader.toc}
          bookmarks={reader.bookmarks}
          highlights={reader.highlights}
          onNavigate={reader.goTo}
          onSearch={reader.search}
          onRemoveBookmark={reader.removeBookmark}
          onRemoveHighlight={reader.removeHighlight}
          onEditHighlightNote={reader.setHighlightNote}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  )
}
