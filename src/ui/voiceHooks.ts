import { useEffect, useRef, useState } from 'react'
import { createTtsEngine } from '@/tts/registry'
import { hasNativeSupertonic } from '@/tts/supertonic/nativeBridge'
import { hasNativeKokoro } from '@/tts/kokoro/nativeBridge'
import type { TtsEngine, TtsVoice } from '@/tts/types'
import { useSettingsStore } from '@/store/settingsStore'

/**
 * Engines whose web implementation owns its own worker + audio context
 * (instance-scoped), so disposing an inactive preview instance is always
 * safe. Native counterparts of these same ids instead share a native
 * playback channel that must not be torn down casually — see the dispose
 * guard below.
 */
const ISOLATED_WEB_ENGINE_IDS = new Set(['supertonic', 'kokoro'])
function hasNativePipeline(engineId: string): boolean {
  if (engineId === 'supertonic') return hasNativeSupertonic()
  if (engineId === 'kokoro') return hasNativeKokoro()
  return false
}

/** Load the available voices for a given engine (safe for non-initialized). */
export function useVoices(engineId: string): TtsVoice[] {
  const [voices, setVoices] = useState<TtsVoice[]>([])
  useEffect(() => {
    let active = true
    const engine = createTtsEngine(engineId)
    engine
      .listVoices()
      .then((v) => { if (active) setVoices(v) })
      .catch(() => { if (active) setVoices([]) })
    return () => { active = false }
  }, [engineId])
  return voices
}

export interface VoicePreviewApi {
  /** Id of the voice being previewed ('' = default voice), null when silent. */
  previewingId: string | null
  /** True while the engine is still getting ready to speak the sample. */
  loading: boolean
  /** Start previewing a voice, or stop if it is already previewing. */
  toggle: (voice: TtsVoice | null) => void
  stop: () => void
}

function sampleLine(voice: TtsVoice | null): string {
  if (!voice || !voice.name) {
    return 'Hi! This is the default voice. Pick me and let’s start reading together.'
  }
  return `Hi, I’m ${voice.name}. Pick me and I’ll read your books out loud.`
}

/**
 * Speak a few-second sample in a given voice so the user can choose by ear.
 * Keeps one engine instance per engine id (Supertonic model load is expensive)
 * and releases it on unmount. Previews are best-effort: failures are silent
 * and the picker stays fully usable without them.
 *
 * IMPORTANT: stop()/dispose() on most engines act on a shared playback channel
 * (speechSynthesis, the device TTS, the native Supertonic service), so they are
 * only called while a preview is actually active — otherwise closing the
 * picker or unmounting the panel would cut off an ongoing narration.
 */
export function useVoicePreview(engineId: string): VoicePreviewApi {
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const engineRef = useRef<TtsEngine | null>(null)
  // Mirrors previewingId for non-render code paths (cleanup, stop guards).
  const activeRef = useRef(false)
  // Monotonic token: bumping it invalidates any in-flight preview's cleanup.
  const runRef = useRef(0)

  useEffect(() => {
    return () => {
      // The refs are counters/flags, not DOM nodes — reading them in cleanup
      // is intentional.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runRef.current++
      const engine = engineRef.current
      engineRef.current = null
      if (!engine) return
      if (activeRef.current) {
        // Our preview is the thing playing — safe to tear down.
        engine.dispose()
      } else if (ISOLATED_WEB_ENGINE_IDS.has(engine.id) && !hasNativePipeline(engine.id)) {
        // The web implementation owns its own worker and audio context
        // (instance-scoped), so disposing frees the model without touching
        // any shared playback channel.
        engine.dispose()
      }
      activeRef.current = false
      setPreviewingId(null)
      setLoading(false)
    }
  }, [engineId])

  const stop = () => {
    runRef.current++
    if (activeRef.current) engineRef.current?.stop()
    activeRef.current = false
    setPreviewingId(null)
    setLoading(false)
  }

  const toggle = (voice: TtsVoice | null) => {
    const id = voice?.id ?? ''
    if (previewingId === id) {
      stop()
      return
    }

    if (activeRef.current) engineRef.current?.stop()
    const run = ++runRef.current
    activeRef.current = true
    setPreviewingId(id)
    setLoading(true)

    void (async () => {
      try {
        if (!engineRef.current) engineRef.current = createTtsEngine(engineId)
        const engine = engineRef.current
        // Engines that load their model lazily (native Supertonic loads it in
        // the playback service, after init() has returned) report it here, so
        // the spinner covers the real wait instead of only engine startup.
        engine.onNotice = (notice) => {
          if (runRef.current !== run) return
          if (notice.type === 'model-loading') setLoading(true)
          else if (notice.type === 'model-ready') setLoading(false)
        }
        if (!engine.isReady()) await engine.init()
        if (runRef.current !== run) return
        setLoading(false)
        const { rate, pitch } = useSettingsStore.getState().tts
        await engine.speak(sampleLine(voice), {
          rate,
          pitch,
          voiceId: id || undefined,
        })
      } catch {
        // Best-effort: a failed preview should never break the picker.
      } finally {
        if (runRef.current === run) {
          activeRef.current = false
          setPreviewingId(null)
          setLoading(false)
        }
      }
    })()
  }

  return { previewingId, loading, toggle, stop }
}
