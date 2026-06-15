import type { Book, Highlight } from '@/domain/models'

/** Group highlights by book and render Markdown for export/sharing. */
export function highlightsToMarkdown(
  books: Book[],
  highlights: Highlight[],
): string {
  const byBook = new Map<string, Highlight[]>()
  for (const hl of highlights) {
    const list = byBook.get(hl.bookId) ?? []
    list.push(hl)
    byBook.set(hl.bookId, list)
  }

  const lines: string[] = ['# Highlights', '']
  for (const book of books) {
    const items = byBook.get(book.id)
    if (!items?.length) continue
    lines.push(`## ${book.title}`, `*${book.author}*`, '')
    for (const hl of items.sort((a, b) => a.createdAt - b.createdAt)) {
      lines.push(`> ${hl.text.trim()}`)
      if (hl.note) lines.push('', `Note: ${hl.note.trim()}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

export function highlightsToJson(highlights: Highlight[]): string {
  return JSON.stringify(highlights, null, 2)
}

/** Trigger a client-side file download (web + WebView). */
export function downloadText(
  filename: string,
  content: string,
  mime = 'text/plain',
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
