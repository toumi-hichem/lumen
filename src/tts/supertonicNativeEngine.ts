import type { PluginListenerHandle } from '@capacitor/core'
import { getErrorMessage } from '@/lib/result'
import {
  type SpeakOptions,
  type TtsEngine,
  type TtsQueueEvents,
  type TtsVoice,
  TtsNotAvailableError,
} from './types'
import { hasNativeSupertonic, SupertonicNative } from './supertonic/nativeBridge'

const PRESET_VOICES: TtsVoice[] = [
  ...['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => ({
    id,
    name: `Male ${id.slice(1)}`,
    gender: 'male' as const,
  })),
  ...['F1', 'F2', 'F3', 'F4', 'F5'].map((id) => ({
    id,
    name: `Female ${id.slice(1)}`,
    gender: 'female' as const,
  })),
]
const PRESET_IDS = new Set(PRESET_VOICES.map((v) => v.id))

/** Unset/unknown voice ids (e.g. a fresh install) fall back to the default. */
function presetVoiceId(voiceId: string | undefined): string {
  return voiceId && PRESET_IDS.has(voiceId) ? voiceId : 'M1'
}

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
   * through playQueue. Resolution is fire-and-forget: the service plays it.
   */
  async speak(text: string, options: SpeakOptions): Promise<void> {
    await SupertonicNative.speak({
      chunks: [text],
      voiceId: presetVoiceId(options.voiceId),
      rate: options.rate,
    })
  }

  async playQueue(
    chunks: string[],
    options: SpeakOptions,
    startIndex: number,
    events: TtsQueueEvents,
  ): Promise<void> {
    this.queueEvents = events
    await SupertonicNative.speak({
      chunks,
      voiceId: presetVoiceId(options.voiceId),
      rate: options.rate,
      startIndex,
      title: 'Reading aloud',
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
  }

  dispose(): void {
    this.stop()
    this.queueEvents = null
    for (const handle of this.listeners) void handle.remove()
    this.listeners = []
    this.ready = false
  }

  private async attachListeners(): Promise<void> {
    this.listeners = await Promise.all([
      SupertonicNative.addListener('chunk', ({ index }) => {
        this.queueEvents?.onChunk(index)
      }),
      SupertonicNative.addListener('complete', () => {
        this.queueEvents?.onComplete()
      }),
      SupertonicNative.addListener('error', ({ message }) => {
        this.queueEvents?.onError(message)
      }),
    ])
  }
}
