import { getErrorMessage } from '@/lib/result'
import { PcmAudioPlayer } from './audioPlayer'
import {
  type SpeakOptions,
  type TtsEngine,
  type TtsEngineNotice,
  type TtsVoice,
  TtsNotAvailableError,
} from './types'
import {
  SupertonicSynthesizer,
  type SynthesizerInfo,
} from './supertonic/synthesizer'
import type { AssetSource } from './supertonic/assets'
import type {
  WorkerRequest,
  WorkerResponse,
} from './supertonic/supertonicWorker'

export interface SupertonicConfigOptions {
  /**
   * Asset source override for the ONNX models and voice styles (tests only:
   * a custom source forces the inline path, since a worker cannot receive a
   * function-bearing object).
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

/** Generous: first init compiles wasm kernels and runs two warm-up passes. */
const WORKER_INIT_TIMEOUT_MS = 120_000

interface PendingRequest {
  resolve: (samples: Float32Array) => void
  reject: (error: Error) => void
}

class SynthesisCancelled extends Error {
  constructor() {
    super('Synthesis cancelled')
    this.name = 'SynthesisCancelledError'
  }
}

/**
 * On-device neural TTS using Supertonic via onnxruntime-web.
 *
 * Inference runs in a dedicated module worker so the UI thread never blocks
 * (and, when the page is cross-origin isolated, the worker runs ORT
 * multi-threaded). If the worker cannot start or fails to initialize (some
 * WebViews), the engine falls back to running the same synthesizer inline on
 * the main thread, the previously proven-safe path. If that also fails, init
 * throws and the TTS controller falls back to the platform voice.
 */
export class SupertonicEngine implements TtsEngine {
  readonly id = 'supertonic'
  readonly name = 'Supertonic (on-device)'
  readonly requiresAssets = true

  private readonly player = new PcmAudioPlayer()
  private worker: Worker | null = null
  private inline: SupertonicSynthesizer | null = null
  private ready = false
  private cancelled = false
  private info: SynthesizerInfo | null = null
  private sampleRate = 44100

  // Pre-synthesized audio so the next sentence is ready before the current
  // ends (the controller prefetches via prefetch()). Synthesis is serialized
  // by the worker's internal queue (or `synthQueue` inline) because ORT
  // sessions can't run two inferences at once.
  private readonly cache = new Map<string, Float32Array>()
  private readonly pending = new Map<string, Promise<Float32Array>>()
  private readonly requests = new Map<number, PendingRequest>()
  private nextRequestId = 1
  private synthQueue: Promise<unknown> = Promise.resolve()

  private readonly options: SupertonicConfigOptions
  onNotice?: (notice: TtsEngineNotice) => void

  constructor(options: SupertonicConfigOptions = {}) {
    this.options = options
  }

  async init(): Promise<void> {
    if (this.ready) return
    const loadStart = performance.now()
    this.onNotice?.({ type: 'model-loading' })
    try {
      // A custom asset source can't cross the worker boundary; run inline.
      if (!this.options.source && typeof Worker !== 'undefined') {
        try {
          this.info = await this.initWorker()
        } catch (workerError) {
          console.warn(
            '[supertonic] worker unavailable, running inline:',
            getErrorMessage(workerError),
          )
          this.teardownWorker()
          this.info = await this.initInline()
        }
      } else {
        this.info = await this.initInline()
      }
      this.sampleRate = this.info.sampleRate
      this.ready = true
      this.onNotice?.({
        type: 'model-ready',
        elapsedMs: Math.round(performance.now() - loadStart),
      })
    } catch (error) {
      throw new TtsNotAvailableError(this.id, getErrorMessage(error))
    }
  }

  /** Measured realtime factor (synth time / audio length); 0 until warmed. */
  getRealtimeFactor(): number {
    return this.info?.rtf ?? 0
  }

  isReady(): boolean {
    return this.ready
  }

  async listVoices(): Promise<TtsVoice[]> {
    return PRESET_VOICES
  }

  async speak(text: string, options: SpeakOptions): Promise<void> {
    if (!this.ready) throw new TtsNotAvailableError(this.id, 'not initialized')
    this.cancelled = false
    let samples: Float32Array
    try {
      samples = await this.synthesize(text, options)
    } catch (error) {
      if (error instanceof SynthesisCancelled) return
      throw error
    }
    if (this.cancelled) return
    await this.player.play(samples, this.sampleRate)
  }

  prefetch(text: string, options: SpeakOptions): void {
    if (!this.ready) return
    // Fire-and-forget: warm the cache for upcoming sentences while this one
    // plays. Errors surface when speak() reaches the chunk.
    void this.synthesize(text, options).catch(() => undefined)
  }

  stop(): void {
    this.cancelled = true
    // Interrupt the in-flight synthesis at its next denoising step.
    if (this.worker) this.post({ type: 'cancel' })
    this.inline?.cancelPending()
    this.player.stop()
  }

