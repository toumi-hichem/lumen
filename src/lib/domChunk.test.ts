import { describe, expect, it } from 'vitest'
import {
  collectTextNodes,
  domToChunks,
  locationToOffset,
  offsetToLocation,
} from './domChunk'

function makeDoc(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('domToChunks', () => {
  it('returns no chunks for empty content', () => {
    expect(domToChunks(makeDoc(''))).toEqual([])
    expect(domToChunks(makeDoc('<p>   </p>'))).toEqual([])
  })

  it('splits a paragraph into sentences with DOM anchors', () => {
    const root = makeDoc('<p>Hello world. How are you? Fine.</p>')
    // Small maxChars keeps each sentence as its own chunk.
    const chunks = domToChunks(root, 5)
    expect(chunks.map((c) => c.text)).toEqual([
      'Hello world.',
      'How are you?',
      'Fine.',
    ])
    // Anchors point at real text nodes with valid offsets.
    for (const c of chunks) {
      expect(c.startNode.nodeType).toBe(Node.TEXT_NODE)
      expect(c.endOffset).toBeGreaterThan(c.startOffset)
    }
  })

  it('packs short sentences up to maxChars', () => {
    const root = makeDoc('<p>A. B. C. D.</p>')
    const chunks = domToChunks(root, 240)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('A. B. C. D.')
  })

  it('spans sentence boundaries across inline elements', () => {
    const root = makeDoc('<p>See <em>this</em> word. Next one.</p>')
    const chunks = domToChunks(root, 10)
    expect(chunks[0].text).toBe('See this word.')
    expect(chunks[1].text).toBe('Next one.')
  })

  it('never merges chunks across block elements', () => {
    // Adjacent blocks with no whitespace between tags: without a forced
    // break the heading would glue onto the paragraph ("IIIThe next day").
    const root = makeDoc('<h1>III</h1><p>The next day was cold. Very cold.</p>')
    const chunks = domToChunks(root, 240)
    expect(chunks.map((c) => c.text)).toEqual([
      'III',
      'The next day was cold. Very cold.',
    ])
  })

  it('keeps one-word headings and short paragraphs as own chunks', () => {
    const root = makeDoc('<h2>Prologue</h2><p>Rain.</p><p>It fell for days.</p>')
    const chunks = domToChunks(root, 240)
    expect(chunks.map((c) => c.text)).toEqual([
      'Prologue',
      'Rain.',
      'It fell for days.',
    ])
  })

  it('still packs sentences within the same block', () => {
    const root = makeDoc('<p>A. B.</p><p>C. D.</p>')
    const chunks = domToChunks(root, 240)
    expect(chunks.map((c) => c.text)).toEqual(['A. B.', 'C. D.'])
  })

  it('handles whitespace-only nodes between blocks', () => {
    const root = makeDoc('<p>One.</p>\n  <p>Two.</p>')
    const chunks = domToChunks(root, 240)
    expect(chunks.map((c) => c.text)).toEqual(['One.', 'Two.'])
  })

  it('breaks at block elements in XHTML documents (lowercase tagName)', () => {
    // EPUB sections are XML documents: tagName keeps the source case there,
    // unlike HTML documents which uppercase it. Regression: block detection
    // matched only uppercase names, so real books never split at blocks.
    const doc = new DOMParser().parseFromString(
      '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
        '<section><h1>Chapter 1</h1>' +
        '<p>None of the keys worked. That was a problem.</p></section>' +
        '</body></html>',
      'application/xhtml+xml',
    )
    const chunks = domToChunks(doc.body, 240)
    expect(chunks.map((c) => c.text)).toEqual([
      'Chapter 1',
      'None of the keys worked. That was a problem.',
    ])
  })

  it('produces a range whose extracted text matches the chunk', () => {
    const root = makeDoc('<p>First sentence. Second sentence.</p>')
    document.body.appendChild(root)
    const [first] = domToChunks(root, 20)
    const range = document.createRange()
    range.setStart(first.startNode, first.startOffset)
    range.setEnd(first.endNode, first.endOffset)
    expect(range.toString()).toBe('First sentence.')
    root.remove()
  })
})

describe('offset mapping helpers', () => {
  it('round-trips node/offset through global offset', () => {
    const root = makeDoc('<p>abc<em>def</em>ghi</p>')
    const entries = collectTextNodes(root)
    const loc = offsetToLocation(entries, 4) // 'e' in def
    expect(loc?.node.textContent).toBe('def')
    expect(loc?.offset).toBe(1)
    const back = locationToOffset(entries, loc!.node, loc!.offset)
    expect(back).toBe(4)
  })
})
