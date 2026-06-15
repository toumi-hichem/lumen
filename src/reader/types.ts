import type { BookFormat, HighlightColor } from '@/domain/models'

export interface BookLocationInfo {
  cfi: string
  /** 0..1 fraction through the whole book. */
  progress: number
  chapterTitle?: string
}

export interface SelectionInfo {
  cfiRange: string
  text: string
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
  fontFamily: string
  /** Font size as a percentage, e.g. 110. */
  fontSizePercent: number
  lineHeight: number
  /** Horizontal margin in pixels. */
  margin: number
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

  destroy(): void
}

export class UnsupportedFormatError extends Error {
  constructor(format: BookFormat) {
    super(`Reader engine for "${format}" is not implemented yet`)
    this.name = 'UnsupportedFormatError'
  }
}
