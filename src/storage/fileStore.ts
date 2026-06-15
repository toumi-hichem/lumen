import { getDb } from './db'
import { createId } from '@/lib/id'

/**
 * Stores raw book file blobs keyed independently of metadata. Returning a key
 * (not the blob) keeps the books store small and fast to list.
 */
export const fileStore = {
  async put(blob: Blob): Promise<string> {
    const key = createId('file')
    const db = await getDb()
    await db.put('files', { key, blob })
    return key
  },

  async get(key: string): Promise<Blob | null> {
    const db = await getDb()
    const record = await db.get('files', key)
    return record?.blob ?? null
  },

  async delete(key: string): Promise<void> {
    const db = await getDb()
    await db.delete('files', key)
  },
}
