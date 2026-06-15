// @vitest-environment node
// Backup logic uses Blob/idb/fflate but no DOM. jsdom + fake-indexeddb produce
// a cross-realm Blob clone that breaks blob reads; node env stores a real Blob.
import { beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from './backup'
import { getDb } from '@/storage/db'
import type { Book } from '@/domain/models'

const book: Book = {
  id: 'bk1',
  title: 'Backup Me',
  author: 'Tester',
  format: 'text',
  fileKey: 'fk1',
  fileSize: 4,
  addedAt: 1,
}

describe('backup export/import', () => {
  beforeEach(async () => {
    const db = await getDb()
    await Promise.all([
      db.clear('books'),
      db.clear('files'),
      db.clear('highlights'),
    ])
  })

  it('round-trips books and their file blobs', async () => {
    const db = await getDb()
    await db.put('books', book)
    await db.put('files', { key: 'fk1', blob: new Blob(['data']) })

    const archive = await exportBackup()
    expect(archive.size).toBeGreaterThan(0)

    // Wipe, then restore from the archive.
    await db.clear('books')
    await db.clear('files')
    const result = await importBackup(await archive.arrayBuffer())

    expect(result.books).toBe(1)
    expect(await db.get('books', 'bk1')).toMatchObject({ title: 'Backup Me' })
    const file = await db.get('files', 'fk1')
    expect(await file?.blob.text()).toBe('data')
  })

  it('rejects an archive without a manifest', async () => {
    await expect(importBackup(new ArrayBuffer(8))).rejects.toThrow()
  })
})
