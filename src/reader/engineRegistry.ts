import type { BookFormat } from '@/domain/models'
import { FoliateEngine } from './foliateEngine'
import { TextEngine } from './textEngine'
import { PdfEngine } from './pdfEngine'
import { type BookEngine, UnsupportedFormatError } from './types'

type EngineFactory = () => BookEngine

/**
 * Maps a book format to the engine that renders it. New formats are added by
 * registering a factory here (or via registerEngine at runtime) — the reader
 * UI and TTS pipeline are format-agnostic and need no changes.
 */
const factories = new Map<BookFormat, EngineFactory>([
  ['epub', () => new FoliateEngine('epub')],
  ['text', () => new TextEngine()],
  ['mobi', () => new FoliateEngine('mobi')],
  ['azw3', () => new FoliateEngine('azw3')],
  ['pdf', () => new PdfEngine()],
])

export function registerEngine(format: BookFormat, factory: EngineFactory): void {
  factories.set(format, factory)
}

export function createEngine(format: BookFormat): BookEngine {
  const factory = factories.get(format)
  if (!factory) throw new UnsupportedFormatError(format)
  return factory()
}

export function isFormatSupported(format: BookFormat): boolean {
  return factories.has(format)
}

const EXTENSION_FORMATS: Record<string, BookFormat> = {
  epub: 'epub',
  mobi: 'mobi',
  azw: 'mobi',
  azw3: 'azw3',
  txt: 'text',
  text: 'text',
  md: 'text',
  markdown: 'text',
  pdf: 'pdf',
}

/**
 * File extensions (without dot) that the import pipeline accepts. Every entry
 * maps to a registered engine, so the picker, importBook and the reader stay
 * aligned from a single source of truth.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] =
  Object.keys(EXTENSION_FORMATS)

/** Infer a book format from a filename, defaulting to text for unknowns. */
export function detectFormat(filename: string): BookFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_FORMATS[ext] ?? 'text'
}
