import { useEffect } from 'react'
import type { TtsStatus } from '@/tts/controller'
import type { SpeakableChunk } from '@/reader/types'

interface UseReadAlongParams {
  status: TtsStatus
  chunkIndex: number
  chunks: SpeakableChunk[]
  locate: (chunk: SpeakableChunk) => void
  clear: () => void
}

/**
 * Syncs the TTS controller's current chunk to the reader's read-along
 * highlight: highlights/scrolls to the spoken chunk while playing, and clears
 * the highlight when playback stops. `locate`/`clear` must be stable
 * (memoized in useReader) so this effect only fires on real changes.
 */
export function useReadAlong({
  status,
  chunkIndex,
  chunks,
  locate,
  clear,
}: UseReadAlongParams): void {
  useEffect(() => {
    if (status !== 'playing') return
    const chunk = chunks[chunkIndex]
    if (chunk) locate(chunk)
  }, [status, chunkIndex, chunks, locate])

  useEffect(() => {
    if (status === 'idle') clear()
  }, [status, clear])
}
