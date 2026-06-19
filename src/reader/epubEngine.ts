import ePub, {
  type Book,
  type Rendition,
  type Contents,
  type Location,
  type NavItem,
} from 'epubjs'
import type Section from 'epubjs/types/section'
import type { HighlightColor } from '@/domain/models'
import { chunkText } from '@/lib/textChunk'
import { collectTextNodes, domToChunks, locationToOffset } from '@/lib/domChunk'
import {
  type BookEngine,
  type BookLocationInfo,
  type ReaderTheme,
  type SearchHit,
  type SelectionInfo,
  type SpeakableChunk,
  type TocItem,
} from './types'

const THEME_NAME = 'lumen'
const READALONG_CLASS = 'lumen-readalong'

interface ChunkSpan {
  chunk: SpeakableChunk
  /** Global character offsets within the section, for tap-to-start mapping. */
  start: number
  end: number
}

/** EPUB reader engine backed by epub.js. */
export class EpubEngine implements BookEngine {
  readonly format = 'epub' as const

  private book: Book | null = null
  private rendition: Rendition | null = null
  private containerObserver: ResizeObserver | null = null
  private location: BookLocationInfo | null = null
  private tocItems: TocItem[] = []
  private locationCb: ((loc: BookLocationInfo) => void) | null = null
  private selectionCb: ((sel: SelectionInfo) => void) | null = null
  private lastTheme: ReaderTheme | null = null
  private spans: ChunkSpan[] = []
  private readalongCfi: string | null = null
  private readalongColor = 'rgba(255, 213, 0, 0.4)'
  private flow: 'paginated' | 'scrolled' = 'paginated'

  async open(data: ArrayBuffer): Promise<void> {
    this.book = ePub(data)
    await this.book.ready
    const nav = await this.book.loaded.navigation
    this.tocItems = flattenToc(nav.toc, 0)
    // Generate coarse locations in the background for the progress bar.
    void this.book.locations.generate(1600).catch(() => undefined)
  }

