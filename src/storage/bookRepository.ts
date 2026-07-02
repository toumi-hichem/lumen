import { getDb } from './db'
import { fileStore } from './fileStore'
import type { Repository } from './repository'
import type { Book } from '@/domain/models'

export const bookRepository: Repository<Book> & {
  findRecent(limit: number): Promise<Book[]>
} = {
  async findAll(): Promise<Book[]> {
    const db = await getDb()
    const books = await db.getAllFromIndex('books', 'by-addedAt')
    // by-addedAt is ascending; newest first for the library view.
    return books.reverse()
  },

  async findById(id: string): Promise<Book | null> {
    const db = await getDb()
    return (await db.get('books', id)) ?? null
  },

  async save(book: Book): Promise<Book> {
    const db = await getDb()
    await db.put('books', book)
    return book
  },

  /**
   * Deletes the book, its file blob, and all related rows: bookmarks,
   * highlights, progress, reading sessions and per-book settings.
   */
  async delete(id: string): Promise<void> {
    const db = await getDb()
    const book = await db.get('books', id)
    if (book) await fileStore.delete(book.fileKey)

    const tx = db.transaction(
      ['books', 'bookmarks', 'highlights', 'progress', 'sessions', 'bookSettings'],
      'readwrite',
    )
    await tx.objectStore('books').delete(id)
    await tx.objectStore('progress').delete(id)
    await tx.objectStore('bookSettings').delete(id)

    const bookmarkKeys = await tx
      .objectStore('bookmarks')
      .index('by-bookId')
      .getAllKeys(id)
    await Promise.all(
      bookmarkKeys.map((key) => tx.objectStore('bookmarks').delete(key)),
    )

    const highlightKeys = await tx
      .objectStore('highlights')
      .index('by-bookId')
      .getAllKeys(id)
    await Promise.all(
      highlightKeys.map((key) => tx.objectStore('highlights').delete(key)),
    )

    const sessionKeys = await tx
      .objectStore('sessions')
      .index('by-bookId')
      .getAllKeys(id)
    await Promise.all(
      sessionKeys.map((key) => tx.objectStore('sessions').delete(key)),
    )

    await tx.done
  },

  async findRecent(limit: number): Promise<Book[]> {
    const all = await this.findAll()
    return all
      .filter((b) => b.lastOpenedAt)
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, limit)
  },
}
