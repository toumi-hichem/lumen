import { getDb } from './db'
import type { ReadingProgress } from '@/domain/models'

/**
 * Reading progress is keyed by bookId (one record per book), so it uses a
 * focused interface rather than the generic Repository.
 */
export const progressRepository = {
  async get(bookId: string): Promise<ReadingProgress | null> {
    const db = await getDb()
    return (await db.get('progress', bookId)) ?? null
  },

  async save(progress: ReadingProgress): Promise<ReadingProgress> {
    const db = await getDb()
    await db.put('progress', progress)
    return progress
  },

  async delete(bookId: string): Promise<void> {
    const db = await getDb()
    await db.delete('progress', bookId)
  },
}
