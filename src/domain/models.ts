// Core domain models for the reader. These are storage-agnostic and shared
// across the library, reader, bookmark, highlight and TTS subsystems.

export type BookFormat = 'epub' | 'mobi' | 'azw3' | 'text' | 'pdf'

export type BookStatus = 'unread' | 'reading' | 'finished'

export interface Book {
  readonly id: string
  readonly title: string
  readonly author: string
  readonly format: BookFormat
  /** Object URL or blob key resolved from the stored file. */
  readonly coverUrl?: string
  /** Storage key for the raw file blob inside the `files` object store. */
  readonly fileKey: string
  readonly fileSize: number
  readonly language?: string
  readonly addedAt: number
  readonly lastOpenedAt?: number
  readonly status?: BookStatus
  readonly tags?: readonly string[]
  readonly collectionIds?: readonly string[]
  /** Total words in the book. Computed lazily (first details view) and cached. */
  readonly wordCount?: number
}

/** A user-defined shelf/collection grouping books. */
export interface Collection {
  readonly id: string
  readonly name: string
  readonly createdAt: number
}

/** Per-book overrides that should not affect global defaults. */
export interface BookSettings {
  readonly bookId: string
  readonly ttsVoiceId?: string
  readonly ttsEngineId?: string
  readonly ttsRate?: number
}

/** A reading session for stats (time spent, pages, streaks). */
export interface ReadingSession {
  readonly id: string
  readonly bookId: string
  readonly startedAt: number
  readonly endedAt: number
  /** Milliseconds of active reading. */
  readonly durationMs: number
  /** Book progress (0..1) when the session span started/ended. Present on
   *  sessions recorded since reading-speed tracking; used to derive WPM. */
  readonly startProgress?: number
  readonly endProgress?: number
}

/**
 * A position inside a book. For EPUB this wraps an EPUB CFI; other engines
 * supply their own opaque locator. `progress` is a 0..1 fraction of the whole
 * book and is engine-independent so the UI can always render a progress bar.
 */
export interface ReadingLocation {
  readonly cfi: string
  readonly progress: number
  readonly chapterTitle?: string
}

export interface ReadingProgress {
  readonly bookId: string
  readonly location: ReadingLocation
  readonly updatedAt: number
}

export interface Bookmark {
  readonly id: string
  readonly bookId: string
  readonly cfi: string
  /** Range CFI when the bookmark was made from a text selection; the range is
   *  drawn as a highlight overlay in the reader. */
  readonly cfiRange?: string
  readonly label: string
  readonly excerpt?: string
  readonly createdAt: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

export interface Highlight {
  readonly id: string
  readonly bookId: string
  /** Range CFI spanning the highlighted text. */
  readonly cfiRange: string
  readonly text: string
  readonly color: HighlightColor
  readonly note?: string
  readonly createdAt: number
}
