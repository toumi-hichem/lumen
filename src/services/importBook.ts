import ePub from 'epubjs'
import type { Book, BookFormat } from '@/domain/models'
import { createId } from '@/lib/id'
import { err, getErrorMessage, ok, type Result } from '@/lib/result'
import { detectFormat, isFormatSupported } from '@/reader/engineRegistry'
import { bookRepository } from '@/storage/bookRepository'
import { fileStore } from '@/storage/fileStore'

interface ParsedMeta {
  title: string
  author: string
  language?: string
  coverUrl?: string
}

const QUOTA_ERROR =
  'Not enough storage to import this book. Remove some books or free up device storage, then try again.'

/** Files above this size trigger a storage-quota pre-check before importing. */
const LARGE_FILE_BYTES = 32 * 1024 * 1024

/**
 * Import a picked file into the library: validate the format, persist the raw
 * blob, extract metadata, and store a Book record. Works identically on web
 * and native (the File comes from an <input> or the native file picker).
 */
export async function importBook(file: File): Promise<Result<Book>> {
  const format = detectFormat(file.name)
  if (!isFormatSupported(format)) {
    return err(
      `${format.toUpperCase()} files aren't supported. Supported formats: EPUB, MOBI, AZW/AZW3, PDF and text (TXT, MD).`,
    )
  }

  if (file.size > LARGE_FILE_BYTES && (await hasInsufficientSpace(file.size))) {
    return err(QUOTA_ERROR)
  }

  try {
    const buffer = await file.arrayBuffer()
    const meta = await parseMetadata(buffer, format, file.name)
    const fileKey = await fileStore.put(file)

    const book: Book = {
      id: createId('book'),
      title: meta.title,
      author: meta.author,
      format,
      coverUrl: meta.coverUrl,
      fileKey,
      fileSize: file.size,
      language: meta.language,
      addedAt: Date.now(),
    }
    await bookRepository.save(book)
    return ok(book)
  } catch (error) {
    if (isQuotaError(error)) return err(QUOTA_ERROR)
    return err(`Failed to import "${file.name}": ${getErrorMessage(error)}`)
  }
}

/** True when an error signals the storage quota was hit (browser-specific names). */
function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

/** Best-effort pre-check: does the estimated remaining quota fit the file? */
async function hasInsufficientSpace(bytes: number): Promise<boolean> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate?.quota) return false
    const available = estimate.quota - (estimate.usage ?? 0)
    // Headroom: the blob is stored alongside metadata and an inlined cover.
    return available < bytes * 1.2
  } catch {
    return false
  }
}

async function parseMetadata(
  buffer: ArrayBuffer,
  format: BookFormat,
  filename: string,
): Promise<ParsedMeta> {
  const fallbackTitle = filename.replace(/\.[^.]+$/, '')
  if (format !== 'epub') {
    return { title: fallbackTitle, author: 'Unknown' }
  }

  const book = ePub(buffer)
  try {
    const metadata = await book.loaded.metadata
    const coverUrl = await extractCover(book)
    return {
      title: metadata.title?.trim() || fallbackTitle,
      author: metadata.creator?.trim() || 'Unknown',
      language: metadata.language,
      coverUrl,
    }
  } finally {
    book.destroy()
  }
}

/** Read the cover image and inline it as a data URL for durable storage. */
async function extractCover(
  book: ReturnType<typeof ePub>,
): Promise<string | undefined> {
  try {
    const url = await book.coverUrl()
    if (!url) return undefined
    const blob = await (await fetch(url)).blob()
    return await blobToDataUrl(blob)
  } catch {
    return undefined
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
