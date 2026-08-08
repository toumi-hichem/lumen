/**
 * Minimal typings for the foliate-js modules Lumen uses. The library ships no
 * types; these cover only the surface consumed by the reader engine and the
 * import pipeline. The dependency is pinned to an upstream commit in
 * package.json (upstream publishes no releases).
 */

declare module 'foliate-js/view.js' {
  export interface FoliateTocItem {
    label?: string
    href?: string
    subitems?: FoliateTocItem[] | null
  }

  export interface FoliateMetadata {
    title?: unknown
    author?: unknown
    language?: string | string[]
    [key: string]: unknown
  }

  export interface FoliateSection {
    id?: string | number
    linear?: string
    createDocument?: () => Promise<Document>
    resolveHref?: (href: string) => string
  }

  export interface FoliateBook {
    metadata?: FoliateMetadata
    toc?: FoliateTocItem[]
    sections: FoliateSection[]
    dir?: string
    rendition?: { layout?: string }
    getCover?: () => Promise<Blob | null>
    destroy?: () => void
  }

  export interface FoliateContent {
    doc: Document
    index: number
    overlayer?: unknown
  }

  export interface FoliateRenderer extends HTMLElement {
    next(distance?: number): Promise<void>
    prev(distance?: number): Promise<void>
    goTo(target: { index: number; anchor?: unknown }): Promise<void>
    getContents(): FoliateContent[]
    setStyles?(css: string): void
    scrolled?: boolean
    destroy(): void
  }

  export interface FoliateLocation {
    fraction?: number
    cfi?: string
    range?: Range
    tocItem?: FoliateTocItem
    pageItem?: FoliateTocItem
    /** Spine position, from SectionProgress. */
    section?: { current: number; total: number }
  }

  export interface ResolvedNavigation {
    index: number
    anchor?: (doc: Document) => Range | Element
  }

  export interface FoliateSearchSubitem {
    cfi: string
    /** Match context; render as `pre + match + post`. */
    excerpt: { pre: string; match: string; post: string }
  }

  export type FoliateSearchResult =
    | { progress: number }
    | { label?: string; subitems: FoliateSearchSubitem[] }
    | 'done'

  export class View extends HTMLElement {
    book: FoliateBook
    renderer: FoliateRenderer
    lastLocation: FoliateLocation | null
    isFixedLayout: boolean
    open(book: FoliateBook | Blob | string): Promise<void>
    close(): void
    init(options: {
      lastLocation?: string
      showTextStart?: boolean
    }): Promise<void>
    goTo(
      target: string | number | { fraction: number },
    ): Promise<ResolvedNavigation | undefined>
    goToFraction(fraction: number): Promise<void>
    next(distance?: number): Promise<void>
    prev(distance?: number): Promise<void>
    getCFI(index: number, range?: Range): string
    resolveNavigation(
      target: string | number | { fraction: number },
    ): ResolvedNavigation | undefined
    addAnnotation(
      annotation: { value: string },
      remove?: boolean,
    ): Promise<{ index: number; label: string } | undefined>
    deleteAnnotation(annotation: { value: string }): Promise<unknown>
    search(options: {
      query: string
      index?: number
      granularity?: string
      matchCase?: boolean
      matchDiacritics?: boolean
      matchWholeWords?: boolean
    }): AsyncGenerator<FoliateSearchResult>
    clearSearch(): void
    deselect(): void
    /** Cumulative 0..1 start fraction of each spine section (last entry 1). */
    getSectionFractions(): number[]
  }

  export function makeBook(file: Blob | string): Promise<FoliateBook>
}

declare module 'foliate-js/overlayer.js' {
  export type DrawFunc = (
    rects: DOMRectList | DOMRect[],
    options?: Record<string, unknown>,
  ) => SVGElement

  export class Overlayer {
    static highlight: DrawFunc
    static underline: DrawFunc
    static outline: DrawFunc
    static squiggly: DrawFunc
  }
}

declare module 'foliate-js/mobi.js' {
  export interface MobiSection {
    createDocument(): Promise<Document>
  }
  export interface MobiBook {
    sections?: MobiSection[]
    metadata?: Record<string, unknown>
    toc?: unknown
    getCover?: () => Promise<Blob | null>
  }
  export const isMOBI: (file: Blob) => Promise<boolean>
  export class MOBI {
    constructor(options: { unzlib: (data: Uint8Array) => Uint8Array })
    open(file: Blob): Promise<MobiBook>
  }
}
