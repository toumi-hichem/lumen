import { useEffect, useRef, useState } from 'react'
import { TtsController, type TtsStatus } from '@/tts/controller'
import { listTtsEngines } from '@/tts/registry'
import { setMediaPlaybackState, setupMediaSession, updateMediaSessionLine } from '@/tts/mediaSession'
import { useSettingsStore } from '@/store/settingsStore'
import type { SpeakableChunk } from '@/reader/types'

export interface UseTtsOptions {
  bookTitle?: string
  author?: string
  coverUrl?: string
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
  /** Persistent notice when the chosen engine failed and we fell back. */
  fallbackReason?: string
  chunks: SpeakableChunk[]
  /** Minutes set on the sleep timer, or null if off. */
  sleepMinutes: number | null
  /** Seconds remaining on the sleep timer, updated every second. */
  sleepSecondsRemaining: number | null
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
  const [fallbackReason, setFallbackReason] = useState<string>()
  const [chunks, setChunks] = useState<SpeakableChunk[]>([])
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null)
  const [sleepSecondsRemaining, setSleepSecondsRemaining] = useState<number | null>(null)

  const sleepTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const sleepCountdown = useRef<ReturnType<typeof setInterval>>(undefined)
  const sleepEndTime = useRef<number | null>(null)

  // Stabilise callbacks via refs so the media session effect doesn't re-fire
  // on every render and the TtsController never captures stale closures.
  const onCompleteRef = useRef(options.onComplete)
  onCompleteRef.current = options.onComplete
  const onNextRef = useRef(options.onNext)
  onNextRef.current = options.onNext
  const onPrevRef = useRef(options.onPrev)
  onPrevRef.current = options.onPrev

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
      onEngineResolved: (id, info) => {
        setActiveEngineId(id)
        if (info) {
          // The chosen engine failed; we fell back. Keep this notice visible
          // (start() must not clear it) so the cause isn't hidden behind a
          // silent switch to the device voice.
          const name =
            listTtsEngines().find((e) => e.id === info.requested)?.name ??
            info.requested
          const active =
            listTtsEngines().find((e) => e.id === id)?.name ?? id
          setFallbackReason(`${name} unavailable — using ${active}. ${info.reason}`)
        } else {
          setFallbackReason(undefined)
        }
      },
      onComplete: () => onCompleteRef.current?.(),
    })
  }

  useEffect(() => {
    controllerRef.current?.setOptions({
      rate: tts.rate,
      pitch: tts.pitch,
      voiceId: tts.voiceId,
    })
  }, [tts.rate, tts.pitch, tts.voiceId])

  // Pre-warm the engine from settings so play() doesn't fall back to web-speech.
  useEffect(() => {
    void controllerRef.current?.useEngine(tts.engineId)
  }, [tts.engineId])

  // Update OS notification with the current spoken line.
  useEffect(() => {
    if (status === 'playing' && chunks[chunkIndex]) {
      updateMediaSessionLine(chunks[chunkIndex].text)
    }
  }, [chunkIndex, chunks, status])

  // Lock-screen / headset media controls.
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    const artwork: MediaImage[] = options.coverUrl
      ? [{ src: options.coverUrl, sizes: '256x256', type: 'image/jpeg' }]
      : []
    return setupMediaSession({
      title: options.bookTitle ?? 'Lumen',
      artist: options.author,
      artwork,
      onPlay: () => void controller.resume(),
      onPause: () => controller.pause(),
      onStop: () => controller.stop(),
      onNext: () => onNextRef.current?.(),
      onPrev: () => onPrevRef.current?.(),
    })
    // Re-register only when the displayed metadata changes, not on every render.
  }, [options.bookTitle, options.author, options.coverUrl])

  useEffect(() => {
    return () => {
      clearTimeout(sleepTimer.current)
      clearInterval(sleepCountdown.current)
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
    clearInterval(sleepCountdown.current)
    setSleepMinutes(minutes)
    sleepEndTime.current = null

    if (minutes && minutes > 0) {
      const endMs = Date.now() + minutes * 60 * 1000
      sleepEndTime.current = endMs
      setSleepSecondsRemaining(minutes * 60)

      sleepTimer.current = setTimeout(() => {
        controllerRef.current?.pause()
        setSleepMinutes(null)
        setSleepSecondsRemaining(null)
        sleepEndTime.current = null
      }, minutes * 60 * 1000)

      sleepCountdown.current = setInterval(() => {
        if (sleepEndTime.current === null) {
          clearInterval(sleepCountdown.current)
          return
        }
        const remaining = Math.max(0, Math.round((sleepEndTime.current - Date.now()) / 1000))
        setSleepSecondsRemaining(remaining)
        if (remaining === 0) clearInterval(sleepCountdown.current)
      }, 1000)
    } else {
      setSleepSecondsRemaining(null)
    }
  }

  return {
    status,
    chunkIndex,
    activeEngineId,
    error,
    fallbackReason,
    chunks,
    sleepMinutes,
    sleepSecondsRemaining,
    start,
    pause: () => controllerRef.current?.pause(),
    resume: () => void controllerRef.current?.resume(),
    stop: () => controllerRef.current?.stop(),
    setSleepTimer,
  }
}
