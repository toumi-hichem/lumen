import type { BookFormat, HighlightColor } from '@/domain/models'

export interface BookLocationInfo {
  cfi: string
  /** 0..1 fraction through the whole book. */
  progress: number
  chapterTitle?: string
}

/** Selection bounds in viewport (client) coordinates, used to anchor the menu. */
export interface SelectionRect {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export interface SelectionInfo {
  cfiRange: string
  text: string
  /** Bounding rect of the selection in viewport coordinates, when available. */
  rect?: SelectionRect
}

/**
 * A speakable unit of text with a positional anchor back into the rendered
 * content. The anchor is engine-specific (an EPUB CFI range, or a
 * `text-range:start-end` offset locator for the text engine) and round-trips
 * through `locateChunk`/`chunkAtPoint`. This is what powers read-along
 * highlighting and tap-to-start.
 */
export interface SpeakableChunk {
  index: number
  text: string
  anchor: string
}

/** A search match within a book, anchored for navigation. */
export interface SearchHit {
  anchor: string
  excerpt: string
  chapterTitle?: string
}

export interface TocItem {
  label: string
  href: string
  /** Nesting depth for indented rendering. */
  level: number
}

/** Reader-surface styling derived from the active theme + reading prefs. */
export interface ReaderTheme {
  /** CSS variables to apply inside the content document. */
  vars: Record<string, string>
  pageBackground: string
  pageText: string
  pageLink: string
  /** Background color for the read-along (currently-spoken) chunk. */
  readalongBackground: string
  fontFamily: string
  /** Font size as a percentage, e.g. 110. */
  fontSizePercent: number
  lineHeight: number
  /** Horizontal margin in pixels. */
  margin: number
  /** Justify body text. */
  justify: boolean
  /** Extra letter spacing in em. */
  letterSpacing: number
  /** Hide inline images. */
  hideImages: boolean
  /** Bionic reading (bold word prefixes); applied by text/MOBI engines. */
  bionic: { enabled: boolean; strength: number }
}

/**
 * Format-agnostic reader engine. EPUB is the first implementation; MOBI/AZW3,
 * plain text and PDF engines implement the same interface so the reader UI and
 * TTS pipeline never branch on format.
 */
export interface BookEngine {
  readonly format: BookFormat

  /** Parse the raw file. */
  open(data: ArrayBuffer): Promise<void>
  /** Mount the rendition into a container element. */
  renderTo(element: HTMLElement): Promise<void>
  /** Jump to a CFI, href, or the saved start position when omitted. */
  display(target?: string): Promise<void>

  next(): Promise<void>
  prev(): Promise<void>
  /** Jump to a fraction (0..1) through the whole book. */
  goToPercentage(percentage: number): Promise<void>

  /** Set layout mode. Takes effect on the next render for some engines. */
  setFlow(flow: 'paginated' | 'scrolled'): void

  /** Full-text search across the book. Capped at `limit` hits. */
  search(query: string, limit?: number): Promise<SearchHit[]>

  applyTheme(theme: ReaderTheme): void

  getLocation(): BookLocationInfo | null
  onLocationChange(cb: (loc: BookLocationInfo) => void): void
  onSelection(cb: (sel: SelectionInfo) => void): void

  addHighlight(
    cfiRange: string,
    color: HighlightColor,
    cssColor: string,
    onClick?: () => void,
  ): void
  removeHighlight(cfiRange: string): void

  /** Ordered table of contents for navigation. */
  toc(): Promise<TocItem[]>

  /**
   * Plain-text of the currently displayed section, split into speakable
   * chunks (sentences) for the TTS pipeline. Empty array if unavailable.
   */
  getCurrentSectionText(): Promise<string[]>

  /**
   * Speakable chunks for the current section WITH positional anchors, so the
   * reader can highlight/scroll to the spoken chunk and start from a tap.
   */
  getSpeakableChunks(maxChars?: number): Promise<SpeakableChunk[]>

  /** Highlight a spoken chunk and scroll/page it into view (read-along). */
  locateChunk(chunk: SpeakableChunk): void

  /** Remove the transient read-along highlight. */
  clearSpokenHighlight(): void

  /**
   * Resolve the speakable chunk at a viewport coordinate (tap-to-start). The
   * coordinates are relative to the reader container. Returns null if none.
   */
  chunkAtPoint(x: number, y: number): SpeakableChunk | null

  destroy(): void
}

export class UnsupportedFormatError extends Error {
  constructor(format: BookFormat) {
    super(`Reader engine for "${format}" is not implemented yet`)
    this.name = 'UnsupportedFormatError'
  }
}
