import { describe, expect, it } from 'vitest'
import { chunkText } from './textChunk'

describe('chunkText', () => {
  it('returns an empty array for blank input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
  })

  it('splits on sentence boundaries', () => {
    const chunks = chunkText('Hello world. How are you? I am fine!')
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.join(' ')).toContain('Hello world.')
  })

  it('packs short sentences up to the max length', () => {
    const chunks = chunkText('A. B. C. D.', 240)
    // All short sentences fit into a single chunk.
    expect(chunks).toHaveLength(1)
  })

  it('never produces a chunk longer than maxChars (hard wrap)', () => {
    const long = 'word '.repeat(200).trim()
    const chunks = chunkText(long, 100)
    expect(chunks.every((c) => c.length <= 100)).toBe(true)
  })

  it('normalizes whitespace', () => {
    expect(chunkText('foo\n\n   bar')).toEqual(['foo bar'])
  })

  it('does not split abbreviations or decimals mid-sentence', () => {
    const chunks = chunkText('Dr. Smith weighed 3.14 kilograms of flour. Then he baked.', 30)
    expect(chunks[0]).toContain('Dr. Smith')
    // The abbreviation must not end a chunk on its own.
    expect(chunks.some((c) => /^Dr\.$/.test(c.trim()))).toBe(false)
  })
})
