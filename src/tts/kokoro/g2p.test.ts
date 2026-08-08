import { describe, expect, it } from 'vitest'
import { createEnglishG2P, getWordPhonemes, type LexiconDict } from './g2p'

// A tiny fixture standing in for Misaki's real ~183k-entry us_gold/us_silver
// dictionaries (see kokoro-lexicon fetch script). Values are taken verbatim
// from the real dictionaries so the stemming assertions stay meaningful.
const GOLD: LexiconDict = {
  hello: 'həlˈO',
  world: 'wˈɜɹld',
  cat: 'kˈæt',
  dog: 'dˈɔɡ',
  wait: 'wˈAt',
  walk: 'wˈɔk',
  play: 'plˈA',
  the: 'ði',
  book: 'bˈʊk',
  read: { DEFAULT: 'ɹˈid', ADJ: 'ɹˈɛd', VBD: 'ɹˈɛd', VBN: 'ɹˈɛd', VBP: 'ɹˈɛd' },
  one: 'wˈʌn',
  two: 'tˈu',
  twenty: 'twˈɛnti',
  hundred: 'hˈʌndɹəd',
  first: 'fˈɜɹst',
}
const SILVER: LexiconDict = {}

describe('getWordPhonemes', () => {
  it('resolves a direct dictionary hit', () => {
    expect(getWordPhonemes('hello', GOLD, SILVER)).toBe('həlˈO')
  })

  it('is case-insensitive for ordinary words', () => {
    expect(getWordPhonemes('Hello', GOLD, SILVER)).toBe('həlˈO')
  })

  it('resolves a heteronym to its DEFAULT pronunciation', () => {
    expect(getWordPhonemes('read', GOLD, SILVER)).toBe('ɹˈid')
  })

  it('stems a regular plural (-s)', () => {
    expect(getWordPhonemes('books', GOLD, SILVER)).toBe('bˈʊks')
  })

  it('stems a past tense (-ed) with a /t/ suffix after a voiceless stop', () => {
    expect(getWordPhonemes('walked', GOLD, SILVER)).toBe('wˈɔkt')
  })

  it('stems a past tense (-ed) with the flap rule after a US_TAUS phoneme', () => {
    // "wait" ends in /At/, so -ed flaps: wˈAt -> wˈAɾᵻd
    expect(getWordPhonemes('waited', GOLD, SILVER)).toBe('wˈAɾᵻd')
  })

  it('stems a gerund (-ing), dropping the silent e', () => {
    expect(getWordPhonemes('playing', GOLD, SILVER)).toBe('plˈAɪŋ')
  })

  it('returns null for an out-of-dictionary word instead of guessing', () => {
    expect(getWordPhonemes('zzyzx', GOLD, SILVER)).toBeNull()
  })
})

describe('createEnglishG2P.phonemize', () => {
  const g2p = createEnglishG2P(GOLD, SILVER)

  it('joins known words with spaces', () => {
    expect(g2p.phonemize('hello world')).toBe('həlˈO wˈɜɹld')
  })

  it('keeps punctuation attached without an extra preceding space', () => {
    expect(g2p.phonemize('hello, world.')).toBe('həlˈO, wˈɜɹld.')
  })

  it('drops an out-of-dictionary word silently rather than mispronouncing it', () => {
    // Matches Misaki's own documented fallback=None behavior: the OOD token
    // contributes no phonemes, the sentence around it is unaffected.
    expect(g2p.phonemize('the zzyzx cat')).toBe('ði kˈæt')
  })

  it('reads a cardinal number by spelling it out', () => {
    expect(g2p.phonemize('one hundred')).toBe('wˈʌn hˈʌndɹəd')
  })

  it('reads an ordinal number using the ordinal form of its last word', () => {
    expect(g2p.phonemize('21st')).toBe('twˈɛnti fˈɜɹst')
  })
})
