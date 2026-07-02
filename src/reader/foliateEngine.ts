import type { HighlightColor, BookFormat } from '@/domain/models'
import { chunkText } from '@/lib/textChunk'
import { collectTextNodes, domToChunks, locationToOffset } from '@/lib/domChunk'
import type {
  FoliateBook,
  FoliateContent,
  FoliateLocation,
  FoliateTocItem,
  View,
} from 'foliate-js/view.js'
import {
  type BookEngine,
  type BookLocationInfo,
  type ReaderTheme,
  type SearchHit,
  type SelectionInfo,
  type SpeakableChunk,
  type TocItem,
} from './types'

const READALONG_PREFIX = 'lumen-readalong:'

interface ChunkSpan {
  chunk: SpeakableChunk
  /** Global character offsets within the section, for tap-to-start mapping. */
  start: number
  end: number
}

interface HighlightEntry {
  cssColor: string
  onClick?: () => void
}

/**
 * EPUB / MOBI / AZW3 / FB2 reader engine backed by foliate-js (pinned
 * upstream commit; see package.json). foliate-view parses the book straight
 * from a blob (no server), renders paginated or scrolled through its own
 * paginator (with built-in swipe gestures and animated page turns), computes
 * standard EPUB CFIs for positions/annotations, and draws highlights on an
 * SVG overlay. This replaces the epub.js engine and its hand-rolled
 * continuous-scroll section advancing.
 */
export class FoliateEngine implements BookEngine {
  readonly format: BookFormat

  private book: FoliateBook | null = null
  private view: View | null = null
  private container: HTMLElement | null = null
  private location: BookLocationInfo | null = null
  private tocItems: TocItem[] = []
  private locationCb: ((loc: BookLocationInfo) => void) | null = null
  private selectionCb: ((sel: SelectionInfo) => void) | null = null
  private tapCb: (() => void) | null = null
  private lastTheme: ReaderTheme | null = null
  private flow: 'paginated' | 'scrolled' = 'paginated'
  private spans: ChunkSpan[] = []
  private readonly highlights = new Map<string, HighlightEntry>()
  private readalongValue: string | null = null
  private readalongColor = 'rgba(255, 213, 0, 0.4)'
  /** Suppresses the tap callback for the click that ends a text selection. */
  private selectionJustEnded = false

  constructor(format: BookFormat = 'epub') {
    this.format = format
  }

  async open(data: ArrayBuffer): Promise<void> {
    // Import for the side effect of defining <foliate-view> as well.
    const { makeBook } = await import('foliate-js/view.js')
    this.book = await makeBook(new File([data], `book.${this.format}`))
    this.tocItems = flattenToc(this.book.toc ?? [], 0)
  }

  async renderTo(element: HTMLElement): Promise<void> {
    if (!this.book) throw new Error('open() must be called before renderTo()')
    this.container = element
    const view = document.createElement('foliate-view') as View
    view.style.display = 'block'
    view.style.width = '100%'
    view.style.height = '100%'
    element.append(view)
    this.view = view

    view.addEventListener('relocate', ((e: CustomEvent<FoliateLocation>) => {
      const detail = e.detail
      this.location = {
        cfi: detail.cfi ?? '',
        progress: detail.fraction ?? 0,
        chapterTitle: detail.tocItem?.label?.trim() || undefined,
      }
      // Chunk anchors are section-relative; invalidate on navigation.
      this.spans = []
      this.locationCb?.(this.location)
    }) as EventListener)

    view.addEventListener('load', ((e: CustomEvent<{ doc: Document; index: number }>) => {
      this.attachDocListeners(e.detail.doc, e.detail.index)
    }) as EventListener)

    view.addEventListener('draw-annotation', ((
      e: CustomEvent<{
        draw: (func: unknown, opts?: Record<string, unknown>) => void
        annotation: { value: string }
      }>,
    ) => {
      void (async () => {
        const { Overlayer } = await import('foliate-js/overlayer.js')
        const { draw, annotation } = e.detail
        const color = annotation.value.startsWith(READALONG_PREFIX)
          ? this.readalongColor
          : this.highlights.get(annotation.value)?.cssColor
        if (color) draw(Overlayer.highlight, { color })
      })()
    }) as EventListener)

    view.addEventListener('show-annotation', ((
      e: CustomEvent<{ value: string }>,
    ) => {
      this.highlights.get(e.detail.value)?.onClick?.()
    }) as EventListener)

    await view.open(this.book)
    this.configureRenderer()
    if (this.lastTheme) this.applyTheme(this.lastTheme)
  }

  async display(target?: string): Promise<void> {
    if (!this.view) throw new Error('renderTo() must be called first')
    await this.view.init({ lastLocation: target || undefined })
  }

  async next(): Promise<void> {
    await this.view?.next()
  }

  async prev(): Promise<void> {
    await this.view?.prev()
  }

  async goToPercentage(percentage: number): Promise<void> {
    await this.view?.goToFraction(Math.max(0, Math.min(1, percentage)))
  }

