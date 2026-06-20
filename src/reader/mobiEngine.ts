import type { BookFormat, HighlightColor } from '@/domain/models'
import { getErrorMessage } from '@/lib/result'
import { TextEngine } from './textEngine'
import type {
  BookEngine,
  BookLocationInfo,
  ReaderTheme,
  SearchHit,
  SelectionInfo,
  SpeakableChunk,
  TocItem,
} from './types'

/**
 * MOBI / AZW3 (KF8) reader engine. Parsing is delegated to foliate-js's MOBI
 * reader (loaded lazily), which yields the book's HTML sections. The extracted
 * HTML is rendered through the TextEngine, so MOBI books get the same reflow,
 * theming, read-along TTS, highlighting and search as everything else.
 *
 * Formatting beyond text flow (embedded fonts, fixed layout) is not preserved;
 * this targets readable, reflowable consumption. AZW3 must be DRM-free.
 */
export class MobiEngine implements BookEngine {
  readonly format: BookFormat
  private readonly inner = new TextEngine()
  private html = ''

  constructor(format: BookFormat = 'mobi') {
    this.format = format
  }

  async open(data: ArrayBuffer): Promise<void> {
    try {
      const [{ MOBI }, fflate] = await Promise.all([
        import('foliate-js/mobi.js'),
        import('fflate'),
      ])
      const file = new Blob([data])
      const book = await new MOBI({ unzlib: fflate.unzlibSync }).open(file)
      const parts: string[] = []
      for (const section of book.sections ?? []) {
        try {
          const doc = await section.createDocument()
          if (doc?.body) parts.push(doc.body.innerHTML)
        } catch {
          // Skip unreadable sections.
        }
      }
      this.html = sanitize(parts.join('\n<hr/>\n'))
    } catch (error) {
      throw new Error(`Failed to parse MOBI: ${getErrorMessage(error)}`, {
        cause: error,
      })
    }
  }

  async renderTo(element: HTMLElement): Promise<void> {
    this.inner.setContent(this.html, true)
    await this.inner.renderTo(element)
  }

  display(target?: string): Promise<void> {
    return this.inner.display(target)
  }
  next(): Promise<void> {
    return this.inner.next()
  }
  prev(): Promise<void> {
    return this.inner.prev()
  }
  goToPercentage(p: number): Promise<void> {
    return this.inner.goToPercentage(p)
  }
  setFlow(): void {}
  search(query: string, limit?: number): Promise<SearchHit[]> {
    return this.inner.search(query, limit)
  }
  applyTheme(theme: ReaderTheme): void {
    this.inner.applyTheme(theme)
  }
  getLocation(): BookLocationInfo | null {
    return this.inner.getLocation()
  }
  onLocationChange(cb: (loc: BookLocationInfo) => void): void {
    this.inner.onLocationChange(cb)
  }
  onSelection(cb: (sel: SelectionInfo) => void): void {
    this.inner.onSelection(cb)
  }
  onTap(cb: () => void): void {
    this.inner.onTap(cb)
  }
  addHighlight(cfiRange: string, color: HighlightColor, cssColor: string): void {
    this.inner.addHighlight(cfiRange, color, cssColor)
  }
  removeHighlight(cfiRange: string): void {
    this.inner.removeHighlight(cfiRange)
  }
  toc(): Promise<TocItem[]> {
    return this.inner.toc()
  }
  getCurrentSectionText(): Promise<string[]> {
    return this.inner.getCurrentSectionText()
  }
  getSpeakableChunks(maxChars?: number): Promise<SpeakableChunk[]> {
    return this.inner.getSpeakableChunks(maxChars)
  }
  locateChunk(chunk: SpeakableChunk): void {
    this.inner.locateChunk(chunk)
  }
  clearSpokenHighlight(): void {
    this.inner.clearSpokenHighlight()
  }
  chunkAtPoint(x: number, y: number): SpeakableChunk | null {
    return this.inner.chunkAtPoint(x, y)
  }
  scrollByPixels(px: number): void {
    this.inner.scrollByPixels(px)
  }
  destroy(): void {
    this.inner.destroy()
  }
}

/** Strip scripts/styles and event handlers from extracted MOBI HTML. */
function sanitize(html: string): string {
  if (typeof document === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, link, iframe, object, embed').forEach((el) =>
    el.remove(),
  )
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || attr.name === 'srcset') {
        el.removeAttribute(attr.name)
      }
    }
  })
  return doc.body.innerHTML
}
