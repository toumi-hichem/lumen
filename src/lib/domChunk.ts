/**
 * Segment a rendered DOM subtree into speakable sentence chunks while keeping
 * each chunk's start/end DOM positions (text node + offset). Engines turn those
 * positions into an anchor: an EPUB CFI range, or a `text-range:` offset
 * locator. This is the linchpin of read-along highlighting and tap-to-start.
 *
 * The helper is pure (operates on any Document/Element) so it can be unit
 * tested against fixture HTML without a live reader iframe.
 */

export interface DomChunk {
  text: string
  startNode: Text
  startOffset: number
  endNode: Text
  endOffset: number
}

interface NodeEntry {
  node: Text
  /** Global offset of this node's first character across all text nodes. */
  start: number
  length: number
}

const TERMINATOR = /[.!?…。！？]/

/** Collect text nodes under a root with their global offset ranges. */
export function collectTextNodes(root: Node): NodeEntry[] {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const entries: NodeEntry[] = []
  let total = 0
  let node = walker.nextNode()
  while (node) {
    const length = node.textContent?.length ?? 0
    entries.push({ node: node as Text, start: total, length })
    total += length
    node = walker.nextNode()
  }
  return entries
}

/** Global character offset of a (node, offset) position within the root. */
export function locationToOffset(
  entries: NodeEntry[],
  node: Node,
  offset: number,
): number {
  const entry = entries.find((e) => e.node === node)
  if (entry) return entry.start + offset
  // If the node isn't a tracked text node, fall back to the nearest preceding.
  return 0
}

/** Map a global offset back to a (node, offset) DOM position. */
export function offsetToLocation(
  entries: NodeEntry[],
  pos: number,
): { node: Text; offset: number } | null {
  if (!entries.length) return null
  for (const entry of entries) {
    if (pos >= entry.start && pos < entry.start + entry.length) {
      return { node: entry.node, offset: pos - entry.start }
    }
  }
  // Clamp to the end of the last node.
  const last = entries[entries.length - 1]
  return { node: last.node, offset: last.length }
}

export function domToChunks(root: Node, maxChars = 240): DomChunk[] {
  const entries = collectTextNodes(root)
  if (!entries.length) return []
  const full = entries.map((e) => e.node.textContent ?? '').join('')

  // 1) Split the raw text into sentence ranges covering the whole string.
  const sentences: Array<[number, number]> = []
  let i = 0
  while (i < full.length) {
    let j = i
    while (j < full.length && !TERMINATOR.test(full[j])) j++
    while (j < full.length && TERMINATOR.test(full[j])) j++
    while (j < full.length && /\s/.test(full[j])) j++
    sentences.push([i, j])
    i = j
  }

  // 2) Pack short sentences together up to maxChars (by trimmed length).
  const packed: Array<[number, number]> = []
  let curStart = -1
  let curEnd = -1
  for (const [s, e] of sentences) {
    if (curStart === -1) {
      curStart = s
      curEnd = e
      continue
    }
    const merged = full.slice(curStart, e).replace(/\s+/g, ' ').trim()
    if (merged.length > maxChars) {
      packed.push([curStart, curEnd])
      curStart = s
      curEnd = e
    } else {
      curEnd = e
    }
  }
  if (curStart !== -1) packed.push([curStart, curEnd])

  // 3) Trim whitespace at range edges and map to DOM positions.
  const chunks: DomChunk[] = []
  for (const [rawStart, rawEnd] of packed) {
    let s = rawStart
    let e = rawEnd
    while (s < e && /\s/.test(full[s])) s++
    while (e > s && /\s/.test(full[e - 1])) e--
    const text = full.slice(s, e).replace(/\s+/g, ' ').trim()
    if (!text) continue
    const startLoc = offsetToLocation(entries, s)
    const endLoc = offsetToLocation(entries, e - 1)
    if (!startLoc || !endLoc) continue
    chunks.push({
      text,
      startNode: startLoc.node,
      startOffset: startLoc.offset,
      endNode: endLoc.node,
      // endOffset is exclusive; e-1 located the last char, so +1.
      endOffset: endLoc.offset + 1,
    })
  }
  return chunks
}
