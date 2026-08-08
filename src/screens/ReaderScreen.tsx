import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useReader } from './reader/useReader'
import { useTts } from './reader/useTts'
import { useReadAlong } from './reader/useReadAlong'
import { useKeepAwake } from './reader/useKeepAwake'
import { useAutoScroll } from './reader/useAutoScroll'
import { useVolumeKeys } from './reader/useVolumeKeys'
import { createSmoothScroller } from './reader/smoothScroll'
import { SelectionMenu } from './reader/SelectionMenu'
import {
  ReaderActionBar,
  TtsPanel,
  AutoScrollPanel,
  type FooterMode,
} from './reader/ReaderActionBar'
import { ScreenLockOverlay } from './reader/ScreenLockOverlay'
import { ReaderPanel, type PanelTab } from './reader/ReaderPanel'
import { RecentPositionsMenu } from './reader/RecentPositionsMenu'
import { useSettingsStore } from '@/store/settingsStore'
import { useTheme } from '@/theme/ThemeProvider'
import { themeRegistry } from '@/theme/themeRegistry'
import { bookSettingsRepository } from '@/storage/bookSettingsRepository'
import { hapticTick } from '@/lib/native'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import { ArrowLeft } from 'lucide-react'

/** How much of the screen one volume press moves in continuous flow: a page,
 *  less a sliver of overlap so the line being read stays in view. */
const VOLUME_SCROLL_FRACTION = 0.85

