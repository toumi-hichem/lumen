/**
 * Bionic reading: bold the leading letters of each word to create fixation
 * points that guide the eye, an aid many ADHD and dyslexic readers find helps
 * focus. The pure helpers below are unit tested; `applyBionic` walks a rendered
 * DOM subtree and wraps prefixes in <b>.
 *
 * Wrapping splits text nodes but preserves character order, so the text
 * engine's character-offset anchoring (highlights, read-along) stays valid.
 */

/** Number of leading characters to bold for a word of the given length. */
export function fixationLength(wordLength: number, strength = 0.5): number {
  if (wordLength <= 1) return wordLength
  if (wordLength <= 3) return 1
  return Math.max(1, Math.min(wordLength - 1, Math.round(wordLength * strength)))
}

export interface BionicSegment {
  text: string
  bold: boolean
}

/**
 * Split text into bold/plain segments. Whitespace is preserved as plain
 * segments so reconstructing the segments yields the original text exactly.
 */
export function bionicSegments(text: string, strength = 0.5): BionicSegment[] {
  const out: BionicSegment[] = []
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue
    if (/^\s+$/.test(token)) {
      out.push({ text: token, bold: false })
      continue
    }
    const k = fixationLength(token.length, strength)
    out.push({ text: token.slice(0, k), bold: true })
    if (k < token.length) out.push({ text: token.slice(k), bold: false })
  }
  return out
}

const BIONIC_MARK = 'data-bionic'

/**
 * Wrap word prefixes in <b> across all text nodes under `root`. Idempotent:
 * skips nodes already inside a bionic <b>. Operates on the live DOM.
 */
export function applyBionic(root: HTMLElement, strength = 0.5): void {
  const doc = root.ownerDocument
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (parent?.hasAttribute(BIONIC_MARK)) return NodeFilter.FILTER_REJECT
      const tag = parent?.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const targets: Text[] = []
  let current = walker.nextNode()
  while (current) {
    targets.push(current as Text)
    current = walker.nextNode()
  }

  for (const textNode of targets) {
    const segments = bionicSegments(textNode.nodeValue ?? '', strength)
    if (segments.length === 0) continue
    const frag = doc.createDocumentFragment()
    for (const seg of segments) {
      if (seg.bold) {
        const b = doc.createElement('b')
        b.setAttribute(BIONIC_MARK, '')
        b.textContent = seg.text
        frag.appendChild(b)
      } else {
        frag.appendChild(doc.createTextNode(seg.text))
      }
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}
