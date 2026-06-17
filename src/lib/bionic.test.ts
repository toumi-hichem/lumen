import { describe, expect, it } from 'vitest'
import { bionicSegments, fixationLength } from './bionic'

describe('fixationLength', () => {
  it('bolds the whole of a single character', () => {
    expect(fixationLength(1)).toBe(1)
  })

  it('bolds one letter for short words (<=3)', () => {
    expect(fixationLength(2)).toBe(1)
    expect(fixationLength(3)).toBe(1)
  })

  it('bolds roughly half of longer words at default strength', () => {
    expect(fixationLength(8, 0.5)).toBe(4)
    expect(fixationLength(10, 0.5)).toBe(5)
  })

  it('never bolds the entire multi-letter word', () => {
    expect(fixationLength(4, 0.9)).toBeLessThan(4)
  })

  it('scales with strength', () => {
    expect(fixationLength(10, 0.3)).toBeLessThan(fixationLength(10, 0.7))
  })
})

describe('bionicSegments', () => {
  it('reconstructs the original text exactly', () => {
    const text = 'The quick brown fox.'
    const joined = bionicSegments(text)
      .map((s) => s.text)
      .join('')
    expect(joined).toBe(text)
  })

  it('preserves whitespace as plain segments', () => {
    const segs = bionicSegments('a  b')
    expect(segs.some((s) => s.text === '  ' && !s.bold)).toBe(true)
  })

  it('marks the leading characters of each word as bold', () => {
    const segs = bionicSegments('hello', 0.5)
    expect(segs[0]).toEqual({ text: 'hel', bold: true })
    expect(segs[1]).toEqual({ text: 'lo', bold: false })
  })

  it('handles empty input', () => {
    expect(bionicSegments('')).toEqual([])
  })
})
