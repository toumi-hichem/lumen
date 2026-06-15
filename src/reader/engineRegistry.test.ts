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

  it('reports EPUB and text as supported, MOBI as not yet', () => {
    expect(isFormatSupported('epub')).toBe(true)
    expect(isFormatSupported('text')).toBe(true)
    expect(isFormatSupported('mobi')).toBe(false)
  })

  it('throws UnsupportedFormatError for engines not yet implemented', () => {
    expect(() => createEngine('mobi')).toThrow(UnsupportedFormatError)
  })

  it('creates an EPUB engine for the epub format', () => {
    expect(createEngine('epub').format).toBe('epub')
  })
})