  async renderTo(element: HTMLElement): Promise<void> {
    if (!this.book) throw new Error('open() must be called before renderTo()')
    this.rendition = this.book.renderTo(element, {
      width: element.clientWidth,
      height: element.clientHeight,
      flow: this.flow === 'scrolled' ? 'scrolled-doc' : 'paginated',
      spread: 'none',
      allowScriptedContent: false,
    })

    // Re-layout when the container resizes (e.g. footer panel opens/closes).
    this.containerObserver = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientHeight > 0) {
        this.rendition?.resize(element.clientWidth, element.clientHeight)
      }
    })
    this.containerObserver.observe(element)

    this.rendition.on('relocated', (loc: Location) => {
      const cfi = loc.start.cfi
      const progress =
        this.book?.locations.percentageFromCfi(cfi) ?? loc.start.percentage ?? 0
      this.location = {
        cfi,
        progress,
        chapterTitle: this.chapterTitleFor(loc.start.href),
      }
      // Chunk anchors are section-relative; invalidate on navigation.
      this.spans = []
      this.locationCb?.(this.location)
    })

    this.rendition.on('selected', (cfiRange: string, contents: Contents) => {
      const sel = contents.window.getSelection()
      const text = sel?.toString() ?? ''
      if (!text.trim()) return
      let rect: SelectionInfo['rect']
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0).getBoundingClientRect()
        // The range is measured inside the iframe; offset by the frame's
        // position so coordinates are relative to the outer viewport.
        const frame = contents.window.frameElement?.getBoundingClientRect()
        const ox = frame?.left ?? 0
        const oy = frame?.top ?? 0
        rect = {
          top: r.top + oy,
          bottom: r.bottom + oy,
          left: r.left + ox,
          right: r.right + ox,
          width: r.width,
          height: r.height,
        }
      }
      this.selectionCb?.({ cfiRange, text, rect })
    })

    // Suppress the platform's own selection callout / context menu inside the
    // book iframe so only Lumen's selection menu appears.
    this.rendition.hooks.content.register((contents: Contents) => {
      contents.document.addEventListener('contextmenu', (e) => e.preventDefault())
    })

    if (this.lastTheme) this.applyTheme(this.lastTheme)
  }

  async display(target?: string): Promise<void> {
    if (!this.rendition) throw new Error('renderTo() must be called first')
    await this.rendition.display(target)
  }

  async next(): Promise<void> {
    await this.rendition?.next()
  }

  async prev(): Promise<void> {
    await this.rendition?.prev()
  }

  async goToPercentage(percentage: number): Promise<void> {
    if (!this.book || !this.rendition) return
    const cfi = this.book.locations.cfiFromPercentage(
      Math.max(0, Math.min(1, percentage)),
    )
    if (cfi) await this.rendition.display(cfi)
  }

  setFlow(flow: 'paginated' | 'scrolled'): void {
    this.flow = flow
  }

  async search(query: string, limit = 60): Promise<SearchHit[]> {
    const term = query.trim()
    if (!this.book || term.length < 2) return []
    const spine = this.book.spine as unknown as { spineItems?: Section[] }
    const sections = spine.spineItems ?? []
    const loader = this.book.load.bind(this.book)
    const hits: SearchHit[] = []

    for (const section of sections) {
      if (hits.length >= limit) break
      try {
        await Promise.resolve(section.load(loader))
        const found = section.find(term) as unknown as Array<{
          cfi: string
          excerpt: string
        }>
        const title = this.chapterTitleFor(section.href)
        for (const f of found) {
          hits.push({ anchor: f.cfi, excerpt: f.excerpt.trim(), chapterTitle: title })
          if (hits.length >= limit) break
        }
      } catch {
        // Skip sections that fail to load.
      } finally {
        section.unload()
      }
    }
    return hits
  }

  applyTheme(theme: ReaderTheme): void {
    this.lastTheme = theme
    this.readalongColor = theme.readalongBackground
    if (!this.rendition) return

    const textAlign = theme.justify ? 'justify' : 'start'
    this.rendition.themes.register(THEME_NAME, {
      body: {
        background: `${theme.pageBackground} !important`,
        color: `${theme.pageText} !important`,
        'font-family': `${theme.fontFamily} !important`,
        'line-height': `${theme.lineHeight} !important`,
        'padding': `0 ${theme.margin}px !important`,
        'text-align': `${textAlign} !important`,
        'letter-spacing': `${theme.letterSpacing}em !important`,
        // Hide the OS selection callout; Lumen shows its own menu instead.
        '-webkit-touch-callout': 'none',
      },
      p: {
        'line-height': `${theme.lineHeight} !important`,
        'text-align': `${textAlign} !important`,
        'letter-spacing': `${theme.letterSpacing}em !important`,
      },
      a: { color: `${theme.pageLink} !important` },
      '::selection': { background: theme.vars['--reader-selection-background'] },
      ...(theme.hideImages
        ? { 'img, svg, image': { display: 'none !important' } }
        : {}),
      ...(theme.softWrap
        ? {
            'body, p, div, td, li': {
              'overflow-wrap': 'break-word !important',
              'word-break': 'break-word !important',
            },
            'pre, code': {
              'white-space': 'pre-wrap !important',
              'overflow-wrap': 'break-word !important',
            },
          }
        : {}),
    })
    this.rendition.themes.select(THEME_NAME)
    this.rendition.themes.fontSize(`${theme.fontSizePercent}%`)
    this.rendition.themes.font(theme.fontFamily)
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

  addHighlight(
    cfiRange: string,
    _color: HighlightColor,
    cssColor: string,
    onClick?: () => void,
  ): void {
    this.rendition?.annotations.highlight(
      cfiRange,
      {},
      () => onClick?.(),
      '',
      { fill: cssColor, 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' },
    )
  }

  removeHighlight(cfiRange: string): void {
    this.rendition?.annotations.remove(cfiRange, 'highlight')
  }

  async toc(): Promise<TocItem[]> {
    return this.tocItems
  }

  async getCurrentSectionText(): Promise<string[]> {
    if (!this.rendition) return []
    const contents = normalizeContents(this.rendition.getContents())
    const text = contents
      .map((c) => c.document?.body?.textContent ?? '')
      .join(' ')
    return chunkText(text)
  }

  async getSpeakableChunks(maxChars = 240): Promise<SpeakableChunk[]> {
    if (!this.rendition) return []
    this.spans = []
    const result: SpeakableChunk[] = []
    let index = 0
    for (const c of normalizeContents(this.rendition.getContents())) {
      const body = c.document?.body
      if (!body) continue
      const entries = collectTextNodes(body)
      for (const dc of domToChunks(body, maxChars)) {
        const range = c.document.createRange()
        range.setStart(dc.startNode, dc.startOffset)
        range.setEnd(dc.endNode, dc.endOffset)
        let anchor: string
        try {
          anchor = c.cfiFromRange(range)
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
    if (!this.rendition) return
    this.clearSpokenHighlight()
    this.readalongCfi = chunk.anchor
    try {
      this.rendition.annotations.highlight(
        chunk.anchor,
        {},
        undefined,
        READALONG_CLASS,
        {
          fill: this.readalongColor,
          'fill-opacity': '0.4',
          'mix-blend-mode': 'multiply',
        },
      )
    } catch {
      // Anchor may be in a non-rendered section; ignore.
    }
    // Follow the spoken text: page/scroll to it only when off-screen.
    if (!this.isAnchorVisible(chunk.anchor)) {
      void this.rendition.display(chunk.anchor)
    }
  }

  clearSpokenHighlight(): void {
    if (this.readalongCfi && this.rendition) {
      try {
        this.rendition.annotations.remove(this.readalongCfi, 'highlight')
      } catch {
        // Already gone; ignore.
      }
    }
    this.readalongCfi = null
  }

  chunkAtPoint(x: number, y: number): SpeakableChunk | null {
    const c = this.primaryContents()
    if (!c) return null
    const frame = c.document.defaultView?.frameElement as HTMLElement | null
    const rect = frame?.getBoundingClientRect()
    const lx = rect ? x - rect.left : x
    const ly = rect ? y - rect.top : y
    const doc = c.document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const caret = doc.caretRangeFromPoint?.(lx, ly) ?? null
    if (!caret) return null
    const entries = collectTextNodes(doc.body)
    const pos = locationToOffset(entries, caret.startContainer, caret.startOffset)
    return this.spans.find((s) => pos >= s.start && pos < s.end)?.chunk ?? null
  }

  destroy(): void {
    this.containerObserver?.disconnect()
    this.containerObserver = null
    this.rendition?.destroy()
    this.book?.destroy()
    this.rendition = null
    this.book = null
  }

  private chapterTitleFor(href: string): string | undefined {
    const match = this.tocItems.find((item) => href.includes(stripHash(item.href)))
    return match?.label.trim()
  }

  private primaryContents(): Contents | null {
    if (!this.rendition) return null
    return normalizeContents(this.rendition.getContents())[0] ?? null
  }

  private isAnchorVisible(cfi: string): boolean {
    const c = this.primaryContents()
    if (!c) return true
    try {
      const rect = c.range(cfi).getBoundingClientRect()
      const w = c.document.documentElement.clientWidth
      const h = c.document.documentElement.clientHeight
      return rect.right > 0 && rect.left < w && rect.bottom > 0 && rect.top < h
    } catch {
      return true
    }
  }
}

function flattenToc(items: NavItem[], level: number): TocItem[] {
  const out: TocItem[] = []
  for (const item of items) {
    out.push({ label: item.label.trim(), href: item.href, level })
    if (item.subitems?.length) {
      out.push(...flattenToc(item.subitems, level + 1))
    }
  }
  return out
}

/** epub.js 0.3 returns an array at runtime though the type says single. */
function normalizeContents(value: Contents | Contents[]): Contents[] {
  return Array.isArray(value) ? value : [value]
}

function stripHash(href: string): string {
  const hashIndex = href.indexOf('#')
  return hashIndex === -1 ? href : href.slice(0, hashIndex)
}
