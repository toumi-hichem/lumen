import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  Book,
  Bookmark,
  Highlight,
  ReadingProgress,
} from '@/domain/models'

const DB_NAME = 'lumen-reader'
const DB_VERSION = 1

/** Raw book file stored separately from metadata to keep queries light. */
export interface StoredFile {
  key: string
  blob: Blob
}

interface LumenDB extends DBSchema {
  books: {
    key: string
    value: Book
    indexes: { 'by-addedAt': number }
  }
  files: {
    key: string
    value: StoredFile
  }
  bookmarks: {
    key: string
    value: Bookmark
    indexes: { 'by-bookId': string }
  }
  highlights: {
    key: string
    value: Highlight
    indexes: { 'by-bookId': string }
  }
  progress: {
    key: string
    value: ReadingProgress
  }
}

let dbPromise: Promise<IDBPDatabase<LumenDB>> | null = null

/** Open (or reuse) the IndexedDB connection. Works on web and native WebViews. */
export function getDb(): Promise<IDBPDatabase<LumenDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LumenDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const books = db.createObjectStore('books', { keyPath: 'id' })
        books.createIndex('by-addedAt', 'addedAt')

        db.createObjectStore('files', { keyPath: 'key' })

        const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'id' })
        bookmarks.createIndex('by-bookId', 'bookId')

        const highlights = db.createObjectStore('highlights', { keyPath: 'id' })
        highlights.createIndex('by-bookId', 'bookId')

        db.createObjectStore('progress', { keyPath: 'bookId' })
      },
    })
  }
  return dbPromise
}

/** Reset the cached connection (used by tests with fake-indexeddb). */
export function resetDbForTests(): void {
  dbPromise = null
}
