import { getDb } from './db'
import type { BookSettings } from '@/domain/models'

/** Per-book TTS overrides (voice/engine/rate), keyed by bookId. */
export const bookSettingsRepository = {
  async get(bookId: string): Promise<BookSettings | null> {
    const db = await getDb()
    return (await db.get('bookSettings', bookId)) ?? null
  },

  async save(settings: BookSettings): Promise<BookSettings> {
    const db = await getDb()
    await db.put('bookSettings', settings)
    return settings
  },
}
