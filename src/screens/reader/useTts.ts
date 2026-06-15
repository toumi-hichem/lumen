import { useEffect, useRef, useState } from 'react'
import { TtsController, type TtsStatus } from '@/tts/controller'
import { useSettingsStore } from '@/store/settingsStore'

export interface ReaderTtsApi {
  status: TtsStatus
  chunkIndex: number
  activeEngineId: string
  error?: string
  start: (chunks: string[]) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

/** React wrapper around the TtsController, bound to the user's TTS settings. */
export function useTts(): ReaderTtsApi {
  const tts = useSettingsStore((s) => s.tts)
  const [status, setStatus] = useState<TtsStatus>('idle')
  const [chunkIndex, setChunkIndex] = useState(0)
  const [activeEngineId, setActiveEngineId] = useState(tts.engineId)
  const [error, setError] = useState<string>()
  const chunksRef = useRef<string[]>([])

  const controllerRef = useRef<TtsController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new TtsController({
      onStatus: setStatus,
      onChunk: setChunkIndex,
      onError: setError,
      onEngineResolved: setActiveEngineId,
    })
  }

  // Load (and possibly fall back) whenever the chosen engine changes.
  useEffect(() => {
    void controllerRef.current?.useEngine(tts.engineId)
  }, [tts.engineId])

  // Keep speak options in sync without restarting playback.
  useEffect(() => {
    controllerRef.current?.setOptions({
      rate: tts.rate,
      pitch: tts.pitch,
      voiceId: tts.voiceId,
    })
  }, [tts.rate, tts.pitch, tts.voiceId])

  useEffect(() => {
    return () => controllerRef.current?.dispose()
  }, [])

  const start = (chunks: string[]) => {
    setError(undefined)
    chunksRef.current = chunks
    void controllerRef.current?.play(
      chunks,
      { rate: tts.rate, pitch: tts.pitch, voiceId: tts.voiceId },
      0,
    )
  }

  return {
    status,
    chunkIndex,
    activeEngineId,
    error,
    start,
    pause: () => controllerRef.current?.pause(),
    resume: () => void controllerRef.current?.resume(),
    stop: () => controllerRef.current?.stop(),
  }
}
