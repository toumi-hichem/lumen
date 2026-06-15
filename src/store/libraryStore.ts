import { create } from 'zustand'
import type { Book, BookStatus, Collection } from '@/domain/models'
import { createId } from '@/lib/id'
import { bookRepository } from '@/storage/bookRepository'
import { collectionRepository } from '@/storage/collectionRepository'
import { importBook } from '@/services/importBook'

interface LibraryState {
  books: Book[]
  collections: Collection[]
  loading: boolean
  importing: boolean
  error: string | null
  load: () => Promise<void>
  importFiles: (files: FileList | File[]) => Promise<void>
  remove: (id: string) => Promise<void>
  markOpened: (id: string) => Promise<void>
  setStatus: (id: string, status: BookStatus) => Promise<void>
  createCollection: (name: string) => Promise<void>
  toggleBookInCollection: (bookId: string, collectionId: string) => Promise<void>
  clearError: () => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  collections: [],
  loading: false,
  importing: false,
  error: null,

  load: async () => {
    set({ loading: true })
    const [books, collections] = await Promise.all([
      bookRepository.findAll(),
      collectionRepository.findAll(),
    ])
    set({ books, collections, loading: false })
  },

  importFiles: async (files) => {
    set({ importing: true, error: null })
    const list = Array.from(files)
    const errors: string[] = []
    for (const file of list) {
      const result = await importBook(file)
      if (!result.ok) errors.push(result.error)
    }
    await get().load()
    set({
      importing: false,
      error: errors.length ? errors.join('\n') : null,
    })
  },

  remove: async (id) => {
    await bookRepository.delete(id)
    set({ books: get().books.filter((b) => b.id !== id) })
  },

  markOpened: async (id) => {
    const book = get().books.find((b) => b.id === id)
    if (!book) return
    const updated: Book = { ...book, lastOpenedAt: Date.now() }
    await bookRepository.save(updated)
    set({ books: get().books.map((b) => (b.id === id ? updated : b)) })
  },

  setStatus: async (id, status) => {
    const book = get().books.find((b) => b.id === id)
    if (!book) return
    const updated: Book = { ...book, status }
    await bookRepository.save(updated)
    set({ books: get().books.map((b) => (b.id === id ? updated : b)) })
  },

  createCollection: async (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const collection: Collection = {
      id: createId('col'),
      name: trimmed,
      createdAt: Date.now(),
    }
    await collectionRepository.save(collection)
    set({ collections: [...get().collections, collection] })
  },

  toggleBookInCollection: async (bookId, collectionId) => {
    const book = get().books.find((b) => b.id === bookId)
    if (!book) return
    const current = book.collectionIds ?? []
    const next = current.includes(collectionId)
      ? current.filter((c) => c !== collectionId)
      : [...current, collectionId]
    const updated: Book = { ...book, collectionIds: next }
    await bookRepository.save(updated)
    set({ books: get().books.map((b) => (b.id === bookId ? updated : b)) })
  },

  clearError: () => set({ error: null }),
}))
