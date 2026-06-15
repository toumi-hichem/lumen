/**
 * Split prose into speakable chunks. TTS engines (especially neural ones like
 * Supertonic) work best on sentence-sized inputs: it bounds latency, enables
 * incremental playback, and gives natural prosody boundaries.
 *
 * The splitter is intentionally simple and language-tolerant: it breaks on
 * sentence-final punctuation followed by whitespace, then packs short
 * fragments up to `maxChars` so very short sentences don't cause choppy audio.
 */
export function chunkText(input: string, maxChars = 240): string[] {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  // Split after . ! ? … and common CJK terminators, keeping the punctuation.
  const sentences = normalized.match(/[^.!?…。！？]+[.!?…。！？]*\s*/g) ?? [
    normalized,
  ]

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