  setFlow(flow: 'paginated' | 'scrolled'): void {
    this.flow = flow
    this.configureRenderer()
  }

  async search(query: string, limit = 60): Promise<SearchHit[]> {
    const term = query.trim()
    if (!this.view || term.length < 2) return []
    const hits: SearchHit[] = []
    for await (const result of this.view.search({ query: term })) {
      if (typeof result === 'object' && 'subitems' in result) {
        for (const item of result.subitems) {
          hits.push({ anchor: item.cfi, excerpt: item.excerpt.trim() })
          if (hits.length >= limit) break
        }
      }
      if (hits.length >= limit) break
    }
    this.view.clearSearch()
    return hits
  }

  applyTheme(theme: ReaderTheme): void {
    this.lastTheme = theme
    this.readalongColor = theme.readalongBackground
    const renderer = this.view?.renderer
    if (!renderer) return
    renderer.setStyles?.(buildCss(theme))
    // The margin preference drives the paginator's gap attribute.
    this.configureRenderer()
    if (this.container) {
      this.container.style.background = theme.pageBackground
    }
  }

  getLocation(): BookLocationInfo | null {
    return this.location
  }

  onLocationChange(cb: (loc: BookLocationInfo) => void): void {
    this.locationCb = cb
  }

  onSelection(cb: (sel: SelectionInfo) => void): void {
    this.selectionCb = cb
  }

  onTap(cb: () => void): void {
    this.tapCb = cb
  }

  addHighlight(
    cfiRange: string,
    _color: HighlightColor,
    cssColor: string,
    onClick?: () => void,
  ): void {
    this.highlights.set(cfiRange, { cssColor, onClick })
    void this.view?.addAnnotation({ value: cfiRange }).catch(() => undefined)
  }

  removeHighlight(cfiRange: string): void {
    this.highlights.delete(cfiRange)
    void this.view?.deleteAnnotation({ value: cfiRange })
  }

  async toc(): Promise<TocItem[]> {
    return this.tocItems
  }

  async getCurrentSectionText(): Promise<string[]> {
    const text = this.contents()
      .map((c) => c.doc.body?.textContent ?? '')
      .join(' ')
    return chunkText(text)
  }

  async getSpeakableChunks(maxChars = 240): Promise<SpeakableChunk[]> {
    if (!this.view) return []
    this.spans = []
    const result: SpeakableChunk[] = []
    let index = 0
    for (const content of this.contents()) {
      const body = content.doc.body
      if (!body) continue
      const entries = collectTextNodes(body)
      for (const dc of domToChunks(body, maxChars)) {
        const range = content.doc.createRange()
        range.setStart(dc.startNode, dc.startOffset)
        range.setEnd(dc.endNode, dc.endOffset)
        let anchor: string
        try {
          anchor = this.view.getCFI(content.index, range)
        } catch {
          continue
        }
        const chunk: SpeakableChunk = { index, text: dc.text, anchor }
        result.push(chunk)
        this.spans.push({
          chunk,
          start: locationToOffset(entries, dc.startNode, dc.startOffset),
          end: locationToOffset(entries, dc.endNode, dc.endOffset),
        })
        index += 1
      }
    }
    return result
  }

  locateChunk(chunk: SpeakableChunk): void {
    if (!this.view) return
    this.clearSpokenHighlight()
    const value = READALONG_PREFIX + chunk.anchor
    this.readalongValue = value
    void this.view.addAnnotation({ value }).catch(() => undefined)
    // Follow the spoken text: page/scroll to it. Resolve + goTo on the
    // renderer directly so read-along doesn't spam the navigation history.
    try {
      const resolved = this.view.resolveNavigation(chunk.anchor)
      if (resolved) void this.view.renderer.goTo(resolved)
    } catch {
      // Anchor may be stale after a relayout; ignore.
    }
  }

  clearSpokenHighlight(): void {
    if (this.readalongValue && this.view) {
      void this.view.deleteAnnotation({ value: this.readalongValue })
    }
    this.readalongValue = null
  }

  chunkAtPoint(x: number, y: number): SpeakableChunk | null {
    const content = this.contentAtPoint(x, y)
    if (!content) return null
    const frame = content.doc.defaultView?.frameElement as HTMLElement | null
    const rect = frame?.getBoundingClientRect()
    const lx = rect ? x - rect.left : x
    const ly = rect ? y - rect.top : y
    const doc = content.doc as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const caret = doc.caretRangeFromPoint?.(lx, ly) ?? null
    if (!caret) return null
    const entries = collectTextNodes(content.doc.body)
    const pos = locationToOffset(entries, caret.startContainer, caret.startOffset)
    return this.spans.find((s) => pos >= s.start && pos < s.end)?.chunk ?? null
  }

  destroy(): void {
    this.view?.close()
    this.view?.remove()
    this.view = null
    this.book?.destroy?.()
    this.book = null
    this.container = null
    this.highlights.clear()
  }

  // --- internals ---

