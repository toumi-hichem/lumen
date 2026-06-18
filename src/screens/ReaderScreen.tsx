import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useReader } from './reader/useReader'
import { useTts } from './reader/useTts'
import { useReadAlong } from './reader/useReadAlong'
import { useKeepAwake } from './reader/useKeepAwake'
import { useAutoScroll } from './reader/useAutoScroll'
import { SelectionMenu } from './reader/SelectionMenu'
import { ReaderActionBar } from './reader/ReaderActionBar'
import { ScreenLockOverlay } from './reader/ScreenLockOverlay'
import { ReaderPanel, type PanelTab } from './reader/ReaderPanel'
import { useSettingsStore } from '@/store/settingsStore'
import { useTheme } from '@/theme/ThemeProvider'
import { bookSettingsRepository } from '@/storage/bookSettingsRepository'
import { hapticTick } from '@/lib/native'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import { ArrowLeft } from 'lucide-react'

export function ReaderScreen() {
  const { bookId = '' } = useParams()
  const navigate = useNavigate()
  const reader = useReader(bookId)
  const { theme } = useTheme()
  const ttsPrefs = useSettingsStore((s) => s.tts)
  const setTts = useSettingsStore((s) => s.setTts)
  const reading = useSettingsStore((s) => s.reading)
  const setReading = useSettingsStore((s) => s.setReading)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<PanelTab>('toc')
  const [immersive, setImmersive] = useState(false)
  const [autoScroll, setAutoScroll] = useState(false)
  const [locked, setLocked] = useState(false)

  const format = reader.book?.format
  const canAutoScroll = format === 'text' || format === 'mobi' || format === 'azw3'

  useKeepAwake(reader.status === 'ready' && reading.keepAwake)

  useAutoScroll({
    active: autoScroll && canAutoScroll,
    speed: reading.autoScrollSpeed,
    scrollBy: reader.scrollByPixels,
  })

  // Request notification permission on first open so the OS media notification
  // can appear. On Android (Capacitor) this maps to POST_NOTIFICATIONS (API 33+).
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  // Reset autoscroll when the format changes to one that doesn't support it.
  useEffect(() => {
    if (!canAutoScroll) setAutoScroll(false)
  }, [canAutoScroll])

  // Auto-unlock when TTS stops.
  const ttsActiveRef = useRef(false)

  const maxChars = ttsPrefs.granularity === 'paragraph' ? 1200 : 240
  const advanceRef = useRef<() => void>(() => {})

  const tts = useTts({
    bookTitle: reader.book?.title,
    author: reader.book?.author,
    coverUrl: reader.book?.coverUrl,
    onComplete: () => advanceRef.current(),
    onNext: () => void reader.next(),
    onPrev: () => void reader.prev(),
  })

  advanceRef.current = async () => {
    if (!ttsPrefs.autoAdvance) return
    await reader.next()
    await new Promise((r) => setTimeout(r, 500))
    const chunks = await reader.getSpeakableChunks(maxChars)
    if (chunks.length) tts.start(chunks)
  }

  useEffect(() => {
    const wasActive = ttsActiveRef.current
    const isActive = tts.status !== 'idle'
    ttsActiveRef.current = isActive
    if (wasActive && !isActive) setLocked(false)
  }, [tts.status])

  useReadAlong({
    status: tts.status,
    chunkIndex: tts.chunkIndex,
    chunks: tts.chunks,
    locate: reader.locateChunk,
    clear: reader.clearSpokenHighlight,
  })

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

  const openPanel = (tab: PanelTab) => {
    setPanelTab(tab)
    setPanelOpen(true)
  }

  const handleThemeToggle = () => {
    setReading({ themeId: theme.mode === 'dark' ? 'daylight' : 'midnight' })
  }

  if (reader.status === 'error') {
    return (
      <div className="app">
        <header className="appbar">
          <button className="btn btn-icon" onClick={() => navigate('/')}>
            <ArrowLeft size={18} /> Library
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
        <button
          className="btn btn-icon"
          onClick={() => navigate('/')}
          aria-label="Back to library"
        >
          <Icon path={icons.back} size={18} />
        </button>
        <h1 style={{ fontSize: 15 }}>{reader.book?.title ?? 'Loading…'}</h1>
      </header>

      <div
        className="reader-viewport"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={reader.containerRef} style={{ position: 'absolute', inset: 0 }} />

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
          style={{
            left: reading.largeTapZones ? '30%' : '22%',
            right: reading.largeTapZones ? '30%' : '22%',
          }}
          onClick={() => setImmersive((v) => !v)}
          role="button"
          aria-label="Toggle reader menu"
        />

        <ScreenLockOverlay
          ttsActive={tts.status !== 'idle'}
          locked={locked}
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
          sleepSecondsRemaining={tts.sleepSecondsRemaining}
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

      <div className="reader-footer">
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

        <ReaderActionBar
          canAutoScroll={canAutoScroll}
          autoScroll={autoScroll}
          onToggleAutoScroll={() => setAutoScroll((v) => !v)}
          ttsStatus={tts.status}
          ttsError={tts.error}
          ttsSleepMinutes={tts.sleepMinutes}
          ttsSleepSecondsRemaining={tts.sleepSecondsRemaining}
          onTtsPlay={() => void startReadAloud()}
          onTtsPause={tts.pause}
          onTtsResume={tts.resume}
          onTtsStop={tts.stop}
          onTtsSetSleep={tts.setSleepTimer}
          themeMode={theme.mode}
          onToggleTheme={handleThemeToggle}
          onOpenPanel={openPanel}
          onOpenSettings={() => navigate('/settings')}
        />
      </div>

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
          defaultTab={panelTab}
        />
      )}
    </div>
  )
}
