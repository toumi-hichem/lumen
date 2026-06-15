import type { BookFormat, HighlightColor } from '@/domain/models'
import { chunkText } from '@/lib/textChunk'
import {
  type BookEngine,
  type BookLocationInfo,
  type ReaderTheme,
  type SelectionInfo,
  type TocItem,
} from './types'

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
  private readonly highlights = new Map<string, HighlightColor>()
  private theme: ReaderTheme | null = null

  async open(data: ArrayBuffer): Promise<void> {
    this.text = new TextDecoder('utf-8').decode(data)
  }

  async renderTo(element: HTMLElement): Promise<void> {
    this.container = element
    element.innerHTML = ''
    const content = document.createElement('div')
    content.className = 'text-engine-content'
    content.textContent = this.text
    content.style.whiteSpace = 'pre-wrap'
    content.style.maxWidth = '42rem'
    content.style.margin = '0 auto'
    element.style.overflow = 'auto'
    element.style.height = '100%'
    element.appendChild(content)
    this.content = content

    element.addEventListener('scroll', this.handleScroll)
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
    return chunkText(this.text)
  }

  destroy(): void {
    this.container?.removeEventListener('scroll', this.handleScroll)
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
    this.selectionCb?.({ cfiRange: `text-range:${start}-${end}`, text })
  }

  private renderHighlights(): void {
    if (!this.content || !supportsHighlightApi()) return
    clearHighlightRegistry()
    for (const [cfiRange, color] of this.highlights) {
      const parsed = parseTextRange(cfiRange)
      if (!parsed) continue
      const range = rangeFromOffsets(this.content, parsed.start, parsed.end)
      if (!range) continue
      registerHighlightRange(color, range)
    }
  }
}

// --- CSS Custom Highlight API helpers (feature-detected) ---

const registry = new Map<HighlightColor, Highlight>()

function supportsHighlightApi(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
}

function registerHighlightRange(color: HighlightColor, range: Range): void {
  if (!supportsHighlightApi()) return
  let highlight = registry.get(color)
  if (!highlight) {
    highlight = new Highlight()
    registry.set(color, highlight)
    CSS.highlights.set(`hl-${color}`, highlight)
  }
  highlight.add(range)
}

function clearHighlightRegistry(): void {
  if (!supportsHighlightApi()) return
  for (const color of registry.keys()) CSS.highlights.delete(`hl-${color}`)
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