export function ReaderScreen() {
  const { bookId = '' } = useParams()
  const navigate = useNavigate()
  // Books open clean: the chrome is a layer that floats over the page, so
  // leaving it up on entry would cover the first and last lines of text.
  const [immersive, setImmersive] = useState(true)
  // In continuous mode there are no tap-zone overlays, so a tap inside the
  // content toggles the reader chrome instead.
  const toggleImmersive = useCallback(() => setImmersive((v) => !v), [])
  const reader = useReader(bookId, toggleImmersive)
  const { theme } = useTheme()
  const ttsPrefs = useSettingsStore((s) => s.tts)
  const setTts = useSettingsStore((s) => s.setTts)
  const reading = useSettingsStore((s) => s.reading)
  const setReading = useSettingsStore((s) => s.setReading)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelTab, setPanelTab] = useState<PanelTab>('toc')
  const [exitMenuOpen, setExitMenuOpen] = useState(false)
  const appbarRef = useRef<HTMLElement>(null)
  const [autoScroll, setAutoScroll] = useState(false)
  const [locked, setLocked] = useState(false)
  // Which footer view is shown. The nav bar always occupies the footer; the
  // tts/autoscroll panels stack on top of it.
  const [footerMode, setFooterMode] = useState<FooterMode>('default')

  // Continuous (scrolled) layout: drop the page-turn tap zones so the content
  // scrolls freely; a tap inside it toggles the chrome via the engine onTap.
  const continuous = reading.flow === 'scrolled'

  useLayoutEffect(() => {
    const el = appbarRef.current
    if (!el) return
    const update = () =>
      document.documentElement.style.setProperty('--appbar-height', `${el.offsetHeight}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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

  // Auto-unlock when TTS or auto scroll stops.
  const ttsActiveRef = useRef(false)
  const autoScrollActiveRef = useRef(false)

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

  // Keep the ref pointing at the latest closure without mutating during
  // render (render must stay pure); runs after every commit.
  useEffect(() => {
    advanceRef.current = async () => {
      if (!ttsPrefs.autoAdvance) return
      await reader.next()
      await new Promise((r) => setTimeout(r, 500))
      const chunks = await reader.getSpeakableChunks(maxChars)
      if (chunks.length) tts.start(chunks)
    }
  })

  // Open the TTS footer panel when narration starts playing (e.g. via a
  // media-session headset button). Check for 'playing' specifically so the
  // eager engine pre-warm (idle → loading → idle) doesn't open it on mount.
  const prevTtsStatusRef = useRef(tts.status)
  useEffect(() => {
    const prev = prevTtsStatusRef.current
    prevTtsStatusRef.current = tts.status
    if (prev !== 'playing' && tts.status === 'playing') {
      setFooterMode('tts')
      // Narration can start without the chrome up (headset button); reveal it
      // so the panel it just opened is actually on screen.
      setImmersive(false)
    }
  }, [tts.status])

  useEffect(() => {
    const wasActive = ttsActiveRef.current
    const isActive = tts.status !== 'idle'
    ttsActiveRef.current = isActive
    if (wasActive && !isActive) setLocked(false)
  }, [tts.status])

  useEffect(() => {
    const wasActive = autoScrollActiveRef.current
    const isActive = autoScroll && canAutoScroll
    autoScrollActiveRef.current = isActive
    if (wasActive && !isActive) setLocked(false)
  }, [autoScroll, canAutoScroll])

  useReadAlong({
    status: tts.status,
    chunkIndex: tts.chunkIndex,
    chunks: tts.chunks,
    locate: reader.locateChunk,
    clear: reader.clearSpokenHighlight,
  })

  // Which book's saved TTS settings have been restored. Guards the persist
  // effect below so opening a book never overwrites its remembered voice with
  // the global one before the restore has run.
  const ttsRestoredBookRef = useRef<string | null>(null)

  useEffect(() => {
    const id = reader.book?.id
    if (!id) return
    ttsRestoredBookRef.current = null
    void bookSettingsRepository.get(id).then((saved) => {
      const current = useSettingsStore.getState().tts
      if (!saved) {
        // Nothing remembered for this book yet.
      } else if (!current.engineChosen && saved.ttsEngineId) {
        // No explicit global engine choice yet — adopt the book's remembered
        // engine together with its voice.
        setTts({
          engineId: saved.ttsEngineId,
          ...(saved.ttsVoiceId !== undefined ? { voiceId: saved.ttsVoiceId } : {}),
          ...(saved.ttsRate ? { rate: saved.ttsRate } : {}),
        })
      } else {
        // The user picked an engine globally — it wins. A per-book engine must
        // not silently override it. Restore voice/rate only when the remembered
        // engine matches the one in use (voice ids are engine-specific).
        const sameEngine = !saved.ttsEngineId || saved.ttsEngineId === current.engineId
        setTts({
          ...(sameEngine && saved.ttsVoiceId !== undefined ? { voiceId: saved.ttsVoiceId } : {}),
          ...(saved.ttsRate ? { rate: saved.ttsRate } : {}),
        })
      }
      ttsRestoredBookRef.current = id
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader.book?.id])

  // Remember the latest engine/voice/rate for this book as soon as it changes,
  // not just when narration starts, so a new pick survives reopening the book.
  useEffect(() => {
    const id = reader.book?.id
    if (!id || ttsRestoredBookRef.current !== id) return
    void bookSettingsRepository.save({
      bookId: id,
      ttsEngineId: ttsPrefs.engineId,
      ttsVoiceId: ttsPrefs.voiceId,
      ttsRate: ttsPrefs.rate,
    })
  }, [reader.book?.id, ttsPrefs.engineId, ttsPrefs.voiceId, ttsPrefs.rate])

  // Chunk extraction (walking the chapter's DOM and computing a CFI per
  // sentence) yields periodically but can still take a beat on long
  // chapters; flip the tts icon to its loading state right away so tapping
  // play never looks like nothing happened.
  const [preparingTts, setPreparingTts] = useState(false)

  const startReadAloud = async () => {
    setPreparingTts(true)
    try {
      const chunks = await reader.getSpeakableChunks(maxChars)
      if (chunks.length) {
        // Begin narration at the top of the page being read, not the chapter.
        tts.start(chunks, reader.currentChunkIndex())
      }
    } finally {
      setPreparingTts(false)
    }
  }

  const readFromSelection = async () => {
    const sel = reader.selection
    reader.clearSelection()
    setPreparingTts(true)
    try {
      const chunks = await reader.getSpeakableChunks(maxChars)
      if (!chunks.length) return
      // Resolve the selection's own anchor to a chunk; the fuzzy text match is
      // only a fallback (it fails on selections spanning block boundaries).
      let index = sel?.cfiRange ? reader.chunkIndexForAnchor(sel.cfiRange) : null
      if (index == null && sel?.text) {
        const needle = sel.text.replace(/\s+/g, ' ').trim().slice(0, 30).toLowerCase()
        const found = chunks.findIndex((c) => c.text.toLowerCase().includes(needle))
        if (found >= 0) index = found
      }
      tts.start(chunks, index ?? 0)
    } finally {
      setPreparingTts(false)
    }
  }

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    reader.goToChapterPercentage((event.clientX - rect.left) / rect.width)
  }

  const turn = (dir: 'next' | 'prev') => {
    // While the selection menu is up, a tap outside it only dismisses it.
    if (reader.selection) {
      reader.clearSelection()
      return
    }
    void hapticTick()
    if (dir === 'next') reader.next()
    else reader.prev()
  }

  const openPanel = (tab: PanelTab) => {
    setPanelTab(tab)
    setPanelOpen(true)
  }

  const handleThemeToggle = () => {
    // Flip to the same family's other mode; explicit toggling overrides
    // follow-system so the choice sticks.
    const counterpart = themeRegistry.getCounterpart(theme)
    setReading({
      themeId: counterpart?.id ?? (theme.mode === 'dark' ? 'daylight' : 'midnight'),
      followSystemTheme: false,
    })
  }

  const openTts = () => {
    setFooterMode('tts')
    if (tts.status === 'idle') void startReadAloud()
  }
  const openAutoScroll = () => setFooterMode('autoscroll')

  // Volume-key navigation. The keys are only borrowed while the book has the
  // screen to itself: any chrome (reader menu, footer panel, selection menu,
  // lock overlay) or active narration hands them back to the system, so they
  // adjust the volume as usual.
  const volumeKeysEnabled =
    reader.status === 'ready' &&
    immersive &&
    !panelOpen &&
    !exitMenuOpen &&
    !locked &&
    !reader.selection &&
    footerMode === 'default' &&
    tts.status === 'idle'

  const volumeScroller = useMemo(
    () => createSmoothScroller(reader.scrollByPixels),
    [reader.scrollByPixels],
  )

  // Stop mid-flight motion as soon as the keys are handed back, and on exit.
  useEffect(() => {
    if (!volumeKeysEnabled) volumeScroller.cancel()
  }, [volumeKeysEnabled, volumeScroller])
  useEffect(() => () => volumeScroller.cancel(), [volumeScroller])

  useVolumeKeys({
    enabled: volumeKeysEnabled,
    onPress: ({ direction, repeat }) => {
      if (continuous) {
        // One page per press, ramped up and down so the eye keeps its place
        // instead of having to find it again after a jump.
        const step = window.innerHeight * VOLUME_SCROLL_FRACTION
        volumeScroller.scrollBy(direction === 'down' ? step : -step)
        return
      }
      // Auto-repeat would riffle through the book; one press, one page.
      if (repeat) return
      turn(direction === 'down' ? 'next' : 'prev')
    },
  })

  if (reader.status === 'error') {
    return (
      <div className="app">
        <header className="appbar">
          <button className="btn btn-icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} /> Back
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
      <header className="appbar" ref={appbarRef}>
        <button
          className="btn btn-icon"
          onClick={() => {
            // First back press surfaces recent jump origins (accidental seek
            // / fast-flip recovery); pressing again actually exits.
            if (exitMenuOpen) {
              navigate(-1)
            } else if (reader.jumpHistory.length) {
              setExitMenuOpen(true)
            } else {
              navigate(-1)
            }
          }}
          aria-label="Back"
        >
          <Icon path={icons.back} size={18} />
        </button>
        <h1 style={{ fontSize: 15 }}>{reader.book?.title ?? 'Loading…'}</h1>
      </header>

      {exitMenuOpen && (
        <RecentPositionsMenu
          entries={reader.jumpHistory}
          onSelect={(entry) => {
            setExitMenuOpen(false)
            reader.goTo(entry.cfi)
          }}
          onExit={() => navigate(-1)}
          onClose={() => setExitMenuOpen(false)}
        />
      )}

      <div
        className="reader-viewport"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={reader.containerRef}
          style={{
            position: 'absolute',
            // The content box is a fixed size: it always fills the screen and
            // the header/footer float over it as a separate layer. Insetting it
            // while the chrome is visible would resize the box on every toggle,
            // forcing the engine to re-paginate (a visible flash and a lost
            // page position). Keep it clear of the notch / home indicator only.
            top: 'env(safe-area-inset-top, 0px)',
            bottom: 'env(safe-area-inset-bottom, 0px)',
            left: 0,
            right: 0,
            // Match the page colour so any brief engine re-render shows the
            // page, not a white flash.
            background: theme.tokens.reader.pageBackground,
          }}
        />

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

        {!continuous && (
          <>
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
              onClick={() => {
                if (reader.selection) reader.clearSelection()
                else setImmersive((v) => !v)
              }}
              role="button"
              aria-label="Toggle reader menu"
            />
          </>
        )}

        <ScreenLockOverlay
          ttsActive={tts.status !== 'idle'}
          autoScrollActive={autoScroll && canAutoScroll}
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

      {/* Footer panels overlay the nav bar rather than replacing it. */}
      {footerMode === 'tts' && (
        <TtsPanel
          ttsStatus={preparingTts ? 'loading' : tts.status}
          ttsError={tts.error}
          ttsFallbackReason={tts.fallbackReason}
          ttsModelState={tts.modelState}
          ttsChunkIndex={tts.chunkIndex}
          ttsSynthesizingIndex={tts.synthesizingIndex}
          ttsChunkCount={tts.chunks.length}
          ttsSleepMinutes={tts.sleepMinutes}
          ttsSleepSecondsRemaining={tts.sleepSecondsRemaining}
          onTtsPlay={() => void startReadAloud()}
          onTtsPause={tts.pause}
          onTtsResume={tts.resume}
          onTtsStop={tts.stop}
          onTtsSetSleep={tts.setSleepTimer}
          onBack={() => setFooterMode('default')}
        />
      )}
      {footerMode === 'autoscroll' && (
        <AutoScrollPanel
          autoScroll={autoScroll}
          canAutoScroll={canAutoScroll}
          onToggle={() => setAutoScroll((v) => !v)}
          speed={reading.autoScrollSpeed}
          onSpeedChange={(autoScrollSpeed) => setReading({ autoScrollSpeed })}
          onBack={() => setFooterMode('default')}
        />
      )}

      <div className="reader-footer">
        {/* Chapter-scoped: the bar spans the current chapter, not the book. */}
        <div
          className="reader-progress"
          onClick={seek}
          role="slider"
          aria-label="Position in chapter"
          aria-valuenow={Math.round(
            (reader.location?.chapterProgress ?? reader.location?.progress ?? 0) * 100,
          )}
          tabIndex={0}
        >
          <span
            style={{
              width: `${(reader.location?.chapterProgress ?? reader.location?.progress ?? 0) * 100}%`,
            }}
          />
        </div>

        <ReaderActionBar
          canAutoScroll={canAutoScroll}
          autoScroll={autoScroll}
          ttsStatus={preparingTts ? 'loading' : tts.status}
          themeMode={theme.mode}
          onToggleTheme={handleThemeToggle}
          onOpenTts={openTts}
          onOpenAutoScroll={openAutoScroll}
          onOpenPanel={openPanel}
          onOpenSettings={() => navigate('/settings')}
        />
      </div>

      <ReaderPanel
        open={panelOpen}
        activeTab={panelTab}
        onTabChange={setPanelTab}
        toc={reader.toc}
        currentChapterHref={reader.location?.chapterHref}
        currentChapterTitle={reader.location?.chapterTitle}
        bookmarks={reader.bookmarks}
        highlights={reader.highlights}
        onNavigate={reader.goTo}
        onSearch={reader.search}
        onRemoveBookmark={reader.removeBookmark}
        onRemoveHighlight={reader.removeHighlight}
        onEditHighlightNote={reader.setHighlightNote}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  )
}
