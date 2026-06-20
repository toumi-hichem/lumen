import type { BookFormat, HighlightColor } from '@/domain/models'
import { chunkText } from '@/lib/textChunk'
import { domToChunks } from '@/lib/domChunk'
import { applyBionic } from '@/lib/bionic'
import {
  type BookEngine,
  type BookLocationInfo,
  type ReaderTheme,
  type SearchHit,
  type SelectionInfo,
  type SpeakableChunk,
  type TocItem,
} from './types'

interface ChunkSpan {
  chunk: SpeakableChunk
  start: number
  end: number
}

/**
 * Plain-text / Markdown reader engine. Renders decoded text into a scrollable
 * column, derives progress from scroll position, and supports selection +
 * highlighting via the CSS Custom Highlight API (no DOM mutation, so offsets
 * stay stable). Locator format: `text:<scrollFraction>` for positions and
 * `text-range:<start>-<end>` (global character offsets) for highlights.
 */
export class TextEngine implements BookEngine {
  readonly format: BookFormat = 'text'

  private text = ''
  private container: HTMLElement | null = null
  private content: HTMLElement | null = null
  private location: BookLocationInfo | null = null
  private locationCb: ((loc: BookLocationInfo) => void) | null = null
  private selectionCb: ((sel: SelectionInfo) => void) | null = null
  private tapCb: (() => void) | null = null
  private readonly highlights = new Map<string, HighlightColor>()
  private theme: ReaderTheme | null = null
  private spans: ChunkSpan[] = []
  private asHtml = false
  private bionic = { enabled: false, strength: 0.5 }

  async open(data: ArrayBuffer): Promise<void> {
    this.text = new TextDecoder('utf-8').decode(data)
  }

  /**
   * Inject pre-extracted content directly (used by the MOBI engine, which
   * reuses this engine's reflow/TTS/highlight machinery). `asHtml` renders the
   * value as HTML; otherwise it is treated as preformatted plain text.
   */
  setContent(value: string, asHtml = false): void {
    this.text = value
    this.asHtml = asHtml
  }

  async renderTo(element: HTMLElement): Promise<void> {
    this.container = element
    element.innerHTML = ''
    const content = document.createElement('div')
    content.className = 'text-engine-content'
    if (this.asHtml) {
      content.innerHTML = this.text
    } else {
      content.textContent = this.text
      content.style.whiteSpace = 'pre-wrap'
    }
    content.style.maxWidth = '42rem'
    content.style.margin = '0 auto'
    element.style.overflow = 'auto'
    element.style.height = '100%'
    element.appendChild(content)
    this.content = content

    element.addEventListener('scroll', this.handleScroll)
    element.addEventListener('click', this.handleTap)
    content.addEventListener('mouseup', this.handleSelection)
    content.addEventListener('touchend', this.handleSelection)

    if (this.theme) this.applyTheme(this.theme)
    this.emitLocation()
  }

  async display(target?: string): Promise<void> {
    if (!this.container) return
    if (target?.startsWith('text:')) {
      const fraction = Number(target.slice('text:'.length)) || 0
      this.container.scrollTop =
        fraction * (this.container.scrollHeight - this.container.clientHeight)
    } else if (target?.startsWith('text-range:') && this.content) {
      // Used by bookmarks, highlights and search hits.
      const parsed = parseTextRange(target)
      const range = parsed && rangeFromOffsets(this.content, parsed.start, parsed.end)
      if (range) {
        const cRect = this.container.getBoundingClientRect()
        const rRect = range.getBoundingClientRect()
        this.container.scrollTop +=
          rRect.top - cRect.top - this.container.clientHeight / 3
      }
    }
    this.emitLocation()
  }

  async next(): Promise<void> {
    if (!this.container) return
    this.container.scrollBy({ top: this.container.clientHeight * 0.9 })
  }

  async prev(): Promise<void> {
    if (!this.container) return
    this.container.scrollBy({ top: -this.container.clientHeight * 0.9 })
  }

