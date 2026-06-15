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

/**
 * Import a picked file into the library: validate the format, persist the raw
 * blob, extract metadata, and store a Book record. Works identically on web
 * and native (the File comes from an <input> or the native file picker).
 */
export async function importBook(file: File): Promise<Result<Book>> {
  const format = detectFormat(file.name)
  if (!isFormatSupported(format)) {
    return err(
      `${format.toUpperCase()} files aren't supported yet. EPUB and text are available today.`,
    )
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
    return err(`Failed to import "${file.name}": ${getErrorMessage(error)}`)
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
