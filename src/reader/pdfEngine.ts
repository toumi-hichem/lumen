import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist'
import { chunkText } from '@/lib/textChunk'
import {
  type BookEngine,
  type BookLocationInfo,
  type ReaderTheme,
  type SearchHit,
  type SpeakableChunk,
  type TocItem,
} from './types'

/**
 * PDF reader engine backed by pdf.js. Pages render lazily to canvas as they
 * scroll into view. PDF is fixed-layout, so theming and font controls don't
 * reflow the page; highlighting/selection are not supported. Read-aloud works
 * via the text layer (page.getTextContent), anchored per page.
 */
export class PdfEngine implements BookEngine {
  readonly format = 'pdf' as const

  private pdf: PDFDocumentProxy | null = null
  private container: HTMLElement | null = null
  private observer: IntersectionObserver | null = null
  private location: BookLocationInfo | null = null
  private locationCb: ((loc: BookLocationInfo) => void) | null = null
  private tapCb: (() => void) | null = null
  private rendered = new Set<number>()
  private background = '#ffffff'

  async open(data: ArrayBuffer): Promise<void> {
    const lib = await import('pdfjs-dist')
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
      .default
    lib.GlobalWorkerOptions.workerSrc = workerUrl
    // getDocument transfers the buffer; pass a copy so callers keep theirs.
    this.pdf = await lib.getDocument({ data: data.slice(0) }).promise
  }

  async renderTo(element: HTMLElement): Promise<void> {
    if (!this.pdf) throw new Error('open() must be called before renderTo()')
    this.container = element
    element.innerHTML = ''
    element.style.overflow = 'auto'
    element.style.height = '100%'
    element.style.background = this.background

    // Page placeholders; canvases render when scrolled near the viewport.
    for (let n = 1; n <= this.pdf.numPages; n++) {
      const page = document.createElement('div')
      page.className = 'pdf-page'
      page.dataset.page = String(n)
      element.appendChild(page)
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const n = Number((entry.target as HTMLElement).dataset.page)
          void this.renderPage(n, entry.target as HTMLElement)
        }
      },
      { root: element, rootMargin: '200px' },
    )
    element.querySelectorAll('.pdf-page').forEach((el) => this.observer?.observe(el))

    element.addEventListener('scroll', this.handleScroll)
    element.addEventListener('click', this.handleTap)
    this.emitLocation()
  }

  async display(target?: string): Promise<void> {
    if (!this.container) return
    const page = target?.startsWith('pdf:') ? Number(target.slice(4)) : NaN
    if (!Number.isNaN(page)) {
      const el = this.container.querySelector<HTMLElement>(`[data-page="${page}"]`)
      el?.scrollIntoView()
    }
    this.emitLocation()
  }

  async next(): Promise<void> {
    this.container?.scrollBy({ top: (this.container.clientHeight || 0) * 0.9 })
  }

  async prev(): Promise<void> {
    this.container?.scrollBy({ top: -(this.container.clientHeight || 0) * 0.9 })
  }

  async goToPercentage(p: number): Promise<void> {
    if (!this.container) return
    const max = this.container.scrollHeight - this.container.clientHeight
    this.container.scrollTop = Math.max(0, Math.min(1, p)) * max
    this.emitLocation()
  }

  setFlow(): void {}

  applyTheme(theme: ReaderTheme): void {
    this.background = theme.pageBackground
    if (this.container) this.container.style.background = theme.pageBackground
  }

  getLocation(): BookLocationInfo | null {
    return this.location
  }

  onLocationChange(cb: (loc: BookLocationInfo) => void): void {
    this.locationCb = cb
  }

  onTap(cb: () => void): void {
    this.tapCb = cb
  }

  // Selection/highlight are not supported on the canvas-rendered PDF surface.
  onSelection(): void {}
  addHighlight(): void {}
  removeHighlight(): void {}
  locateChunk(): void {}
  clearSpokenHighlight(): void {}
  chunkAtPoint(): SpeakableChunk | null {
    return null
  }

  async toc(): Promise<TocItem[]> {
    if (!this.pdf) return []
    try {
      const outline = await this.pdf.getOutline()
      if (!outline) return []
      return outline.map((item) => ({ label: item.title, href: '', level: 0 }))
    } catch {
      return []
    }
  }

  async getCurrentSectionText(): Promise<string[]> {
    const text = await this.pageText(this.currentPage())
    return chunkText(text)
  }

  async getSpeakableChunks(maxChars = 240): Promise<SpeakableChunk[]> {
    const page = this.currentPage()
    const text = await this.pageText(page)
    return chunkText(text, maxChars).map((t, index) => ({
      index,
      text: t,
      anchor: `pdf:${page}`,
    }))
  }

  async search(query: string, limit = 60): Promise<SearchHit[]> {
    const term = query.trim().toLowerCase()
    if (!this.pdf || term.length < 2) return []
    const hits: SearchHit[] = []
    for (let n = 1; n <= this.pdf.numPages && hits.length < limit; n++) {
      const text = await this.pageText(n)
      const at = text.toLowerCase().indexOf(term)
      if (at >= 0) {
        const start = Math.max(0, at - 30)
        hits.push({
          anchor: `pdf:${n}`,
          excerpt: `…${text.slice(start, at + term.length + 40).trim()}…`,
          chapterTitle: `Page ${n}`,
        })
      }
    }
    return hits
  }

  destroy(): void {
    this.observer?.disconnect()
    this.container?.removeEventListener('scroll', this.handleScroll)
    this.container?.removeEventListener('click', this.handleTap)
    if (this.container) this.container.innerHTML = ''
    void (this.pdf as { destroy?: () => Promise<void> } | null)?.destroy?.()
    this.pdf = null
    this.container = null
  }

  private handleScroll = (): void => {
    this.emitLocation()
  }

  /** Toggle the reader chrome on a tap (scrolled mode has no tap overlays). */
  private handleTap = (): void => {
    this.tapCb?.()
  }

  private currentPage(): number {
    if (!this.container || !this.pdf) return 1
    const max = this.container.scrollHeight - this.container.clientHeight
    const fraction = max > 0 ? this.container.scrollTop / max : 0
    return Math.max(1, Math.min(this.pdf.numPages, Math.round(fraction * this.pdf.numPages) || 1))
  }

  private emitLocation(): void {
    if (!this.container || !this.pdf) return
    const max = this.container.scrollHeight - this.container.clientHeight
    const progress = max > 0 ? this.container.scrollTop / max : 0
    this.location = {
      cfi: `pdf:${this.currentPage()}`,
      progress,
      chapterTitle: `Page ${this.currentPage()} of ${this.pdf.numPages}`,
    }
    this.locationCb?.(this.location)
  }

  private async pageText(n: number): Promise<string> {
    if (!this.pdf) return ''
    try {
      const page = await this.pdf.getPage(n)
      const content = await page.getTextContent()
      return content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
    } catch {
      return ''
    }
  }

  private async renderPage(n: number, host: HTMLElement): Promise<void> {
    if (!this.pdf || this.rendered.has(n)) return
    this.rendered.add(n)
    let page: PDFPageProxy
    try {
      page = await this.pdf.getPage(n)
    } catch {
      this.rendered.delete(n)
      return
    }
    const width = this.container?.clientWidth ?? 800
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(2, (width - 16) / base.width)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    host.style.minHeight = ''
    host.appendChild(canvas)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
  }
}
