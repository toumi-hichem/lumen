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
  const manifest = parseManifest(manifestBytes)

  const db = await getDb()
  // Restore file blobs first so books reference valid keys. Blobs are written
  // outside the row transaction: re-importing them is harmless, while rows
  // must land all-or-nothing.
  for (const [fileKey, path] of Object.entries(manifest.files)) {
    const bytes = unzipped[path]
    if (bytes) {
      await db.put('files', { key: fileKey, blob: new Blob([bytes.slice()]) })
    }
  }

  // Single transaction across every row store: a midway failure aborts the
  // whole restore instead of leaving a half-imported library.
  const tx = db.transaction(
    ['books', 'bookmarks', 'highlights', 'progress', 'collections', 'bookSettings', 'sessions'],
    'readwrite',
  )
  await Promise.all([
    ...manifest.books.map((row) => tx.objectStore('books').put(row)),
    ...manifest.bookmarks.map((row) => tx.objectStore('bookmarks').put(row)),
    ...manifest.highlights.map((row) => tx.objectStore('highlights').put(row)),
    ...manifest.progress.map((row) => tx.objectStore('progress').put(row)),
    ...(manifest.collections ?? []).map((row) =>
      tx.objectStore('collections').put(row),
    ),
    ...(manifest.bookSettings ?? []).map((row) =>
      tx.objectStore('bookSettings').put(row),
    ),
    ...(manifest.sessions ?? []).map((row) => tx.objectStore('sessions').put(row)),
  ])
  await tx.done

  return { books: manifest.books.length, highlights: manifest.highlights.length }
}

/** Parse and validate the manifest, rejecting corrupt or newer backups. */
function parseManifest(bytes: Uint8Array): BackupManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(bytes))
  } catch {
    throw new Error('Backup manifest is corrupted (not valid JSON)')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Backup manifest is invalid')
  }
  const manifest = parsed as Partial<BackupManifest>
  if (manifest.version !== 1) {
    throw new Error(
      `Unsupported backup version ${String(manifest.version)}. This backup may come from a newer version of the app.`,
    )
  }
  if (
    !Array.isArray(manifest.books) ||
    !Array.isArray(manifest.bookmarks) ||
    !Array.isArray(manifest.highlights) ||
    !Array.isArray(manifest.progress) ||
    typeof manifest.files !== 'object' ||
    manifest.files === null
  ) {
    throw new Error('Backup manifest is invalid or incomplete')
  }
  return manifest as BackupManifest
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
  // Revoking synchronously can cancel the download in some browsers; give the
  // save dialog / download manager time to grab the blob first.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
