import { getDb } from './db'
import type { Repository } from './repository'
import type { Collection } from '@/domain/models'

export const collectionRepository: Repository<Collection> = {
  async findAll(): Promise<Collection[]> {
    const db = await getDb()
    const all = await db.getAll('collections')
    return all.sort((a, b) => a.createdAt - b.createdAt)
  },

  async findById(id: string): Promise<Collection | null> {
    const db = await getDb()
    return (await db.get('collections', id)) ?? null
  },

  async save(collection: Collection): Promise<Collection> {
    const db = await getDb()
    await db.put('collections', collection)
    return collection
  },

  /** Deletes the collection and strips its id from every book that had it. */
  async delete(id: string): Promise<void> {
    const db = await getDb()
    const tx = db.transaction(['collections', 'books'], 'readwrite')
    await tx.objectStore('collections').delete(id)

    const books = await tx.objectStore('books').getAll()
    await Promise.all(
      books
        .filter((book) => book.collectionIds?.includes(id))
        .map((book) =>
          tx.objectStore('books').put({
            ...book,
            collectionIds: (book.collectionIds ?? []).filter((c) => c !== id),
          }),
        ),
    )

    await tx.done
  },
}
