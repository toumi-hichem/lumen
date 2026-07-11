import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Book,
  Bookmark,
  Highlight,
  HighlightColor,
} from '@/domain/models'
import { createId } from '@/lib/id'
import { getErrorMessage } from '@/lib/result'
import { createEngine } from '@/reader/engineRegistry'
import type {
  BookEngine,
  BookLocationInfo,
  SearchHit,
  SelectionInfo,
  SpeakableChunk,
  TocItem,
} from '@/reader/types'
import { buildReaderTheme } from '@/reader/readerTheme'
import { bookRepository } from '@/storage/bookRepository'
import { bookmarkRepository } from '@/storage/bookmarkRepository'
import { highlightRepository } from '@/storage/highlightRepository'
import { progressRepository } from '@/storage/progressRepository'
import { sessionRepository } from '@/storage/sessionRepository'
import { fileStore } from '@/storage/fileStore'
import { useTheme } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'

type ReaderStatus = 'loading' | 'ready' | 'error'

/** A position the user jumped away from (seek, TOC jump, fast page flips). */
export interface JumpEntry {
  cfi: string
  progress: number
  chapterTitle?: string
  at: number
}

/** Page turns within this window count as one "burst" of fast flipping. */
const BURST_WINDOW_MS = 2500
/** Turns in one burst before the burst start is recorded as a jump origin. */
const BURST_THRESHOLD = 5

export interface ReaderApi {
  status: ReaderStatus
  error?: string
  book?: Book
  location?: BookLocationInfo
  toc: TocItem[]
  bookmarks: Bookmark[]
  highlights: Highlight[]
  selection?: SelectionInfo
  containerRef: (node: HTMLDivElement | null) => void
  next: () => void
  prev: () => void
  goTo: (target: string) => void
  addBookmark: () => void
  removeBookmark: (id: string) => void
  addHighlight: (color: HighlightColor) => void
  removeHighlight: (id: string) => void
  setHighlightNote: (id: string, note: string) => void
  clearSelection: () => void
  /** Plain-text of the current section, chunked for read-aloud. */
  getSectionText: () => Promise<string[]>
  /** Anchored speakable chunks for read-along + tap-to-start. */
  getSpeakableChunks: (maxChars?: number) => Promise<SpeakableChunk[]>
  /** Jump to a fraction (0..1) through the book. */
  goToPercentage: (p: number) => void
  /** Jump to a fraction (0..1) within the current chapter (falls back to the
   *  whole book for engines without chapter structure). */
  goToChapterPercentage: (p: number) => void
  /** Full-text search across the book; `onProgress` streams partial results. */
  search: (
    query: string,
    onProgress?: (hits: SearchHit[], fraction: number) => void,
  ) => Promise<SearchHit[]>
  /** First speakable chunk on the current page (after getSpeakableChunks). */
  currentChunkIndex: () => number
  /** Chunk containing an anchor such as a selection's CFI range. */
  chunkIndexForAnchor: (anchor: string) => number | null
  /** Positions the user recently jumped away from, newest first. */
  jumpHistory: JumpEntry[]
  /** Highlight + scroll to a spoken chunk (read-along). */
  locateChunk: (chunk: SpeakableChunk) => void
  /** Remove the read-along highlight. */
  clearSpokenHighlight: () => void
  /** Resolve the chunk at client coordinates (tap-to-start). */
  chunkAtPoint: (x: number, y: number) => SpeakableChunk | null
  /** Scroll continuous content by a pixel delta (auto-scroll); no-op if the
   *  engine has no scrollable viewport. */
  scrollByPixels: (px: number) => void
}

