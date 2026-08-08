import type { PluginListenerHandle } from '@capacitor/core'
import { getErrorMessage } from '@/lib/result'
import {
  type SpeakOptions,
  type TtsEngine,
  type TtsEngineNotice,
  type TtsQueueEvents,
  type TtsVoice,
  TtsNotAvailableError,
} from './types'
import { hasNativeSupertonic, SupertonicNative } from './supertonic/nativeBridge'
import { PRESET_VOICES, presetVoiceId } from './supertonic/presetVoices'

/**
 * Supertonic through the native Android pipeline: inference and playback run
 * in a foreground media service (onnxruntime-android, AudioTrack,
 * MediaSession), so read-aloud continues with the screen off and inference is
 * multithreaded. Implements playQueue, so the TTS controller hands over the
 * whole chunk list instead of driving chunk by chunk from suspendable JS.
 */
export class SupertonicNativeEngine implements TtsEngine {
  readonly id = 'supertonic'
  readonly name = 'Supertonic (on-device)'
  readonly requiresAssets = true

  private ready = false
  private listeners: PluginListenerHandle[] = []
  private queueEvents: TtsQueueEvents | null = null
  /** Settles the promise returned by a single-chunk speak(). */
  private pendingSpeak: (() => void) | null = null
  onNotice?: (notice: TtsEngineNotice) => void

  async init(): Promise<void> {
    if (this.ready) return
    if (!hasNativeSupertonic()) {
      throw new TtsNotAvailableError(this.id, 'native plugin unavailable')
    }
    try {
      const { ready } = await SupertonicNative.isModelReady()
      if (!ready) {
        throw new Error(
          'Supertonic voice is not downloaded. Install it from Settings.',
        )
      }
      await this.attachListeners()
      this.ready = true
    } catch (error) {
      throw new TtsNotAvailableError(this.id, getErrorMessage(error))
    }
  }

  isReady(): boolean {
    return this.ready
  }

  async listVoices(): Promise<TtsVoice[]> {
    return PRESET_VOICES
  }

  /**
   * Single-chunk speak, used by previews. Queue playback (the reader) goes
   * through playQueue. The plugin call only *starts* the playback service, so
   * the promise is held open until the service reports completion — callers
   * rely on speak() tracking actual playback (see TtsEngine.speak).
   */
  async speak(text: string, options: SpeakOptions): Promise<void> {
    this.settlePendingSpeak()
    // Armed before the bridge call rather than after. Capacitor runs plugin
    // methods on a background thread ("CapacitorPlugins"), so the service can
    // in principle emit a terminal event before speak()'s own resolve is
    // dispatched; a terminal event with no resolver installed would hang this
    // forever. The window is two statements wide and no current service path
    // fires that fast — this just makes the ordering not matter.
    let settle!: () => void
    const done = new Promise<void>((resolve) => {
      settle = resolve
    })
    this.pendingSpeak = settle
    try {
      await SupertonicNative.speak({
        chunks: [text],
        voiceId: presetVoiceId(options.voiceId),
        rate: options.rate,
      })
    } catch (error) {
      if (this.pendingSpeak === settle) this.pendingSpeak = null
      settle()
      throw error
    }
    await done
  }

  async playQueue(
    chunks: string[],
    options: SpeakOptions,
    startIndex: number,
    events: TtsQueueEvents,
  ): Promise<void> {
    // A queue supersedes any preview still holding the playback service.
    this.settlePendingSpeak()
    this.queueEvents = events
    await SupertonicNative.speak({
      chunks,
      voiceId: presetVoiceId(options.voiceId),
      rate: options.rate,
      startIndex,
      title: options.title ?? 'Reading aloud',
      cover: options.coverUrl,
    })
  }

  pauseQueue(): Promise<void> {
    return SupertonicNative.pause()
  }

  resumeQueue(): Promise<void> {
    return SupertonicNative.resume()
  }

  stop(): void {
    void SupertonicNative.stopPlayback()
    // stopPlayback never emits 'complete', so resolve here: the contract is
    // that stop() makes an in-flight speak() resolve promptly.
    this.settlePendingSpeak()
  }

  dispose(): void {
    this.stop()
    this.queueEvents = null
    for (const handle of this.listeners) void handle.remove()
    this.listeners = []
    this.ready = false
  }

  /** Resolve an outstanding single-chunk speak(), if any. */
  private settlePendingSpeak(): void {
    const resolve = this.pendingSpeak
    this.pendingSpeak = null
    resolve?.()
  }

  private async attachListeners(): Promise<void> {
    this.listeners = await Promise.all([
      SupertonicNative.addListener('chunk', ({ index }) => {
        this.queueEvents?.onChunk(index)
      }),
      SupertonicNative.addListener('complete', () => {
        this.settlePendingSpeak()
        this.queueEvents?.onComplete()
      }),
      SupertonicNative.addListener('error', ({ message }) => {
        this.settlePendingSpeak()
        this.queueEvents?.onError(message)
      }),
      SupertonicNative.addListener('modelState', ({ state, elapsedMs }) => {
        this.onNotice?.(
          state === 'loading'
            ? { type: 'model-loading' }
            : { type: 'model-ready', elapsedMs: elapsedMs ?? 0 },
        )
      }),
      SupertonicNative.addListener('synthesizing', ({ index }) => {
        this.onNotice?.({ type: 'synthesizing', index })
      }),
      // The service emits this whenever pausePlayback()/resumePlayback() run,
      // regardless of trigger: a tap on the notification's own Play/Pause
      // button, an audio-focus loss, a headset button — none of which go
      // through this engine's pauseQueue()/resumeQueue(). Without forwarding
      // it, the controller's status drifts from what's actually playing.
      SupertonicNative.addListener('state', ({ playing }) => {
        this.queueEvents?.onExternalStateChange?.(playing)
      }),
      SupertonicNative.addListener('skip', ({ direction }) => {
        this.onNotice?.({ type: 'skip', direction })
      }),
    ])
  }
}