  applyTheme(theme: ReaderTheme): void {
    this.theme = theme
    if (!this.container || !this.content) return
    this.container.style.background = theme.pageBackground
    this.content.style.color = theme.pageText
    this.content.style.fontFamily = theme.fontFamily
    this.content.style.fontSize = `${theme.fontSizePercent}%`
    this.content.style.lineHeight = String(theme.lineHeight)
    this.content.style.padding = `${theme.margin}px`
    this.content.style.textAlign = theme.justify ? 'justify' : 'start'

    // Focus / ADHD aids. Spacing and image hiding live on the persistent
    // content element, so they survive a bionic re-populate.
    this.content.style.letterSpacing = theme.letterSpacing
      ? `${theme.letterSpacing}em`
      : ''
    this.content.classList.toggle('hide-images', theme.hideImages)
    this.content.classList.toggle('soft-wrap', theme.softWrap)

    // Bionic reading mutates the DOM, so only re-populate when it actually
    // changes (preserving scroll position and re-applying highlights).
    const b = theme.bionic
    const changed =
      b.enabled !== this.bionic.enabled ||
      (b.enabled && b.strength !== this.bionic.strength)
    if (changed) {
      this.bionic = { ...b }
      this.repopulate()
    }
  }

  /** Reset content from source, re-apply bionic + highlights, keep scroll. */
  private repopulate(): void {
    if (!this.container || !this.content) return
    const range = this.container.scrollHeight - this.container.clientHeight
    const frac = range > 0 ? this.container.scrollTop / range : 0
    if (this.asHtml) this.content.innerHTML = this.text
    else this.content.textContent = this.text
    if (this.bionic.enabled) applyBionic(this.content, this.bionic.strength)
    this.renderHighlights()
    const newRange = this.container.scrollHeight - this.container.clientHeight
    this.container.scrollTop = frac * newRange
  }

  async goToPercentage(percentage: number): Promise<void> {
    if (!this.container) return
    const clamped = Math.max(0, Math.min(1, percentage))
    this.container.scrollTop =
      clamped * (this.container.scrollHeight - this.container.clientHeight)
    this.emitLocation()
  }

  /** The text engine is always continuous; flow is a no-op. */
  setFlow(): void {}

  scrollByPixels(px: number): void {
    if (!this.container) return
    this.container.scrollTop += px
    this.emitLocation()
  }

  async search(query: string, limit = 100): Promise<SearchHit[]> {
    const term = query.trim()
    if (term.length < 2) return []
    const haystack = this.plainText()
    const lower = haystack.toLowerCase()
    const needle = term.toLowerCase()
    const hits: SearchHit[] = []
    let from = 0
    while (hits.length < limit) {
      const at = lower.indexOf(needle, from)
      if (at === -1) break
      const start = Math.max(0, at - 30)
      const end = Math.min(haystack.length, at + term.length + 40)
      hits.push({
        anchor: `text-range:${at}-${at + term.length}`,
        excerpt: `…${haystack.slice(start, end).replace(/\s+/g, ' ').trim()}…`,
      })
      from = at + term.length
    }
    return hits
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
    color: HighlightColor,
    _cssColor: string,
  ): void {
    this.highlights.set(cfiRange, color)
    this.renderHighlights()
  }

  removeHighlight(cfiRange: string): void {
    this.highlights.delete(cfiRange)
    this.renderHighlights()
  }

  async toc(): Promise<TocItem[]> {
    return [{ label: 'Start', href: 'text:0', level: 0 }]
  }

  async getCurrentSectionText(): Promise<string[]> {
    return chunkText(this.plainText())
  }

  /** Rendered text content (strips HTML tags in MOBI/HTML mode). */
  private plainText(): string {
    return this.content?.textContent ?? this.text
  }

  async getSpeakableChunks(maxChars = 240): Promise<SpeakableChunk[]> {
    if (!this.content) return []
    this.spans = []
    const result: SpeakableChunk[] = []
    let index = 0
    for (const dc of domToChunks(this.content, maxChars)) {
      const start = globalOffset(this.content, dc.startNode, dc.startOffset)
      const end = globalOffset(this.content, dc.endNode, dc.endOffset)
      const chunk: SpeakableChunk = {
        index,
        text: dc.text,
        anchor: `text-range:${start}-${end}`,
      }
      result.push(chunk)
      this.spans.push({ chunk, start, end })
      index += 1
    }
    return result
  }

  locateChunk(chunk: SpeakableChunk): void {
    if (!this.content || !supportsHighlightApi()) return
    const parsed = parseTextRange(chunk.anchor)
    if (!parsed) return
    const range = rangeFromOffsets(this.content, parsed.start, parsed.end)
    if (!range) return
    clearHighlightName('readalong')
    registerHighlightRange('readalong', range)
    // Keep the spoken line comfortably within the scroll viewport.
    if (this.container) {
      const cRect = this.container.getBoundingClientRect()
      const rRect = range.getBoundingClientRect()
      if (rRect.top < cRect.top || rRect.bottom > cRect.bottom) {
        this.container.scrollTop +=
          rRect.top - cRect.top - this.container.clientHeight / 3
      }
    }
  }

