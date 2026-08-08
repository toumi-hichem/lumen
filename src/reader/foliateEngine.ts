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


/** Give the browser a chance to paint and handle input. Extracting speakable
 *  chunks walks every text node and computes a CFI per chunk, which can run
 *  long enough on a big chapter to freeze the UI for the whole pass if never
 *  interrupted. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

interface ChunkSpan {
  chunk: SpeakableChunk
  /** Global character offsets within the section, for tap-to-start mapping. */
  start: number
  end: number
  /** Owning content document; offsets are only comparable within one doc. */
  doc: Document
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
  private selectionCb: ((sel: SelectionInfo | null) => void) | null = null
  private tapCb: (() => void) | null = null
  private lastTheme: ReaderTheme | null = null
  private flow: 'paginated' | 'scrolled' = 'paginated'
  private spans: ChunkSpan[] = []
  private readonly highlights = new Map<string, HighlightEntry>()
  private readalongValue: string | null = null
  private readalongColor = 'rgba(255, 213, 0, 0.4)'
  /** Visible range of the current page, from the last relocate event. */
  private lastRange: Range | null = null
  private lastSectionIndex = 0
  /** Taps are suppressed while a selection is active or was just cleared, so
   *  dismissing a selection never also toggles the reader chrome. */
  private suppressTapUntil = 0
  private pendingTap: ReturnType<typeof setTimeout> | undefined
  /** Bumped per search() call; a stale generation aborts its scan loop. */
  private searchGeneration = 0
  /** Cached scroll container for continuous flow, keyed by section index. */
  private scrollHost: { index: number; el: HTMLElement } | null = null
  /** Cooldown after a section hand-off, so queued scroll deltas arriving in
   *  the same trip can't skip through several sections at once. */
  private sectionHandoffUntil = 0

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
      this.lastRange = detail.range ?? null
      this.lastSectionIndex = detail.section?.current ?? this.lastSectionIndex
      const progress = detail.fraction ?? 0
      this.location = {
        cfi: detail.cfi ?? '',
        progress,
        chapterProgress: this.chapterFraction(progress),
        chapterTitle: detail.tocItem?.label?.trim() || undefined,
        chapterHref: detail.tocItem?.href || undefined,
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
        const color = annotation.value === this.readalongValue
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

  async goToChapterPercentage(percentage: number): Promise<void> {
    const view = this.view
    if (!view) return
    const fractions = view.getSectionFractions()
    const lo = fractions[this.lastSectionIndex]
    const hi = fractions[this.lastSectionIndex + 1] ?? 1
    if (lo == null || hi <= lo) return this.goToPercentage(percentage)
    const p = Math.max(0, Math.min(1, percentage))
    // Stay strictly inside the section: exactly `hi` is the next chapter.
    await view.goToFraction(Math.min(lo + p * (hi - lo), hi - 1e-6))
  }

  /**
   * Scroll continuous flow by a pixel delta. The paginator's own scrollBy()
   * clamps to one screen either side of its last anchor, which stalls a longer
   * run, so the section's scroll container is moved directly. Reaching the top
   * or bottom of the section hands off to section navigation.
   */
  scrollByPixels(px: number): void {
    if (this.flow !== 'scrolled' || !px) return
    const el = this.scrollContainer()
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    const before = el.scrollTop
    const next = Math.max(0, Math.min(max, before + px))
    if (Math.abs(next - before) > 0.01) {
      el.scrollTop = next
      return
    }
    if (Date.now() < this.sectionHandoffUntil) return
    this.sectionHandoffUntil = Date.now() + 600
    if (px > 0) void this.view?.next()
    else void this.view?.prev()
  }

  /**
   * The element that scrolls the current section. It lives in the paginator's
   * closed shadow root, so it is reached from the content iframe (which the
   * renderer does expose) by walking up to the first scrollable ancestor.
   */
  private scrollContainer(): HTMLElement | null {
    const cached = this.scrollHost
    if (cached && cached.index === this.lastSectionIndex && cached.el.isConnected) {
      return cached.el
    }
    const doc = this.view?.renderer.getContents()[0]?.doc
    const frame = doc?.defaultView?.frameElement as HTMLElement | null | undefined
    let el = frame?.parentElement ?? null
    while (el) {
      if (el.scrollHeight > el.clientHeight + 1) {
        this.scrollHost = { index: this.lastSectionIndex, el }
        return el
      }
      el = el.parentElement
    }
    return null
  }

  setFlow(flow: 'paginated' | 'scrolled'): void {
    this.flow = flow
    this.configureRenderer()
  }

  async search(
    query: string,
    limit = 60,
    onProgress?: (hits: SearchHit[], fraction: number) => void,
  ): Promise<SearchHit[]> {
    const term = query.trim()
    if (!this.view || term.length < 2) return []
    const generation = ++this.searchGeneration
    const hits: SearchHit[] = []
    // matchDiacritics routes foliate's matcher to its fast indexOf-based
    // search (still case-insensitive). The default path segments every
    // grapheme of the book with Intl.Segmenter and is unusably slow.
    const iter = this.view.search({ query: term, matchDiacritics: true })
    let fraction = 0
    try {
      for await (const result of iter) {
        // A newer search superseded this one; stop scanning.
        if (generation !== this.searchGeneration) return hits
        if (typeof result === 'object' && 'subitems' in result) {
          const chapterTitle = result.label?.trim() || undefined
          for (const item of result.subitems) {
            const { pre, match, post } = item.excerpt
            hits.push({
              anchor: item.cfi,
              excerpt: `${pre}${match}${post}`.trim(),
              chapterTitle,
            })
            if (hits.length >= limit) break
          }
          onProgress?.(hits.slice(), fraction)
        } else if (typeof result === 'object' && 'progress' in result) {
          fraction = result.progress
          onProgress?.(hits.slice(), fraction)
        }
        if (hits.length >= limit) break
      }
    } finally {
      if (generation === this.searchGeneration) this.view.clearSearch()
    }
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

  onSelection(cb: (sel: SelectionInfo | null) => void): void {
    this.selectionCb = cb
  }

  onTap(cb: () => void): void {
    this.tapCb = cb
  }

  clearNativeSelection(): void {
    try {
      this.view?.deselect()
    } catch {
      /* no selection */
    }
    for (const content of this.contents()) {
      content.doc.getSelection()?.removeAllRanges()
    }
  }

  selectAnnotation(cfiRange: string): void {
    if (!this.view) return
    try {
      const resolved = this.view.resolveNavigation(cfiRange)
      if (!resolved?.anchor) return
      const content = this.contents().find((c) => c.index === resolved.index)
      if (!content) return
      const range = anchorToRange(resolved.anchor(content.doc), content.doc)
      const sel = content.doc.getSelection()
      if (!range || !sel) return
      // Selecting a highlight must not read as a page tap.
      this.suppressTapUntil = Date.now() + 400
      sel.removeAllRanges()
      sel.addRange(range)
      // The selectionchange listener reports it, which opens the menu.
    } catch {
      /* stale annotation range */
    }
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
      let sinceYield = 0
      for (const dc of domToChunks(body, maxChars)) {
        const range = content.doc.createRange()
        range.setStart(dc.startNode, dc.startOffset)
        range.setEnd(dc.endNode, dc.endOffset)
        // A failed CFI must not drop the chunk from narration — it only
        // loses its highlight/scroll anchor. Silently skipping here was the
        // cause of whole sentences missing from read-aloud.
        let anchor: string | null
        try {
          anchor = this.view.getCFI(content.index, range)
        } catch {
          anchor = null
        }
        const chunk: SpeakableChunk = { index, text: dc.text, anchor }
        result.push(chunk)
        this.spans.push({
          chunk,
          start: locationToOffset(entries, dc.startNode, dc.startOffset),
          end: locationToOffset(entries, dc.endNode, dc.endOffset),
          doc: content.doc,
        })
        index += 1
        if (++sinceYield >= 20) {
          sinceYield = 0
          await yieldToMain()
        }
      }
    }
    return result
  }

  locateChunk(chunk: SpeakableChunk): void {
    if (!this.view) return
    this.clearSpokenHighlight()
    if (!chunk.anchor) return // unanchored chunk: narrated but not highlightable
    // The annotation value must be the RAW CFI: foliate-js feeds it straight
    // into resolveNavigation, so any marker prefix makes resolution fail
    // silently and the highlight never draws. Read-along annotations are
    // told apart from user highlights by identity (readalongValue), not by
    // mangling the value.
    this.readalongValue = chunk.anchor
    void this.view.addAnnotation({ value: chunk.anchor }).catch(() => undefined)
    // Follow the spoken text — but only when it left the screen. Navigating
    // on every chunk would re-align the view so each paragraph jumps to the
    // top; while the chunk is already visible, the highlight alone moves.
    // Resolve + goTo on the renderer directly so read-along doesn't spam the
    // navigation history. We don't await goTo() to avoid blocking playback.
    try {
      const resolved = this.view.resolveNavigation(chunk.anchor)
      if (resolved && !this.isResolvedVisible(resolved)) {
        // goTo may return a Promise; fire it without waiting so the
        // navigation happens in the background while audio plays.
        const result = this.view.renderer.goTo(resolved)
        if (result instanceof Promise) {
          void result.catch(() => {
            // Anchor may be stale after a relayout; ignore errors.
          })
        }
      }
    } catch {
      // Anchor may be stale after a relayout; ignore.
    }
  }

  /** True when a resolved anchor's start sits inside the visible range of the
   *  current page/viewport (from the last relocate event). */
  private isResolvedVisible(resolved: {
    index: number
    anchor?: (doc: Document) => Range | Element
  }): boolean {
    const visible = this.lastRange
    if (!visible) return false
    const content = this.contents().find((c) => c.index === resolved.index)
    if (!content || !resolved.anchor) return false
    const target = anchorToRange(resolved.anchor(content.doc), content.doc)
    if (!target) return false
    // Ranges from different section documents are not comparable.
    if (target.startContainer.ownerDocument !== visible.startContainer.ownerDocument) {
      return false
    }
    try {
      return visible.comparePoint(target.startContainer, target.startOffset) === 0
    } catch {
      return false
    }
  }

  clearSpokenHighlight(): void {
    if (this.readalongValue && this.view) {
      const value = this.readalongValue
      void this.view.deleteAnnotation({ value })
      // If a user highlight shares this exact range, restore its overlay.
      if (this.highlights.has(value)) {
        void this.view.addAnnotation({ value }).catch(() => undefined)
      }
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
    return (
      this.spans.find(
        (s) => s.doc === content.doc && pos >= s.start && pos < s.end,
      )?.chunk ?? null
    )
  }

  currentChunkIndex(): number {
    const range = this.lastRange
    if (!range || !this.spans.length) return 0
    const doc = range.startContainer.ownerDocument
    if (!doc?.body) return 0
    const pos = rangeStartOffset(doc, range)
    return this.spans.find((s) => s.doc === doc && s.end > pos)?.chunk.index ?? 0
  }

  chunkIndexForAnchor(anchor: string): number | null {
    if (!this.view || !this.spans.length) return null
    try {
      const resolved = this.view.resolveNavigation(anchor)
      if (!resolved?.anchor) return null
      const content = this.contents().find((c) => c.index === resolved.index)
      if (!content?.doc.body) return null
      const range = anchorToRange(resolved.anchor(content.doc), content.doc)
      if (!range) return null
      const pos = rangeStartOffset(content.doc, range)
      const span =
        this.spans.find(
          (s) => s.doc === content.doc && pos >= s.start && pos < s.end,
        ) ?? this.spans.find((s) => s.doc === content.doc && s.end > pos)
      return span?.chunk.index ?? null
    } catch {
      return null
    }
  }

  destroy(): void {
    clearTimeout(this.pendingTap)
    const view = this.view
    const book = this.book
    this.view = null
    this.book = null
    this.container = null
    this.highlights.clear()
    // foliate's paginator schedules rAF work (setStyles repaints the page
    // background on the next frame) that dereferences the view's document.
    // Closing one frame later lets any queued callback run against a live
    // view instead of throwing on teardown during quick navigation.
    const close = () => {
      view?.close()
      view?.remove()
      book?.destroy?.()
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(close)
    else close()
  }

  // --- internals ---

  /** Map a whole-book fraction to a fraction within the current section. */
  private chapterFraction(bookFraction: number): number | undefined {
    const fractions = this.view?.getSectionFractions() ?? []
    const lo = fractions[this.lastSectionIndex]
    const hi = fractions[this.lastSectionIndex + 1] ?? 1
    if (lo == null || hi <= lo) return undefined
    return Math.max(0, Math.min(1, (bookFraction - lo) / (hi - lo)))
  }

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

    // Report the selection live from selectionchange (debounced), so the menu
    // appears while the long-press is still held and follows the handles as
    // the selection is expanded — not only after a follow-up tap.
    let debounce: ReturnType<typeof setTimeout> | undefined
    let hadSelection = false

    const reportSelection = () => {
      const sel = doc.getSelection()
      const text = sel?.toString() ?? ''
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !text.trim()) {
        if (hadSelection) {
          hadSelection = false
          // The tap that collapsed the selection is a dismiss, not a page tap.
          this.suppressTapUntil = Date.now() + 400
          this.selectionCb?.(null)
        }
        return
      }
      const range = sel.getRangeAt(0)
      let cfiRange: string
      try {
        cfiRange = this.view?.getCFI(index, range) ?? ''
      } catch {
        return
      }
      if (!cfiRange) return
      hadSelection = true
      this.suppressTapUntil = Date.now() + 400
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

    doc.addEventListener('selectionchange', () => {
      clearTimeout(debounce)
      debounce = setTimeout(reportSelection, 120)
    })

    // Tap inside the book toggles the reader chrome (there are tap-zone
    // overlays only in paginated mode). Ignore taps on links (foliate handles
    // link navigation itself) and anything selection-related. The toggle is
    // deferred slightly so a click that lands on a highlight — which
    // programmatically re-selects it — or one that collapses a selection
    // (selectionchange arrives after the click) never also fires it.
    doc.addEventListener('click', (e) => {
      if (Date.now() < this.suppressTapUntil) return
      const sel = doc.getSelection()
      if (sel && !sel.isCollapsed) return
      const target = e.target as Element | null
      if (target?.closest?.('a[href]')) return
      clearTimeout(this.pendingTap)
      this.pendingTap = setTimeout(() => {
        if (Date.now() < this.suppressTapUntil) return
        this.tapCb?.()
      }, 180)
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

/**
 * Normalize a resolved navigation anchor (Range or Element) to a Range.
 * `instanceof Range` is unreliable across the iframe realm boundary, so the
 * check is structural.
 */
function anchorToRange(target: Range | Element | null, doc: Document): Range | null {
  if (!target) return null
  if ('startContainer' in target) return target
  const range = doc.createRange()
  range.selectNodeContents(target)
  return range
}

/**
 * Global character offset (across the section's text nodes) of a range's
 * start. Falls back to the first text node at/after the range start when the
 * start container is not itself a text node.
 */
function rangeStartOffset(doc: Document, range: Range): number {
  const entries = collectTextNodes(doc.body)
  const node = range.startContainer
  if (node.nodeType === Node.TEXT_NODE) {
    return locationToOffset(entries, node, range.startOffset)
  }
  for (const entry of entries) {
    try {
      if (range.comparePoint(entry.node, 0) >= 0) return entry.start
    } catch {
      /* node outside comparable tree */
    }
  }
  return 0
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
