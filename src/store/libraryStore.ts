import { create } from 'zustand'
import type { Book } from '@/domain/models'
import { bookRepository } from '@/storage/bookRepository'
import { importBook } from '@/services/importBook'

interface LibraryState {
  books: Book[]
  loading: boolean
  importing: boolean
  error: string | null
  load: () => Promise<void>
  importFiles: (files: FileList | File[]) => Promise<void>
  remove: (id: string) => Promise<void>
  markOpened: (id: string) => Promise<void>
  clearError: () => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  loading: false,
  importing: false,
  error: null,

  load: async () => {
    set({ loading: true })
    const books = await bookRepository.findAll()
    set({ books, loading: false })
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

  clearError: () => set({ error: null }),
}))