  clearSpokenHighlight(): void {
    clearHighlightName('readalong')
  }

  chunkAtPoint(x: number, y: number): SpeakableChunk | null {
    if (!this.content) return null
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const caret = doc.caretRangeFromPoint?.(x, y) ?? null
    if (!caret) return null
    const pos = globalOffset(this.content, caret.startContainer, caret.startOffset)
    return this.spans.find((s) => pos >= s.start && pos < s.end)?.chunk ?? null
  }

  destroy(): void {
    this.container?.removeEventListener('scroll', this.handleScroll)
    this.container?.removeEventListener('click', this.handleTap)
    this.content?.removeEventListener('mouseup', this.handleSelection)
    this.content?.removeEventListener('touchend', this.handleSelection)
    if (this.container) this.container.innerHTML = ''
    clearHighlightRegistry()
    this.container = null
    this.content = null
  }

  private handleScroll = (): void => {
    this.emitLocation()
  }

  /** Toggle the reader chrome on a plain tap (not a selection or link). A
   *  touch scroll never fires `click`, so this only reacts to genuine taps. */
  private handleTap = (event: MouseEvent): void => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    const target = event.target as HTMLElement | null
    if (target?.closest('a')) return
    this.tapCb?.()
  }

  private emitLocation(): void {
    if (!this.container) return
    const scrollable = this.container.scrollHeight - this.container.clientHeight
    const fraction = scrollable > 0 ? this.container.scrollTop / scrollable : 0
    this.location = { cfi: `text:${fraction.toFixed(4)}`, progress: fraction }
    this.locationCb?.(this.location)
  }

  private handleSelection = (): void => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !this.content) return
    const text = selection.toString().trim()
    if (!text) return
    const range = selection.getRangeAt(0)
    const start = globalOffset(this.content, range.startContainer, range.startOffset)
    const end = globalOffset(this.content, range.endContainer, range.endOffset)
    const r = range.getBoundingClientRect()
    this.selectionCb?.({
      cfiRange: `text-range:${start}-${end}`,
      text,
      rect: {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      },
    })
  }

  private renderHighlights(): void {
    if (!this.content || !supportsHighlightApi()) return
    // Clear only user-highlight layers; leave the read-along layer intact.
    for (const color of HL_COLORS) clearHighlightName(`hl-${color}`)
    for (const [cfiRange, color] of this.highlights) {
      const parsed = parseTextRange(cfiRange)
      if (!parsed) continue
      const range = rangeFromOffsets(this.content, parsed.start, parsed.end)
      if (!range) continue
      registerHighlightRange(`hl-${color}`, range)
    }
  }
}

const HL_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']

// --- CSS Custom Highlight API helpers (feature-detected) ---
// Registration names map to ::highlight(<name>) rules in ui.css:
// hl-yellow/green/blue/pink/purple for user highlights, readalong for TTS.

const registry = new Map<string, Highlight>()

function supportsHighlightApi(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
}

function registerHighlightRange(name: string, range: Range): void {
  if (!supportsHighlightApi()) return
  let highlight = registry.get(name)
  if (!highlight) {
    highlight = new Highlight()
    registry.set(name, highlight)
    CSS.highlights.set(name, highlight)
  }
  highlight.add(range)
}

function clearHighlightName(name: string): void {
  if (!supportsHighlightApi()) return
  CSS.highlights.delete(name)
  registry.delete(name)
}

function clearHighlightRegistry(): void {
  if (!supportsHighlightApi()) return
  for (const name of registry.keys()) CSS.highlights.delete(name)
  registry.clear()
}

function parseTextRange(cfiRange: string): { start: number; end: number } | null {
  const match = /^text-range:(\d+)-(\d+)$/.exec(cfiRange)
  if (!match) return null
  return { start: Number(match[1]), end: Number(match[2]) }
}

/** Character offset of a node/offset relative to the root's text content. */
function globalOffset(root: Node, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let current = walker.nextNode()
  while (current) {
    if (current === node) return total + offset
    total += current.textContent?.length ?? 0
    current = walker.nextNode()
  }
  return total
}

function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let consumed = 0
  let startNode: Node | null = null
  let startOffset = 0
  let endNode: Node | null = null
  let endOffset = 0
  let node = walker.nextNode()
  while (node) {
    const len = node.textContent?.length ?? 0
    if (!startNode && start <= consumed + len) {
      startNode = node
      startOffset = start - consumed
    }
    if (end <= consumed + len) {
      endNode = node
      endOffset = end - consumed
      break
    }
    consumed += len
    node = walker.nextNode()
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}