  dispose(): void {
    this.stop()
    this.teardownWorker()
    this.inline?.dispose()
    this.inline = null
    this.player.dispose()
    this.cache.clear()
    this.pending.clear()
    this.ready = false
  }

  // --- worker path ---

  private initWorker(): Promise<SynthesizerInfo> {
    return new Promise<SynthesizerInfo>((resolve, reject) => {
      let settled = false
      const worker = new Worker(
        new URL('./supertonic/supertonicWorker.ts', import.meta.url),
        { type: 'module' },
      )
      this.worker = worker
      const timeout = setTimeout(() => {
        fail(new Error('worker init timed out'))
      }, WORKER_INIT_TIMEOUT_MS)
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        reject(error)
      }

      worker.onerror = (event) => {
        // Startup script errors land here; after init they poison nothing on
        // the main thread, but reject any callers waiting on synthesis.
        const error = new Error(event.message || 'worker error')
        fail(error)
        this.rejectAllRequests(error)
      }
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data
        switch (msg.type) {
          case 'ready':
            if (!settled) {
              settled = true
              clearTimeout(timeout)
              resolve({
                rtf: msg.rtf,
                steps: msg.steps,
                sampleRate: msg.sampleRate,
                threads: msg.threads,
              })
            }
            break
          case 'init-error':
            fail(new Error(msg.message))
            break
          case 'result': {
            const req = this.requests.get(msg.id)
            this.requests.delete(msg.id)
            req?.resolve(msg.samples)
            break
          }
          case 'synth-error': {
            const req = this.requests.get(msg.id)
            this.requests.delete(msg.id)
            req?.reject(
              msg.cancelled ? new SynthesisCancelled() : new Error(msg.message),
            )
            break
          }
        }
      }
      this.post({
        type: 'init',
        steps: this.options.steps,
        lang: this.options.lang,
        wasmPaths: this.options.wasmPaths,
      })
    })
  }

  private post(message: WorkerRequest): void {
    this.worker?.postMessage(message)
  }

  private teardownWorker(): void {
    if (!this.worker) return
    this.post({ type: 'dispose' })
    this.worker.terminate()
    this.worker = null
    this.rejectAllRequests(new Error('worker disposed'))
  }

  private rejectAllRequests(error: Error): void {
    for (const req of this.requests.values()) req.reject(error)
    this.requests.clear()
  }

  // --- inline fallback path ---

  private async initInline(): Promise<SynthesizerInfo> {
    const inline = new SupertonicSynthesizer()
    const info = await inline.init({
      steps: this.options.steps,
      lang: this.options.lang,
      wasmPaths: this.options.wasmPaths,
      source: this.options.source,
    })
    this.inline = inline
    return info
  }

  // --- synthesis dispatch (shared) ---

  /** Synthesize (or return cached) PCM for a chunk. */
  private synthesize(text: string, options: SpeakOptions): Promise<Float32Array> {
    const voiceId =
      options.voiceId && PRESET_IDS.has(options.voiceId) ? options.voiceId : 'M1'
    const key = `${voiceId}|${options.rate}|${text}`
    const cached = this.cache.get(key)
    if (cached) return Promise.resolve(cached)
    const inflight = this.pending.get(key)
    if (inflight) return inflight

    const job = this.worker
      ? this.requestFromWorker(text, voiceId, options.rate)
      : this.enqueueInline(text, voiceId, options.rate)
    const tracked = job.then((samples) => {
      this.store(key, samples)
      return samples
    })
    this.pending.set(key, tracked)
    void tracked.catch(() => undefined).finally(() => this.pending.delete(key))
    return tracked
  }

  private requestFromWorker(
    text: string,
    voiceId: string,
    rate: number,
  ): Promise<Float32Array> {
    return new Promise<Float32Array>((resolve, reject) => {
      const id = this.nextRequestId++
      this.requests.set(id, { resolve, reject })
      this.post({ type: 'synthesize', id, text, voiceId, rate })
    })
  }

  private enqueueInline(
    text: string,
    voiceId: string,
    rate: number,
  ): Promise<Float32Array> {
    const fn = async () => {
      if (!this.inline) throw new TtsNotAvailableError(this.id, 'not initialized')
      try {
        const { samples } = await this.inline.synthesize(text, voiceId, rate)
        return samples
      } catch (error) {
        if (error instanceof Error && error.name === 'SynthesisCancelledError') {
          throw new SynthesisCancelled()
        }
        throw error
      }
    }
    const run = this.synthQueue.then(fn, fn)
    this.synthQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** Cache a synthesized chunk, capping memory by evicting the oldest. */
  private store(key: string, samples: Float32Array): void {
    this.cache.set(key, samples)
    while (this.cache.size > 6) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }
}