export function useReader(bookId: string, onTap?: () => void): ReaderApi {
  const { theme, font } = useTheme()
  const reading = useSettingsStore((s) => s.reading)

  // Keep the latest tap handler in a ref so the engine, wired once per mount,
  // always calls the current callback.
  const onTapRef = useRef(onTap)
  onTapRef.current = onTap

  const [status, setStatus] = useState<ReaderStatus>('loading')
  const [error, setError] = useState<string>()
  const [book, setBook] = useState<Book>()
  const [location, setLocation] = useState<BookLocationInfo>()
  const [toc, setToc] = useState<TocItem[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [selection, setSelection] = useState<SelectionInfo>()
  const [jumpHistory, setJumpHistory] = useState<JumpEntry[]>([])

  const engineRef = useRef<BookEngine | null>(null)
  const containerEl = useRef<HTMLDivElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const sessionStart = useRef(0)
  const sessionBookId = useRef('')
  const markedFinished = useRef(false)
  // Progress at the start of the current session span and right now, used to
  // derive reading speed (words/minute) from flushed sessions.
  const sessionStartProgress = useRef<number | undefined>(undefined)
  const latestProgress = useRef<number | undefined>(undefined)
  // Fast page-flip burst tracking for the jump history.
  const burst = useRef<{ startedAt: number; count: number; origin: JumpEntry | null; pushed: boolean }>({
    startedAt: 0,
    count: 0,
    origin: null,
    pushed: false,
  })

  // Callback ref so we know exactly when the viewport node is in the DOM.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerEl.current = node
  }, [])

  // Engine lifecycle, keyed by book.
  useEffect(() => {
    let active = true
    setStatus('loading')

    // Persist the reading time accrued so far and restart the session clock.
    // Idempotent: a flushed span is never counted again, so this is safe to
    // call from visibility changes, pagehide AND the unmount cleanup. Spans
    // under 10s are dropped (accidental opens / quick tab switches).
    const flushSession = () => {
      const start = sessionStart.current
      if (!sessionBookId.current || !start) return
      const now = Date.now()
      sessionStart.current = now
      const startProgress = sessionStartProgress.current
      const endProgress = latestProgress.current
      sessionStartProgress.current = latestProgress.current
      const elapsed = now - start
      if (elapsed > 10_000) {
        void sessionRepository.add({
          id: createId('sess'),
          bookId: sessionBookId.current,
          startedAt: start,
          endedAt: now,
          durationMs: elapsed,
          startProgress,
          endProgress,
        })
      }
    }

    // Flush when the app is backgrounded or the page is being torn down, so a
    // process kill doesn't lose the session. On return, restart the clock so
    // time spent hidden is not counted as reading.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushSession()
      else if (sessionStart.current) {
        sessionStart.current = Date.now()
        sessionStartProgress.current = latestProgress.current
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flushSession)

    async function boot() {
      try {
        const loaded = await bookRepository.findById(bookId)
        if (!loaded) throw new Error('Book not found')
        const blob = await fileStore.get(loaded.fileKey)
        if (!blob) throw new Error('Book file is missing')

        const engine = createEngine(loaded.format)
        engine.setFlow(reading.flow)
        await engine.open(await blob.arrayBuffer())
        if (!active) return engine.destroy()

        // Wait for the viewport to be in the DOM and fully laid out.
        await waitFor(() => {
          const el = containerEl.current
          return el && el.clientHeight > 0 ? el : null
        })
        if (!active || !containerEl.current) return engine.destroy()

        await engine.renderTo(containerEl.current)
        engine.applyTheme(buildReaderTheme(theme, font, reading))

        engine.onLocationChange((loc) => {
          latestProgress.current = loc.progress
          if (sessionStartProgress.current === undefined) {
            sessionStartProgress.current = loc.progress
          }
          setLocation(loc)
          scheduleSave(loaded.id, loc)
        })
        engine.onSelection((sel) => setSelection(sel ?? undefined))
        engine.onTap?.(() => onTapRef.current?.())

        const [savedToc, savedProgress, savedBookmarks, savedHighlights] =
          await Promise.all([
            engine.toc(),
            progressRepository.get(loaded.id),
            bookmarkRepository.findByBook(loaded.id),
            highlightRepository.findByBook(loaded.id),
          ])

        await engine.display(savedProgress?.location.cfi)
        // Re-apply persisted highlights onto the freshly rendered content.
        // Tapping a drawn range re-selects the whole of it.
        for (const hl of savedHighlights) {
          engine.addHighlight(
            hl.cfiRange,
            hl.color,
            theme.tokens.highlight[hl.color],
            () => engine.selectAnnotation?.(hl.cfiRange),
          )
        }
        // Bookmarks made from a selection are drawn as highlights too.
        for (const bm of savedBookmarks) {
          const range = bm.cfiRange
          if (range) {
            engine.addHighlight(range, 'blue', theme.tokens.highlight.blue, () =>
              engine.selectAnnotation?.(range),
            )
          }
        }

        if (!active) return engine.destroy()
        engineRef.current = engine
        setBook(loaded)
        setToc(savedToc)
        setBookmarks(savedBookmarks)
        setHighlights(savedHighlights)
        setStatus('ready')
        sessionStart.current = Date.now()
        sessionBookId.current = loaded.id
        markedFinished.current = loaded.status === 'finished'
        void bookRepository.save({
          ...loaded,
          lastOpenedAt: Date.now(),
          status: loaded.status === 'finished' ? 'finished' : 'reading',
        })
      } catch (e) {
        if (active) {
          setError(getErrorMessage(e))
          setStatus('error')
        }
      }
    }

    void boot()
    return () => {
      active = false
      clearTimeout(saveTimer.current)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flushSession)
      // Record whatever accrued since the last flush (ignores short spans).
      flushSession()
      sessionStart.current = 0
      engineRef.current?.destroy()
      engineRef.current = null
    }
    // Re-mount when the layout mode changes; saved position is restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, reading.flow])

  // Re-theme the reader surface when theme / typography preferences change.
  // Deliberately depends on the individual fields buildReaderTheme reads, not
  // the whole `reading` object: brightness/warmth render as overlay divs in
  // ReaderScreen, and re-running applyTheme on every slider tick would repaint
  // the engine surface (EPUB iframe) for no visual change.
  useEffect(() => {
    engineRef.current?.applyTheme(buildReaderTheme(theme, font, reading))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    theme,
    font,
    reading.fontScale,
    reading.lineHeight,
    reading.margin,
    reading.justify,
    reading.letterSpacing,
    reading.hideImages,
    reading.softWrap,
    reading.bionicReading,
    reading.bionicStrength,
  ])

  const scheduleSave = (id: string, loc: BookLocationInfo) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void progressRepository.save({
        bookId: id,
        location: loc,
        updatedAt: Date.now(),
      })
    }, 600)
    // Mark the book finished once near the end.
    if (loc.progress >= 0.98 && !markedFinished.current) {
      markedFinished.current = true
      void bookRepository.findById(id).then((b) => {
        if (b) void bookRepository.save({ ...b, status: 'finished' })
      })
    }
  }

  /** Record the current position as a jump origin (deduped, newest first). */
  const pushJump = useCallback(() => {
    const loc = engineRef.current?.getLocation()
    if (!loc?.cfi) return
    const entry: JumpEntry = {
      cfi: loc.cfi,
      progress: loc.progress,
      chapterTitle: loc.chapterTitle,
      at: Date.now(),
    }
    setJumpHistory((prev) =>
      [entry, ...prev.filter((e) => e.cfi !== entry.cfi)].slice(0, 6),
    )
  }, [])

  // Flipping many pages in quick succession is treated like a jump: remember
  // where the burst started so an accidental fast-flip can be undone.
  const trackTurn = () => {
    const loc = engineRef.current?.getLocation()
    const now = Date.now()
    const b = burst.current
    if (now - b.startedAt > BURST_WINDOW_MS) {
      burst.current = {
        startedAt: now,
        count: 1,
        origin: loc?.cfi
          ? { cfi: loc.cfi, progress: loc.progress, chapterTitle: loc.chapterTitle, at: now }
          : null,
        pushed: false,
      }
      return
    }
    b.startedAt = now
    b.count += 1
    if (b.count >= BURST_THRESHOLD && !b.pushed && b.origin) {
      b.pushed = true
      const origin = b.origin
      setJumpHistory((prev) =>
        [origin, ...prev.filter((e) => e.cfi !== origin.cfi)].slice(0, 6),
      )
    }
  }

  const next = () => {
    trackTurn()
    void engineRef.current?.next()
  }
  const prev = () => {
    trackTurn()
    void engineRef.current?.prev()
  }
  const goTo = (target: string) => {
    pushJump()
    void engineRef.current?.display(target)
  }
  const clearSelection = useCallback(() => {
    engineRef.current?.clearNativeSelection?.()
    setSelection(undefined)
  }, [])
  const getSectionText = () =>
    engineRef.current?.getCurrentSectionText() ?? Promise.resolve([])
  const getSpeakableChunks = useCallback(
    (maxChars?: number) =>
      engineRef.current?.getSpeakableChunks(maxChars) ?? Promise.resolve([]),
    [],
  )
  const goToPercentage = useCallback(
    (p: number) => {
      pushJump()
      void engineRef.current?.goToPercentage(p)
    },
    [pushJump],
  )
  const goToChapterPercentage = useCallback(
    (p: number) => {
      pushJump()
      const engine = engineRef.current
      if (!engine) return
      void (engine.goToChapterPercentage ?? engine.goToPercentage).call(engine, p)
    },
    [pushJump],
  )
  const search = useCallback(
    (
      query: string,
      onProgress?: (hits: SearchHit[], fraction: number) => void,
    ) =>
      engineRef.current?.search(query, undefined, onProgress) ??
      Promise.resolve([]),
    [],
  )
  const currentChunkIndex = useCallback(
    () => engineRef.current?.currentChunkIndex?.() ?? 0,
    [],
  )
  const chunkIndexForAnchor = useCallback(
    (anchor: string) => engineRef.current?.chunkIndexForAnchor?.(anchor) ?? null,
    [],
  )
  const locateChunk = useCallback(
    (chunk: SpeakableChunk) => engineRef.current?.locateChunk(chunk),
    [],
  )
  const clearSpokenHighlight = useCallback(
    () => engineRef.current?.clearSpokenHighlight(),
    [],
  )
  const chunkAtPoint = useCallback(
    (x: number, y: number) => engineRef.current?.chunkAtPoint(x, y) ?? null,
    [],
  )
  const scrollByPixels = useCallback(
    (px: number) => engineRef.current?.scrollByPixels?.(px),
    [],
  )

  const addBookmark = () => {
    if (!book || !location) return
    // A bookmark made from a selection anchors to the selected range and is
    // drawn as a highlight so it stays visible in the text.
    const cfiRange = selection?.cfiRange
    const bookmark: Bookmark = {
      id: createId('bm'),
      bookId: book.id,
      cfi: cfiRange ?? location.cfi,
      cfiRange,
      label: location.chapterTitle ?? `${Math.round(location.progress * 100)}%`,
      excerpt: selection?.text,
      createdAt: Date.now(),
    }
    void bookmarkRepository.save(bookmark)
    if (cfiRange) {
      const engine = engineRef.current
      engine?.addHighlight(cfiRange, 'blue', theme.tokens.highlight.blue, () =>
        engine?.selectAnnotation?.(cfiRange),
      )
    }
    setBookmarks((prev) => [...prev, bookmark])
  }

  const removeBookmark = (id: string) => {
    const target = bookmarks.find((b) => b.id === id)
    if (target?.cfiRange) engineRef.current?.removeHighlight(target.cfiRange)
    void bookmarkRepository.delete(id)
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }

  const addHighlight = (color: HighlightColor) => {
    if (!book || !selection) return
    const highlight: Highlight = {
      id: createId('hl'),
      bookId: book.id,
      cfiRange: selection.cfiRange,
      text: selection.text,
      color,
      createdAt: Date.now(),
    }
    void highlightRepository.save(highlight)
    const engine = engineRef.current
    engine?.addHighlight(
      highlight.cfiRange,
      color,
      theme.tokens.highlight[color],
      () => engine?.selectAnnotation?.(highlight.cfiRange),
    )
    setHighlights((prev) => [...prev, highlight])
    clearSelection()
  }

  const removeHighlight = (id: string) => {
    const target = highlights.find((h) => h.id === id)
    if (target) engineRef.current?.removeHighlight(target.cfiRange)
    void highlightRepository.delete(id)
    setHighlights((prev) => prev.filter((h) => h.id !== id))
  }

  const setHighlightNote = (id: string, note: string) => {
    const target = highlights.find((h) => h.id === id)
    if (!target) return
    const updated: Highlight = { ...target, note }
    void highlightRepository.save(updated)
    setHighlights((prev) => prev.map((h) => (h.id === id ? updated : h)))
  }

  return {
    status,
    error,
    book,
    location,
    toc,
    bookmarks,
    highlights,
    selection,
    containerRef,
    next,
    prev,
    goTo,
    addBookmark,
    removeBookmark,
    addHighlight,
    removeHighlight,
    setHighlightNote,
    clearSelection,
    getSectionText,
    getSpeakableChunks,
    goToPercentage,
    goToChapterPercentage,
    search,
    currentChunkIndex,
    chunkIndexForAnchor,
    jumpHistory,
    locateChunk,
    clearSpokenHighlight,
    chunkAtPoint,
    scrollByPixels,
  }
}

/** Resolve once `getter` returns a truthy value (polls on animation frames). */
function waitFor<T>(getter: () => T): Promise<T> {
  return new Promise((resolve) => {
    const tick = () => {
      const value = getter()
      if (value) resolve(value)
      else requestAnimationFrame(tick)
    }
    tick()
  })
}
