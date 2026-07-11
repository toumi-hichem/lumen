import type { Book } from '@/domain/models'
import { bookRepository } from '@/storage/bookRepository'
import { fileStore } from '@/storage/fileStore'

/**
 * Total word count for a book. Computed on first request (parses the stored
 * file) and cached on the Book record, so subsequent lookups are instant.
 * Returns null when the format has no cheap text extraction (PDF) or the
 * file is missing.
 */
export async function getWordCount(book: Book): Promise<number | null> {
  if (book.wordCount != null) return book.wordCount
  const blob = await fileStore.get(book.fileKey)
  if (!blob) return null
  const count = await countWords(book, blob)
  if (count == null) return null
  // Re-read before persisting so a stale `book` doesn't clobber newer fields.
  const fresh = await bookRepository.findById(book.id)
  if (fresh) await bookRepository.save({ ...fresh, wordCount: count })
  return count
}

async function countWords(book: Book, blob: Blob): Promise<number | null> {
  if (book.format === 'text') {
    return countIn(await blob.text())
  }
  if (book.format === 'epub' || book.format === 'mobi' || book.format === 'azw3') {
    const { makeBook } = await import('foliate-js/view.js')
    const parsed = await makeBook(new File([blob], `book.${book.format}`))
    try {
      let total = 0
      for (const section of parsed.sections ?? []) {
        if (!section.createDocument) continue
        const doc = await section.createDocument()
        total += countIn(doc.body?.textContent ?? '')
      }
      return total
    } finally {
      parsed.destroy?.()
    }
  }
  // PDF has no cheap full-text walk here; the details page shows "—".
  return null
}

function countIn(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}
