export interface TtsVoice {
  id: string
  name: string
  lang?: string
  gender?: 'male' | 'female'
}

export interface SpeakOptions {
  /** Rate multiplier, 1 = normal. */
  rate: number
  /** Pitch multiplier, 1 = normal (ignored by engines without pitch control). */
  pitch: number
  voiceId?: string
}

/**
 * A pluggable text-to-speech engine. Implementations: WebSpeechEngine (built
 * into every browser/WebView, the safe default) and SupertonicEngine
 * (on-device neural TTS via onnxruntime-web). New engines (cloud, native
 * platform TTS, other neural models) implement this interface and register in
 * the registry — nothing else in the app changes.
 */
export interface TtsEngine {
  readonly id: string
  readonly name: string
  /** True if the engine needs model/voice assets downloaded before use. */
  readonly requiresAssets: boolean

  /** Load voices / models. Safe to call more than once. */
  init(): Promise<void>
  isReady(): boolean
  listVoices(): Promise<TtsVoice[]>

  /**
   * Speak a single text chunk. Resolves when playback finishes naturally.
   * Calling stop() must cause an in-flight speak() to resolve promptly so the
   * orchestrating controller can exit its loop cleanly.
   */
  speak(text: string, options: SpeakOptions): Promise<void>

  /** Cancel current and queued speech. */
  stop(): void

  /** Release resources (audio context, ORT session). */
  dispose(): void
}

export interface TtsEngineDescriptor {
  id: string
  name: string
  requiresAssets: boolean
  /** True only if the runtime can actually use it (e.g. WebGPU/WASM present). */
  available: boolean
}

export class TtsNotAvailableError extends Error {
  constructor(engineId: string, reason: string) {
    super(`Voice reading is not supported on this device (${engineId}: ${reason})`)
    this.name = 'TtsNotAvailableError'
  }
}
