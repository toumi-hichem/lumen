import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { getDb } from '@/storage/db'
import { getErrorMessage } from '@/lib/result'
import type {
  Book,
  BookSettings,
  Bookmark,
  Collection,
  Highlight,
  ReadingProgress,
  ReadingSession,
} from '@/domain/models'

interface BackupManifest {
  version: number
  exportedAt: number
  books: Book[]
  bookmarks: Bookmark[]
  highlights: Highlight[]
  progress: ReadingProgress[]
  collections: Collection[]
  bookSettings: BookSettings[]
  sessions: ReadingSession[]
  /** Map of book fileKey -> archive entry path. */
  files: Record<string, string>
}

const MANIFEST = 'manifest.json'

/**
 * Export the entire library (metadata, annotations, progress, collections and
 * raw book files) as a single .zip Blob. The same archive restores everything
 * via importBackup, which doubles as a manual/cloud-agnostic sync mechanism.
 */
export async function exportBackup(): Promise<Blob> {
  const db = await getDb()
  const [books, bookmarks, highlights, progress, collections, bookSettings, sessions] =
    await Promise.all([
      db.getAll('books'),
      db.getAll('bookmarks'),
      db.getAll('highlights'),
      db.getAll('progress'),
      db.getAll('collections'),
      db.getAll('bookSettings'),
      db.getAll('sessions'),
    ])

  const entries: Record<string, Uint8Array> = {}
  const files: Record<string, string> = {}
  for (const book of books) {
    const record = await db.get('files', book.fileKey)
    if (!record) continue
    const path = `files/${book.fileKey}.bin`
    entries[path] = await blobToBytes(record.blob)
    files[book.fileKey] = path
  }

  const manifest: BackupManifest = {
    version: 1,
    exportedAt: Date.now(),
    books,
    bookmarks,
    highlights,
    progress,
    collections,
    bookSettings,
    sessions,
    files,
  }
  entries[MANIFEST] = strToU8(JSON.stringify(manifest))

  const zipped = zipSync(entries, { level: 6 })
  return new Blob([zipped], { type: 'application/zip' })
}

export interface ImportResult {
  books: number
  highlights: number
}

/** Restore a library from a backup archive (merges into existing data). */
export async function importBackup(data: ArrayBuffer): Promise<ImportResult> {
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(new Uint8Array(data))
  } catch (error) {
    throw new Error(`Not a valid backup: ${getErrorMessage(error)}`, {
      cause: error,
    })
  }
  const manifestBytes = unzipped[MANIFEST]
  if (!manifestBytes) throw new Error('Backup is missing its manifest')
  const manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest

  const db = await getDb()
  // Restore file blobs first so books reference valid keys.
  for (const [fileKey, path] of Object.entries(manifest.files)) {
    const bytes = unzipped[path]
    if (bytes) {
      await db.put('files', { key: fileKey, blob: new Blob([bytes.slice()]) })
    }
  }

  const putAll = async <T>(store: Parameters<typeof db.put>[0], rows: T[]) => {
    for (const row of rows) await db.put(store, row as never)
  }
  await putAll('books', manifest.books)
  await putAll('bookmarks', manifest.bookmarks)
  await putAll('highlights', manifest.highlights)
  await putAll('progress', manifest.progress)
  await putAll('collections', manifest.collections ?? [])
  await putAll('bookSettings', manifest.bookSettings ?? [])
  await putAll('sessions', manifest.sessions ?? [])

  return { books: manifest.books.length, highlights: manifest.highlights.length }
}

/** Read a Blob to bytes, falling back to FileReader where arrayBuffer is absent. */
async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

/** Trigger a download of a Blob (web + WebView). */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
