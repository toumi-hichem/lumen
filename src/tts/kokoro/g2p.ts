/**
 * English grapheme-to-phoneme (G2P), ported from Misaki's dictionary lookup
 * and morphological stemming (github.com/hexgrad/misaki, Apache-2.0,
 * `misaki/en.py`'s `Lexicon` class). Misaki's own primary path here is a
 * ~183k-entry curated dictionary (`us_gold`/`us_silver`) with eSpeak-NG
 * (GPL-3.0) as a fallback for out-of-dictionary (OOD) words only — rare
 * proper nouns and invented words, not normal prose. We port the dictionary
 * and stemming path and, matching Misaki's own documented behavior when no
 * eSpeak fallback is configured, drop an OOD word's phonemes silently rather
 * than mispronounce or error.
 *
 * Not ported: spaCy-based POS tagging (heteronym entries resolve to their
 * "DEFAULT" pronunciation instead of being disambiguated by context),
 * acronym/NNP letter-spelling, and Misaki's fuller currency/date handling
 * (a from-scratch cardinal/ordinal number reader is included here instead,
 * since numbers are common in book prose).
 */

export type LexiconEntry = string | Record<string, string | null>
export type LexiconDict = Record<string, LexiconEntry>

/** Stem-final phonemes after which American English flaps a following /t/ or /d/. */
const US_FLAP_CONTEXT = new Set('AIOWYiuæɑəɛɪɹʊʌ'.split(''))

function isKnownWord(word: string, gold: LexiconDict, silver: LexiconDict): boolean {
  if (word in gold || word in silver) return true
  if (!/^[A-Za-z]+$/.test(word)) return false
  return word.length === 1
}

function resolveEntry(entry: LexiconEntry): string | null {
  if (typeof entry === 'string') return entry
  return entry.DEFAULT ?? Object.values(entry).find((v) => v != null) ?? null
}

function lookupWord(word: string, gold: LexiconDict, silver: LexiconDict): string | null {
  const entry = gold[word] ?? silver[word]
  return entry === undefined ? null : resolveEntry(entry)
}

function suffixS(stem: string): string | null {
  if (!stem) return null
  const last = stem[stem.length - 1]
  if ('ptkfθ'.includes(last)) return stem + 's'
  if ('szʃʒʧʤ'.includes(last)) return stem + 'ᵻz'
  return stem + 'z'
}

function stemS(word: string, gold: LexiconDict, silver: LexiconDict): string | null {
  if (word.length < 3 || !word.endsWith('s')) return null
  let stem: string | null = null
  if (!word.endsWith('ss') && isKnownWord(word.slice(0, -1), gold, silver)) {
    stem = word.slice(0, -1)
  } else if (
    (word.endsWith("'s") || (word.length > 4 && word.endsWith('es') && !word.endsWith('ies'))) &&
    isKnownWord(word.slice(0, -2), gold, silver)
  ) {
    stem = word.slice(0, -2)
  } else if (word.length > 4 && word.endsWith('ies') && isKnownWord(word.slice(0, -3) + 'y', gold, silver)) {
    stem = word.slice(0, -3) + 'y'
  }
  if (stem === null) return null
  const resolved = lookupWord(stem, gold, silver)
  return resolved === null ? null : suffixS(resolved)
}

function suffixEd(stem: string): string | null {
  if (!stem) return null
  const last = stem[stem.length - 1]
  if ('pkfθʃsʧ'.includes(last)) return stem + 't'
  if (last === 'd') return stem + 'ᵻd'
  if (last !== 't') return stem + 'd'
  if (stem.length < 2) return stem + 'ɪd'
  if (US_FLAP_CONTEXT.has(stem[stem.length - 2])) return stem.slice(0, -1) + 'ɾᵻd'
  return stem + 'ᵻd'
}

function stemEd(word: string, gold: LexiconDict, silver: LexiconDict): string | null {
  if (word.length < 4 || !word.endsWith('d')) return null
  let stem: string | null = null
  if (!word.endsWith('dd') && isKnownWord(word.slice(0, -1), gold, silver)) {
    stem = word.slice(0, -1)
  } else if (
    word.length > 4 &&
    word.endsWith('ed') &&
    !word.endsWith('eed') &&
    isKnownWord(word.slice(0, -2), gold, silver)
  ) {
    stem = word.slice(0, -2)
  }
  if (stem === null) return null
  const resolved = lookupWord(stem, gold, silver)
  return resolved === null ? null : suffixEd(resolved)
}

function suffixIng(stem: string): string | null {
  if (!stem) return null
  const last = stem[stem.length - 1]
  if (stem.length > 1 && last === 't' && US_FLAP_CONTEXT.has(stem[stem.length - 2])) {
    return stem.slice(0, -1) + 'ɾɪŋ'
  }
  return stem + 'ɪŋ'
}

const DOUBLED_CONSONANT_ING = /([bcdgklmnprstvxz])\1ing$|cking$/

function stemIng(word: string, gold: LexiconDict, silver: LexiconDict): string | null {
  if (word.length < 5 || !word.endsWith('ing')) return null
  let stem: string | null = null
  if (word.length > 5 && isKnownWord(word.slice(0, -3), gold, silver)) {
    stem = word.slice(0, -3)
  } else if (isKnownWord(word.slice(0, -3) + 'e', gold, silver)) {
    stem = word.slice(0, -3) + 'e'
  } else if (word.length > 5 && DOUBLED_CONSONANT_ING.test(word) && isKnownWord(word.slice(0, -4), gold, silver)) {
    stem = word.slice(0, -4)
  }
  if (stem === null) return null
  const resolved = lookupWord(stem, gold, silver)
  return resolved === null ? null : suffixIng(resolved)
}