  private configureRenderer(): void {
    const renderer = this.view?.renderer
    if (!renderer) return
    renderer.setAttribute('flow', this.flow === 'scrolled' ? 'scrolled' : 'paginated')
    // Slide animation on page turns; the paginator also handles swipe input.
    renderer.setAttribute('animated', '')
    // Single column matches the app's phone-first layout on every width.
    renderer.setAttribute('max-column-count', '1')
    // Foliate reserves this block space for its running head/foot bars, which
    // Lumen doesn't use; keep it minimal.
    renderer.setAttribute('margin', '12px')
    // The paginator's outer side padding is `gap` (a percentage of container
    // width). It is the single source of horizontal spacing (the injected CSS
    // adds no body padding), sized so the padding tracks the user's margin
    // preference in pixels.
    const width = this.container?.clientWidth || 400
    const marginPx = this.lastTheme?.margin ?? 16
    const gapPercent = Math.min(8, Math.max(1.5, (marginPx / width) * 100))
    renderer.setAttribute('gap', `${gapPercent.toFixed(1)}%`)
  }

  private attachDocListeners(doc: Document, index: number): void {
    // Suppress the platform's own selection callout / context menu inside the
    // book frame so only Lumen's selection menu appears.
    doc.addEventListener('contextmenu', (e) => e.preventDefault())

    const reportSelection = () => {
      const sel = doc.getSelection()
      const text = sel?.toString() ?? ''
      if (!sel || sel.rangeCount === 0 || !text.trim()) return
      this.selectionJustEnded = true
      const range = sel.getRangeAt(0)
      let cfiRange: string
      try {
        cfiRange = this.view?.getCFI(index, range) ?? ''
      } catch {
        return
      }
      if (!cfiRange) return
      const r = range.getBoundingClientRect()
      const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
      const ox = frame?.left ?? 0
      const oy = frame?.top ?? 0
      this.selectionCb?.({
        cfiRange,
        text,
        rect: {
          top: r.top + oy,
          bottom: r.bottom + oy,
          left: r.left + ox,
          right: r.right + ox,
          width: r.width,
          height: r.height,
        },
      })
    }
    doc.addEventListener('mouseup', reportSelection)
    doc.addEventListener('touchend', reportSelection)

    // Tap inside the book toggles the reader chrome (there are tap-zone
    // overlays only in paginated mode). Ignore taps that end a selection and
    // taps on links (foliate handles link navigation itself).
    doc.addEventListener('click', (e) => {
      if (this.selectionJustEnded) {
        this.selectionJustEnded = false
        return
      }
      const sel = doc.getSelection()
      if (sel && !sel.isCollapsed) return
      const target = e.target as Element | null
      if (target?.closest?.('a[href]')) return
      this.tapCb?.()
    })
  }

  private contents(): FoliateContent[] {
    return this.view?.renderer.getContents() ?? []
  }

  private contentAtPoint(x: number, y: number): FoliateContent | null {
    const all = this.contents()
    for (const content of all) {
      const frame = content.doc.defaultView?.frameElement as HTMLElement | null
      const rect = frame?.getBoundingClientRect()
      if (
        rect &&
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return content
      }
    }
    return all[0] ?? null
  }
}

function buildCss(theme: ReaderTheme): string {
  const textAlign = theme.justify ? 'justify' : 'start'
  return `
    html {
      font-size: ${theme.fontSizePercent}%;
      color-scheme: light dark;
    }
    html, body {
      background: ${theme.pageBackground} !important;
      color: ${theme.pageText} !important;
    }
    body {
      font-family: ${theme.fontFamily} !important;
      line-height: ${theme.lineHeight} !important;
      letter-spacing: ${theme.letterSpacing}em !important;
      -webkit-touch-callout: none;
    }
    p, li, blockquote, dd {
      line-height: ${theme.lineHeight} !important;
      text-align: ${textAlign} !important;
      letter-spacing: ${theme.letterSpacing}em !important;
      widows: 2;
    }
    [align="left"] { text-align: left !important; }
    [align="right"] { text-align: right !important; }
    [align="center"] { text-align: center !important; }
    a:link, a:visited { color: ${theme.pageLink} !important; }
    ::selection {
      background: ${theme.vars['--reader-selection-background'] ?? 'Highlight'};
    }
    pre { white-space: pre-wrap !important; }
    ${theme.hideImages ? 'img, svg, image { display: none !important; }' : ''}
    ${
      theme.softWrap
        ? `body, p, div, td, li {
             overflow-wrap: break-word !important;
             word-break: break-word !important;
           }
           pre, code {
             white-space: pre-wrap !important;
             overflow-wrap: break-word !important;
           }`
        : ''
    }
  `
}

function flattenToc(items: FoliateTocItem[], level: number): TocItem[] {
  const out: TocItem[] = []
  for (const item of items) {
    out.push({
      label: (item.label ?? '').trim() || 'Untitled',
      href: item.href ?? '',
      level,
    })
    if (item.subitems?.length) {
      out.push(...flattenToc(item.subitems, level + 1))
    }
  }
  return out
}
