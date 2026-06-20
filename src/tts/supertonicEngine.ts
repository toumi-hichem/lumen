import { platform } from '@/lib/platform'
import { getErrorMessage } from '@/lib/result'
import { PcmAudioPlayer } from './audioPlayer'
import {
  type SpeakOptions,
  type TtsEngine,
  type TtsVoice,
  TtsNotAvailableError,
} from './types'
import type { OrtModule, Style, TextToSpeech } from './supertonic/runtime'
import { loadTextToSpeech, loadVoiceStyle } from './supertonic/loaders'
import { type AssetSource, createAssetSource } from './supertonic/assets'

export interface SupertonicConfigOptions {
  /**
   * Asset source for the ONNX models and voice styles. Defaults to a
   * cache-first source (downloaded assets, falling back to bundled
   * `public/supertonic`). Provide a custom source to load from elsewhere.
   */
  source?: AssetSource
  /** Denoising steps: higher = better quality, slower. Supertonic default 8. */
  steps?: number
  /** BCP-47-ish language code understood by Supertonic (e.g. 'en'). */
  lang?: string
  /** CDN serving the matching onnxruntime-web .wasm binaries. */
  wasmPaths?: string
}

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

/**
 * Used only if the runtime can't report its own version. Keep in sync with the
 * `onnxruntime-web` dependency in package.json.
 */
const ORT_FALLBACK_VERSION = '1.26.0'

/**
 * On-device neural TTS using Supertonic via onnxruntime-web. Heavy assets are
 * loaded lazily on init(); if they are missing or the runtime can't start, init
 * throws and the TTS controller falls back to the Web Speech engine.
 */
export class SupertonicEngine implements TtsEngine {
  readonly id = 'supertonic'
  readonly name = 'Supertonic (on-device)'
  readonly requiresAssets = true

  private readonly player = new PcmAudioPlayer()
  private readonly styleCache = new Map<string, Style>()
  private ort: OrtModule | null = null
  private tts: TextToSpeech | null = null
  private ready = false
  private cancelled = false

  private readonly source: AssetSource
  private readonly steps: number
  private readonly lang: string
  private readonly wasmPaths: string | undefined

  constructor(options: SupertonicConfigOptions = {}) {
    this.source = options.source ?? createAssetSource()
    this.steps = options.steps ?? 8
    this.lang = options.lang ?? 'en'
    // Left undefined by default so init() can pin the URL to the runtime's
    // exact version (see below). An explicit override still wins.
    this.wasmPaths = options.wasmPaths
  }

  async init(): Promise<void> {
    if (this.ready) return
    try {
      // Dynamic import keeps onnxruntime-web out of the main bundle.
      const ort = (await import('onnxruntime-web')) as unknown as OrtModule
      // Pin the wasm binaries to the runtime's OWN version. jsdelivr's
      // unversioned path serves whatever is latest, which drifts out of sync
      // with the bundled JS glue and then intermittently fails to instantiate
      // the .wasm. That mismatch is the main cause of Supertonic "randomly"
      // crashing and falling back to the system voice.
      const version = ort.env?.versions?.web ?? ORT_FALLBACK_VERSION
      ort.env.wasm.wasmPaths =
        this.wasmPaths ?? `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`
      this.ort = ort

      // WebGPU is fast on real browsers but flaky inside the Android/iOS
      // WebView, where it can pass session creation yet fail at inference.
      // Prefer the stable WASM backend on native; reserve WebGPU for the web.
      const useWebGpu = platform.hasWebGPU() && !platform.isNative()
      const sessionOptions = {
        executionProviders: [useWebGpu ? 'webgpu' : 'wasm'],
        graphOptimizationLevel: 'all' as const,
      }

      try {
        const { tts } = await loadTextToSpeech(ort, this.source, sessionOptions)
        this.tts = tts
      } catch (gpuError) {
        if (!useWebGpu) throw gpuError
        // WebGPU init can fail at session create; retry on WASM.
        const { tts } = await loadTextToSpeech(ort, this.source, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        })
        this.tts = tts
      }
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

  async speak(text: string, options: SpeakOptions): Promise<void> {
    if (!this.tts || !this.ort) throw new TtsNotAvailableError(this.id, 'not initialized')
    this.cancelled = false

    const voiceId = (options.voiceId && PRESET_IDS.has(options.voiceId)) ? options.voiceId : 'M1'
    const style = await this.getStyle(voiceId)
    if (this.cancelled) return

    const { wav, duration } = await this.tts.call(
      text,
      this.lang,
      style,
      this.steps,
      options.rate,
    )
    if (this.cancelled) return

    const length = Math.floor(this.tts.sampleRate * duration[0])
    const samples = Float32Array.from(wav.slice(0, length))
    await this.player.play(samples, this.tts.sampleRate)
  }

  stop(): void {
    this.cancelled = true
    this.player.stop()
  }

  dispose(): void {
    this.stop()
    this.player.dispose()
    this.styleCache.clear()
    this.tts = null
    this.ready = false
  }

  private async getStyle(voiceId: string): Promise<Style> {
    const cached = this.styleCache.get(voiceId)
    if (cached) return cached
    if (!this.ort) throw new TtsNotAvailableError(this.id, 'not initialized')
    const style = await loadVoiceStyle(this.ort, this.source, voiceId)
    this.styleCache.set(voiceId, style)
    return style
  }
}
