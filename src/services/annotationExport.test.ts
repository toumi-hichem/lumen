import { describe, expect, it } from 'vitest'
import { highlightsToMarkdown } from './annotationExport'
import type { Book, Highlight } from '@/domain/models'

const book: Book = {
  id: 'b1',
  title: 'Test Book',
  author: 'Jane Doe',
  format: 'epub',
  fileKey: 'f1',
  fileSize: 1,
  addedAt: 1,
}

function hl(text: string, note?: string): Highlight {
  return {
    id: `h-${text}`,
    bookId: 'b1',
    cfiRange: 'cfi',
    text,
    color: 'yellow',
    note,
    createdAt: 1,
  }
}

describe('highlightsToMarkdown', () => {
  it('groups highlights under book headings with notes', () => {
    const md = highlightsToMarkdown([book], [hl('A quote', 'my note'), hl('Another')])
    expect(md).toContain('## Test Book')
    expect(md).toContain('*Jane Doe*')
    expect(md).toContain('> A quote')
    expect(md).toContain('Note: my note')
    expect(md).toContain('> Another')
  })

  it('omits books that have no highlights', () => {
    const other: Book = { ...book, id: 'b2', title: 'Empty Book' }
    const md = highlightsToMarkdown([book, other], [hl('Only one')])
    expect(md).not.toContain('Empty Book')
  })
})
