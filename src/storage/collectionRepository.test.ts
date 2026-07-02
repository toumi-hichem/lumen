import { beforeEach, describe, expect, it } from 'vitest'
import { collectionRepository } from './collectionRepository'
import { bookRepository } from './bookRepository'
import { getDb } from './db'
import type { Book, Collection } from '@/domain/models'

function makeBook(id: string, collectionIds?: string[]): Book {
  return {
    id,
    title: `Book ${id}`,
    author: 'Tester',
    format: 'epub',
    fileKey: `file_${id}`,
    fileSize: 1024,
    addedAt: 1,
    ...(collectionIds ? { collectionIds } : {}),
  }
}

function makeCollection(id: string): Collection {
  return { id, name: `Shelf ${id}`, createdAt: 1 }
}

describe('collectionRepository', () => {
  beforeEach(async () => {
    const db = await getDb()
    await Promise.all([db.clear('collections'), db.clear('books')])
  })

  it('saves and lists collections ordered by createdAt', async () => {
    await collectionRepository.save({ id: 'b', name: 'B', createdAt: 2 })
    await collectionRepository.save({ id: 'a', name: 'A', createdAt: 1 })
    const all = await collectionRepository.findAll()
    expect(all.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('deletes a collection', async () => {
    await collectionRepository.save(makeCollection('c1'))
    await collectionRepository.delete('c1')
    expect(await collectionRepository.findById('c1')).toBeNull()
  })

  it('strips the deleted collection id from all books', async () => {
    await collectionRepository.save(makeCollection('c1'))
    await collectionRepository.save(makeCollection('c2'))
    await bookRepository.save(makeBook('in-both', ['c1', 'c2']))
    await bookRepository.save(makeBook('only-c1', ['c1']))
    await bookRepository.save(makeBook('unrelated', ['c2']))
    await bookRepository.save(makeBook('no-shelves'))

    await collectionRepository.delete('c1')

    expect((await bookRepository.findById('in-both'))?.collectionIds).toEqual([
      'c2',
    ])
    expect((await bookRepository.findById('only-c1'))?.collectionIds).toEqual([])
    expect((await bookRepository.findById('unrelated'))?.collectionIds).toEqual([
      'c2',
    ])
    expect(
      (await bookRepository.findById('no-shelves'))?.collectionIds,
    ).toBeUndefined()
  })
})
