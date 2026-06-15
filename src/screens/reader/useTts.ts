import { useEffect, useRef, useState } from 'react'
import { TtsController, type TtsStatus } from '@/tts/controller'
import { setMediaPlaybackState, setupMediaSession } from '@/tts/mediaSession'
import { useSettingsStore } from '@/store/settingsStore'
import type { SpeakableChunk } from '@/reader/types'

export interface UseTtsOptions {
  bookTitle?: string
  author?: string
  /** Called when narration finishes all chunks naturally (for auto-advance). */
  onComplete?: () => void
  /** Skip to the next chapter (lock-screen "next"). */
  onNext?: () => void
  /** Go to the previous chapter (lock-screen "previous"). */
  onPrev?: () => void
}

export interface ReaderTtsApi {
  status: TtsStatus
  chunkIndex: number
  activeEngineId: string
  error?: string
  chunks: SpeakableChunk[]
  /** Minutes remaining on the sleep timer, or null if off. */
  sleepMinutes: number | null
  start: (chunks: SpeakableChunk[], startIndex?: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setSleepTimer: (minutes: number | null) => void
}

/** React wrapper around the TtsController, bound to the user's TTS settings. */
export function useTts(options: UseTtsOptions = {}): ReaderTtsApi {
  const tts = useSettingsStore((s) => s.tts)
  const [status, setStatus] = useState<TtsStatus>('idle')
  const [chunkIndex, setChunkIndex] = useState(0)
  const [activeEngineId, setActiveEngineId] = useState(tts.engineId)
  const [error, setError] = useState<string>()
  const [chunks, setChunks] = useState<SpeakableChunk[]>([])
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null)
  const sleepTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Keep the latest onComplete without re-creating the controller.
  const onCompleteRef = useRef(options.onComplete)
  onCompleteRef.current = options.onComplete

  const controllerRef = useRef<TtsController | null>(null)
  if (controllerRef.current == null) {
    controllerRef.current = new TtsController({
      onStatus: (s) => {
        setStatus(s)
        setMediaPlaybackState(
          s === 'playing' ? 'playing' : s === 'paused' ? 'paused' : 'none',
        )
      },
      onChunk: setChunkIndex,
      onError: setError,
      onEngineResolved: setActiveEngineId,
      onComplete: () => onCompleteRef.current?.(),
    })
  }

  useEffect(() => {
    void controllerRef.current?.useEngine(tts.engineId)
  }, [tts.engineId])

  useEffect(() => {
    controllerRef.current?.setOptions({
      rate: tts.rate,
      pitch: tts.pitch,
      voiceId: tts.voiceId,
    })
  }, [tts.rate, tts.pitch, tts.voiceId])

  // Lock-screen / headset media controls.
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    return setupMediaSession({
      title: options.bookTitle ?? 'Lumen',
      artist: options.author,
      onPlay: () => void controller.resume(),
      onPause: () => controller.pause(),
      onStop: () => controller.stop(),
      onNext: () => options.onNext?.(),
      onPrev: () => options.onPrev?.(),
    })
    // Re-register only when the displayed metadata/handlers change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.bookTitle, options.author, options.onNext, options.onPrev])

  useEffect(() => {
    return () => {
      clearTimeout(sleepTimer.current)
      controllerRef.current?.dispose()
    }
  }, [])

  const start = (next: SpeakableChunk[], startIndex = 0) => {
    setError(undefined)
    setChunks(next)
    void controllerRef.current?.play(
      next.map((c) => c.text),
      { rate: tts.rate, pitch: tts.pitch, voiceId: tts.voiceId },
      startIndex,
    )
  }

  const setSleepTimer = (minutes: number | null) => {
    clearTimeout(sleepTimer.current)
    setSleepMinutes(minutes)
    if (minutes && minutes > 0) {
      sleepTimer.current = setTimeout(
        () => {
          controllerRef.current?.pause()
          setSleepMinutes(null)
        },
        minutes * 60 * 1000,
      )
    }
  }

  return {
    status,
    chunkIndex,
    activeEngineId,
    error,
    chunks,
    sleepMinutes,
    start,
    pause: () => controllerRef.current?.pause(),
    resume: () => void controllerRef.current?.resume(),
    stop: () => controllerRef.current?.stop(),
    setSleepTimer,
  }
}
