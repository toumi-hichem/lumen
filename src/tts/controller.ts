import { getErrorMessage } from '@/lib/result'
import { createTtsEngine, DEFAULT_ENGINE_ID } from './registry'
import type { SpeakOptions, TtsEngine } from './types'

export type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused'

export interface TtsControllerEvents {
  onStatus?: (status: TtsStatus) => void
  /** Index of the chunk currently being spoken (for highlight sync). */
  onChunk?: (index: number) => void
  onError?: (message: string) => void
  /** Engine actually in use after any fallback (may differ from requested). */
  onEngineResolved?: (engineId: string) => void
  /** Fired only when all chunks finished naturally (not on stop/pause). */
  onComplete?: () => void
}

/**
 * Orchestrates read-aloud over a list of text chunks using a pluggable engine.
 * Owns sequencing, pause/resume/stop and per-chunk progress so engines stay
 * simple (speak one chunk, stop). If the requested engine fails to initialize
 * (e.g. Supertonic assets missing), it transparently falls back to the default.
 */
export class TtsController {
  private engine: TtsEngine | null = null
  private engineId = ''
  private chunks: string[] = []
  private index = 0
  private status: TtsStatus = 'idle'
  private options: SpeakOptions = { rate: 1, pitch: 1 }
  private initPromise: Promise<string> | null = null
  private initForId = ''

  constructor(private readonly events: TtsControllerEvents = {}) {}

  getStatus(): TtsStatus {
    return this.status
  }

  getCurrentIndex(): number {
    return this.index
  }

  /** Load (and if needed, fall back) the engine identified by `id`. */
  async useEngine(id: string): Promise<string> {
    if (this.engineId === id && this.engine?.isReady()) return id
    // Deduplicate concurrent calls for the same engine (e.g. the eager-init
    // effect and a play() call racing each other).
    if (this.initPromise && this.initForId === id) return this.initPromise
    this.engine?.dispose()
    this.engine = null
    this.initForId = id
    this.setStatus('loading')
    this.initPromise = this.initEngineWithFallback(id)
      .then((resolved) => {
        this.engineId = resolved
        this.setStatus('idle')
        this.events.onEngineResolved?.(resolved)
        return resolved
      })
      .catch((err: unknown) => {
        this.setStatus('idle')
        throw err
      })
      .finally(() => { this.initPromise = null })
    return this.initPromise
  }

  /** Begin reading the supplied chunks from `startIndex`. */
  async play(
    chunks: string[],
    options: SpeakOptions,
    startIndex = 0,
  ): Promise<void> {
    if (!this.engine?.isReady()) {
      try {
        await this.useEngine(this.engineId || DEFAULT_ENGINE_ID)
      } catch {
        return // onError already reported via events
      }
    }
    this.chunks = chunks
    this.index = Math.max(0, Math.min(startIndex, chunks.length - 1))
    this.options = options
    if (!chunks.length) return
    await this.run()
  }

  pause(): void {
    if (this.status !== 'playing') return
    this.setStatus('paused')
    this.engine?.stop()
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return
    await this.run()
  }

  stop(): void {
    this.engine?.stop()
    this.index = 0
    this.setStatus('idle')
  }

  setOptions(options: SpeakOptions): void {
    this.options = options
  }

  dispose(): void {
    this.engine?.dispose()
    this.engine = null
  }

  // --- internals ---

  private async run(): Promise<void> {
    if (!this.engine) return
    this.setStatus('playing')
    while (this.index < this.chunks.length) {
      // A pause/stop flips status; bail out of the loop if so.
      if (this.status !== 'playing') return
      this.events.onChunk?.(this.index)
      try {
        await this.engine.speak(this.chunks[this.index], this.options)
      } catch (error) {
        this.events.onError?.(getErrorMessage(error))
        this.setStatus('idle')
        return
      }
      if (this.status !== 'playing') return
      this.index += 1
    }
    this.index = 0
    this.setStatus('idle')
    this.events.onComplete?.()
  }

  private async initEngineWithFallback(id: string): Promise<string> {
    try {
      const engine = createTtsEngine(id)
      await engine.init()
      this.engine = engine
      return engine.id
    } catch (primary) {
      if (id === DEFAULT_ENGINE_ID) {
        this.events.onError?.(getErrorMessage(primary))
        throw primary
      }
      // Preferred engine unavailable — try the default silently.
      try {
        const fallback = createTtsEngine(DEFAULT_ENGINE_ID)
        await fallback.init()
        this.engine = fallback
        return fallback.id
      } catch (fallbackError) {
        this.events.onError?.(getErrorMessage(fallbackError))
        throw fallbackError
      }
    }
  }

  private setStatus(status: TtsStatus): void {
    this.status = status
    this.events.onStatus?.(status)
  }
}
