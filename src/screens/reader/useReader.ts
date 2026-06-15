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
import type { BookEngine, BookLocationInfo, SelectionInfo, TocItem } from '@/reader/types'
import { buildReaderTheme } from '@/reader/readerTheme'
import { bookRepository } from '@/storage/bookRepository'
import { bookmarkRepository } from '@/storage/bookmarkRepository'
import { highlightRepository } from '@/storage/highlightRepository'
import { progressRepository } from '@/storage/progressRepository'
import { fileStore } from '@/storage/fileStore'
import { useTheme } from '@/theme/ThemeProvider'
import { useSettingsStore } from '@/store/settingsStore'

type ReaderStatus = 'loading' | 'ready' | 'error'

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
  clearSelection: () => void
  /** Plain-text of the current section, chunked for read-aloud. */
  getSectionText: () => Promise<string[]>
}

export function useReader(bookId: string): ReaderApi {
  const { theme, font } = useTheme()
  const reading = useSettingsStore((s) => s.reading)

  const [status, setStatus] = useState<ReaderStatus>('loading')
  const [error, setError] = useState<string>()
  const [book, setBook] = useState<Book>()
  const [location, setLocation] = useState<BookLocationInfo>()
  const [toc, setToc] = useState<TocItem[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [selection, setSelection] = useState<SelectionInfo>()

  const engineRef = useRef<BookEngine | null>(null)
  const containerEl = useRef<HTMLDivElement | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Callback ref so we know exactly when the viewport node is in the DOM.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerEl.current = node
  }, [])

  // Engine lifecycle, keyed by book.
  useEffect(() => {
    let active = true
    setStatus('loading')

    async function boot() {
      try {
        const loaded = await bookRepository.findById(bookId)
        if (!loaded) throw new Error('Book not found')
        const blob = await fileStore.get(loaded.fileKey)
        if (!blob) throw new Error('Book file is missing')

        const engine = createEngine(loaded.format)
        await engine.open(await blob.arrayBuffer())
        if (!active) return engine.destroy()

        // Wait a tick for the viewport element to be present.
        await waitFor(() => containerEl.current)
        if (!active || !containerEl.current) return engine.destroy()

        await engine.renderTo(containerEl.current)
        engine.applyTheme(buildReaderTheme(theme, font, reading))

        engine.onLocationChange((loc) => {
          setLocation(loc)
          scheduleSave(loaded.id, loc)
        })
        engine.onSelection((sel) => setSelection(sel))

        const [savedToc, savedProgress, savedBookmarks, savedHighlights] =
          await Promise.all([
            engine.toc(),
            progressRepository.get(loaded.id),
            bookmarkRepository.findByBook(loaded.id),
            highlightRepository.findByBook(loaded.id),
          ])

        await engine.display(savedProgress?.location.cfi)
        // Re-apply persisted highlights onto the freshly rendered content.
        for (const hl of savedHighlights) {
          engine.addHighlight(hl.cfiRange, hl.color, theme.tokens.highlight[hl.color])
        }

        if (!active) return engine.destroy()
        engineRef.current = engine
        setBook(loaded)
        setToc(savedToc)
        setBookmarks(savedBookmarks)
        setHighlights(savedHighlights)
        setStatus('ready')
        void bookRepository.save({ ...loaded, lastOpenedAt: Date.now() })
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
      engineRef.current?.destroy()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  // Re-theme the reader surface when theme / typography preferences change.
  useEffect(() => {
    engineRef.current?.applyTheme(buildReaderTheme(theme, font, reading))
  }, [theme, font, reading])

  const scheduleSave = (id: string, loc: BookLocationInfo) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void progressRepository.save({
        bookId: id,
        location: loc,
        updatedAt: Date.now(),
      })
    }, 600)
  }

  const next = () => void engineRef.current?.next()
  const prev = () => void engineRef.current?.prev()
  const goTo = (target: string) => void engineRef.current?.display(target)
  const clearSelection = () => setSelection(undefined)
  const getSectionText = () =>
    engineRef.current?.getCurrentSectionText() ?? Promise.resolve([])

  const addBookmark = () => {
    if (!book || !location) return
    const bookmark: Bookmark = {
      id: createId('bm'),
      bookId: book.id,
      cfi: location.cfi,
      label: location.chapterTitle ?? `${Math.round(location.progress * 100)}%`,
      excerpt: selection?.text,
      createdAt: Date.now(),
    }
    void bookmarkRepository.save(bookmark)
    setBookmarks((prev) => [...prev, bookmark])
  }

  const removeBookmark = (id: string) => {
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
    engineRef.current?.addHighlight(
      highlight.cfiRange,
      color,
      theme.tokens.highlight[color],
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
    clearSelection,
    getSectionText,
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
