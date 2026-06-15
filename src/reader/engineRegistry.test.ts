import { describe, expect, it } from 'vitest'
import {
  createEngine,
  detectFormat,
  isFormatSupported,
} from './engineRegistry'
import { UnsupportedFormatError } from './types'

describe('engineRegistry', () => {
  it('detects formats from file extensions', () => {
    expect(detectFormat('book.epub')).toBe('epub')
    expect(detectFormat('notes.txt')).toBe('text')
    expect(detectFormat('readme.md')).toBe('text')
    expect(detectFormat('classic.mobi')).toBe('mobi')
    expect(detectFormat('weird.unknown')).toBe('text')
  })

  it('reports the implemented formats as supported', () => {
    expect(isFormatSupported('epub')).toBe(true)
    expect(isFormatSupported('text')).toBe(true)
    expect(isFormatSupported('mobi')).toBe(true)
    expect(isFormatSupported('azw3')).toBe(true)
    expect(isFormatSupported('pdf')).toBe(true)
  })

  it('throws UnsupportedFormatError for unregistered formats', () => {
    expect(() => createEngine('xps' as unknown as Parameters<typeof createEngine>[0])).toThrow(
      UnsupportedFormatError,
    )
  })

  it('creates engines matching the requested format', () => {
    expect(createEngine('epub').format).toBe('epub')
    expect(createEngine('mobi').format).toBe('mobi')
    expect(createEngine('azw3').format).toBe('azw3')
    expect(createEngine('pdf').format).toBe('pdf')
  })
})
