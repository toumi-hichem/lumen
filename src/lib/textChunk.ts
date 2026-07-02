/**
 * Split prose into speakable chunks. TTS engines (especially neural ones like
 * Supertonic) work best on sentence-sized inputs: it bounds latency, enables
 * incremental playback, and gives natural prosody boundaries.
 *
 * Sentence boundaries come from Intl.Segmenter when available (it understands
 * abbreviations like "Dr.", decimals like "3.14" and quotes, which a naive
 * punctuation split gets wrong), with a punctuation-based fallback for
 * environments without it. Short sentences are then packed up to `maxChars`
 * so very short sentences don't cause choppy audio.
 */
export function chunkText(input: string, maxChars = 240): string[] {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const sentences = splitSentences(normalized)

  const chunks: string[] = []
  let buffer = ''
  for (const raw of sentences) {
    const sentence = raw.trim()
    if (!sentence) continue
    if (sentence.length >= maxChars) {
      if (buffer) {
        chunks.push(buffer)
        buffer = ''
      }
      // Hard-wrap an over-long sentence on word boundaries.
      chunks.push(...hardWrap(sentence, maxChars))
      continue
    }
    if ((buffer + ' ' + sentence).trim().length > maxChars) {
      chunks.push(buffer)
      buffer = sentence
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks
}

/**
 * Titles and abbreviations that end with a period but do not end a sentence.
 * ICU (Intl.Segmenter) splits after them when the next word is capitalized
 * ("Dr. Smith"), so segments ending in one are merged back with the next.
 */
const ABBREVIATION_END =
  /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Rev|Hon|St|Mt|Ft|Capt|Col|Gen|Lt|Sgt|Maj|Sr|Jr|vs|etc|approx|dept|est|Inc|Ltd|Co|Corp|No|Vol|Ch|Fig|pp?)|\b[A-Z])\.\s*$/

function splitSentences(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    const merged: string[] = []
    for (const { segment } of segmenter.segment(text)) {
      const prev = merged[merged.length - 1]
      if (prev !== undefined && ABBREVIATION_END.test(prev)) {
        merged[merged.length - 1] = prev + segment
      } else {
        merged.push(segment)
      }
    }
    return merged
  }
  // Fallback: split after . ! ? … and common CJK terminators, keeping the
  // punctuation. Over-splits abbreviations, but only runs where Segmenter is
  // missing.
  return text.match(/[^.!?…。！？]+[.!?…。！？]*\s*/g) ?? [text]
}

function hardWrap(sentence: string, maxChars: number): string[] {
  const words = sentence.split(' ')
  const out: string[] = []
  let line = ''
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars) {
      if (line) out.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) out.push(line)
  return out
}