/** Dictionary lookup plus `-s`/`-ed`/`-ing` stemming. Null means out-of-dictionary. */
export function getWordPhonemes(
  word: string,
  gold: LexiconDict,
  silver: LexiconDict,
): string | null {
  const lower = word.toLowerCase()
  let w = word
  if (
    word.length > 1 &&
    /^[A-Za-z']+$/.test(word) &&
    word !== lower &&
    !(word in gold) &&
    !(word in silver) &&
    (lower in gold ||
      lower in silver ||
      stemS(lower, gold, silver) !== null ||
      stemEd(lower, gold, silver) !== null ||
      stemIng(lower, gold, silver) !== null)
  ) {
    w = lower
  }

  if (isKnownWord(w, gold, silver)) {
    const direct = lookupWord(w, gold, silver)
    if (direct !== null) return direct
  }
  if (w.endsWith("s'") && isKnownWord(w.slice(0, -2) + "'s", gold, silver)) {
    return lookupWord(w.slice(0, -2) + "'s", gold, silver)
  }
  if (w.endsWith("'") && isKnownWord(w.slice(0, -1), gold, silver)) {
    return lookupWord(w.slice(0, -1), gold, silver)
  }
  return stemS(w, gold, silver) ?? stemEd(w, gold, silver) ?? stemIng(w, gold, silver)
}

// --- number reading (chapter numbers, dates, page numbers in book prose) ---

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const ORDINAL_WORD: Record<string, string> = {
  zero: 'zeroth', one: 'first', two: 'second', three: 'third', four: 'fourth', five: 'fifth',
  six: 'sixth', seven: 'seventh', eight: 'eighth', nine: 'ninth', ten: 'tenth', eleven: 'eleventh',
  twelve: 'twelfth', thirteen: 'thirteenth', fourteen: 'fourteenth', fifteen: 'fifteenth',
  sixteen: 'sixteenth', seventeen: 'seventeenth', eighteen: 'eighteenth', nineteen: 'nineteenth',
  twenty: 'twentieth', thirty: 'thirtieth', forty: 'fortieth', fifty: 'fiftieth', sixty: 'sixtieth',
  seventy: 'seventieth', eighty: 'eightieth', ninety: 'ninetieth', hundred: 'hundredth',
  thousand: 'thousandth', million: 'millionth', billion: 'billionth',
}
const SCALES: [number, string][] = [
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1_000, 'thousand'],
]

function cardinalWords(n: number): string[] {
  if (n < 20) return [ONES[n]]
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const rem = n % 10
    return rem ? [TENS[tens], ONES[rem]] : [TENS[tens]]
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100)
    const rem = n % 100
    const words = [ONES[hundreds], 'hundred']
    if (rem) words.push(...cardinalWords(rem))
    return words
  }
  for (const [value, name] of SCALES) {
    if (n >= value) {
      const count = Math.floor(n / value)
      const rem = n % value
      const words = [...cardinalWords(count), name]
      if (rem) words.push(...cardinalWords(rem))
      return words
    }
  }
  return [String(n)]
}

function ordinalWords(n: number): string[] {
  const words = cardinalWords(n)
  const last = words.length - 1
  words[last] = ORDINAL_WORD[words[last]] ?? `${words[last]}th`
  return words
}

const NUMBER_RE = /^(\d[\d,]*)(st|nd|rd|th)?$/i

function phonemizeNumber(raw: string, gold: LexiconDict, silver: LexiconDict): string | null {
  const match = NUMBER_RE.exec(raw)
  if (!match) return null
  const digits = match[1].replace(/,/g, '')
  const n = Number(digits)
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) return null
  const words = match[2] ? ordinalWords(n) : cardinalWords(n)
  const phonemes = words
    .map((w) => getWordPhonemes(w, gold, silver))
    .filter((p): p is string => p !== null)
  return phonemes.length ? phonemes.join(' ') : null
}

// --- top-level phonemizer ---

const TOKEN_RE = /\d[\d,]*(?:\.\d+)?(?:st|nd|rd|th)?\b|[A-Za-z']+|\s+|[^\sA-Za-z0-9]/g

export interface EnglishG2P {
  /** Text to a phoneme string in Misaki's alphabet, ready for ../kokoro/vocab.ts. */
  phonemize(text: string): string
}

export function createEnglishG2P(gold: LexiconDict, silver: LexiconDict): EnglishG2P {
  return {
    phonemize(text: string): string {
      const tokens = text.match(TOKEN_RE) ?? []
      let out = ''
      let pendingSpace = false
      for (const raw of tokens) {
        if (/^\s+$/.test(raw)) {
          pendingSpace = out.length > 0
          continue
        }
        if (/^[A-Za-z']+$/.test(raw)) {
          const ps = getWordPhonemes(raw, gold, silver)
          if (ps) {
            if (pendingSpace) out += ' '
            out += ps
            pendingSpace = true
          }
          continue
        }
        if (/^\d/.test(raw)) {
          const ps = phonemizeNumber(raw, gold, silver)
          if (ps) {
            if (pendingSpace) out += ' '
            out += ps
            pendingSpace = true
          }
          continue
        }
        // Punctuation: passed through verbatim, directly attached (no space
        // inserted before it — a following whitespace token, if any, still
        // adds the space ahead of the next word). Unmapped characters are
        // silently dropped later, when phonemesToTokenIds() looks them up.
        out += raw
        pendingSpace = false
      }
      return out
    },
  }
}
