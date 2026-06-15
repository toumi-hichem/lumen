import ePub, {
  type Book,
  type Rendition,
  type Contents,
  type Location,
  type NavItem,
} from 'epubjs'
import type { HighlightColor } from '@/domain/models'
import { chunkText } from '@/lib/textChunk'
import {
  type BookEngine,
  type BookLocationInfo,
  type ReaderTheme,
  type SelectionInfo,
  type TocItem,
} from './types'

const THEME_NAME = 'lumen'

/** EPUB reader engine backed by epub.js. */
export class EpubEngine implements BookEngine {
  readonly format = 'epub' as const

  private book: Book | null = null
  private rendition: Rendition | null = null
  private location: BookLocationInfo | null = null
  private tocItems: TocItem[] = []
  private locationCb: ((loc: BookLocationInfo) => void) | null = null
  private selectionCb: ((sel: SelectionInfo) => void) | null = null
  private lastTheme: ReaderTheme | null = null

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
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'auto',
      allowScriptedContent: false,
    })

    this.rendition.on('relocated', (loc: Location) => {
      const cfi = loc.start.cfi
      const progress =
        this.book?.locations.percentageFromCfi(cfi) ?? loc.start.percentage ?? 0
      this.location = {
        cfi,
        progress,
        chapterTitle: this.chapterTitleFor(loc.start.href),
      }
      this.locationCb?.(this.location)
    })

    this.rendition.on('selected', (cfiRange: string, contents: Contents) => {
      const text = contents.window.getSelection()?.toString() ?? ''
      if (text.trim()) this.selectionCb?.({ cfiRange, text })
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

  applyTheme(theme: ReaderTheme): void {
    this.lastTheme = theme
    if (!this.rendition) return

    this.rendition.themes.register(THEME_NAME, {
      body: {
        background: `${theme.pageBackground} !important`,
        color: `${theme.pageText} !important`,
        'font-family': `${theme.fontFamily} !important`,
        'line-height': `${theme.lineHeight} !important`,
        'padding': `0 ${theme.margin}px !important`,
      },
      p: { 'line-height': `${theme.lineHeight} !important` },
      a: { color: `${theme.pageLink} !important` },
      '::selection': { background: theme.vars['--reader-selection-background'] },
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

  destroy(): void {
    this.rendition?.destroy()
    this.book?.destroy()
    this.rendition = null
    this.book = null
  }

  private chapterTitleFor(href: string): string | undefined {
    const match = this.tocItems.find((item) => href.includes(stripHash(item.href)))
    return match?.label.trim()
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
