import { getErrorMessage } from '@/lib/result'
import { createTtsEngine, fallbackEngineId } from './registry'
import type { SpeakOptions, TtsEngine, TtsEngineNotice } from './types'

export type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused'

export interface TtsControllerEvents {
  onStatus?: (status: TtsStatus) => void
  /** Index of the chunk currently being spoken (for highlight sync). */
  onChunk?: (index: number) => void
  onError?: (message: string) => void
  /**
   * Engine actually in use after any fallback (may differ from requested).
   * `info` is present only when the requested engine failed and we fell back,
   * carrying the original failure reason so the UI can explain it.
   */
  onEngineResolved?: (
    engineId: string,
    info?: { requested: string; reason: string },
  ) => void
  /** Fired only when all chunks finished naturally (not on stop/pause). */
  onComplete?: () => void
  /** Engine progress signals: model load start/finish (with timing) and
   *  per-chunk synthesis start. Drives "is anything happening?" UI. */
  onNotice?: (notice: TtsEngineNotice) => void
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
  /** True while an engine with native queue playback owns sequencing. */
  private queueMode = false
  /** Voice/rate changed while a queue was paused; re-hand it over on resume. */
  private queueOptionsStale = false
  /** Bumped whenever a new run loop starts; a stale loop exits instead of
   *  racing the one that superseded it (e.g. a voice-change restart). */
  private runToken = 0

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
      .then(({ id: resolved, reason }) => {
        this.engineId = resolved
        this.setStatus('idle')
        this.events.onEngineResolved?.(
          resolved,
          resolved !== id && reason ? { requested: id, reason } : undefined,
        )
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
        await this.useEngine(this.engineId || fallbackEngineId())
      } catch {
        return // onError already reported via events
      }
    }
    this.chunks = chunks
    this.index = Math.max(0, Math.min(startIndex, chunks.length - 1))
    this.options = options
    if (!chunks.length) return
    if (this.engine?.playQueue) {
      await this.runQueue()
      return
    }
    await this.run()
  }

  pause(): void {
    if (this.status !== 'playing') return
    this.setStatus('paused')
    if (this.queueMode) {
      void this.engine?.pauseQueue?.()
      return
    }
    this.engine?.stop()
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused') return
    if (this.queueMode) {
      if (this.queueOptionsStale) {
        this.queueOptionsStale = false
        // Options changed while paused; re-hand the queue with new options.
        await this.play(this.chunks, this.options, this.index)
        return
      }
      this.setStatus('playing')
      await this.engine?.resumeQueue?.()
      return
    }
    await this.run()
  }

  stop(): void {
    this.engine?.stop()
    this.index = 0
    this.queueMode = false
    this.setStatus('idle')
  }

  setOptions(options: SpeakOptions): void {
    const prev = this.options
    this.options = options
    if (options.voiceId === prev.voiceId && options.rate === prev.rate) return
    // Make a voice/rate change audible immediately: restart the current
    // sentence with the new options. Queue engines (the native service) get
    // the whole queue re-handed from the current index; chunk engines stop
    // the in-flight utterance and let a fresh run loop take over (the stale
    // loop exits via runToken instead of double-speaking).
    if (this.status === 'playing') {
      if (!this.queueMode) this.engine?.stop()
      void this.play(this.chunks, options, this.index)
    } else if (this.status === 'paused' && this.queueMode) {
      // Re-hand the queue on resume; a plain resumeQueue() would keep the
      // audio the native side already synthesized with the old voice.
      this.queueOptionsStale = true
    }
  }

  dispose(): void {
    this.engine?.dispose()
    this.engine = null
  }

  // --- internals ---

  /**
   * Hand the whole queue to an engine that owns playback natively (survives
   * WebView suspension). The controller mirrors progress from engine events.
   */
  private async runQueue(): Promise<void> {
    if (!this.engine?.playQueue) return
    this.queueMode = true
    this.setStatus('playing')
    try {
      await this.engine.playQueue(this.chunks, this.options, this.index, {
        onChunk: (index) => {
          this.index = index
          this.events.onChunk?.(index)
        },
        onComplete: () => {
          this.index = 0
          this.queueMode = false
          this.setStatus('idle')
          this.events.onComplete?.()
        },
        onError: (message) => {
          this.queueMode = false
          this.events.onError?.(message)
          this.setStatus('idle')
        },
      })
    } catch (error) {
      this.queueMode = false
      this.events.onError?.(getErrorMessage(error))
      this.setStatus('idle')
    }
  }

  private async run(): Promise<void> {
    if (!this.engine) return
    const token = ++this.runToken
    this.setStatus('playing')
    while (this.index < this.chunks.length) {
      // A pause/stop flips status, and a restart (voice change) bumps the
      // token; a superseded loop must exit without touching shared state.
      if (token !== this.runToken || this.status !== 'playing') return
      this.events.onChunk?.(this.index)
      // Start the current chunk first (this synchronously queues its synthesis),
      // then prefetch upcoming ones so neural engines render them during
      // playback and there's no gap between sentences. Order matters: queue
      // current before next so the current sentence is never delayed behind a
      // prefetch. Depth 2 keeps the pipeline full across short sentences.
      const speaking = this.engine.speak(this.chunks[this.index], this.options)
      for (const ahead of [1, 2]) {
        const upcoming = this.chunks[this.index + ahead]
        if (upcoming) this.engine.prefetch?.(upcoming, this.options)
      }
      try {
        await speaking
      } catch (error) {
        if (token !== this.runToken) return // superseded; not our error
        this.events.onError?.(getErrorMessage(error))
        this.setStatus('idle')
        return
      }
      if (token !== this.runToken || this.status !== 'playing') return
      this.index += 1
    }
    if (token !== this.runToken) return
    this.index = 0
    this.setStatus('idle')
    this.events.onComplete?.()
  }

  private async initEngineWithFallback(
    id: string,
  ): Promise<{ id: string; reason?: string }> {
    try {
      const engine = createTtsEngine(id)
      engine.onNotice = (notice) => this.events.onNotice?.(notice)
      await engine.init()
      this.engine = engine
      return { id: engine.id }
    } catch (primary) {
      const fallbackId = fallbackEngineId()
      const reason = getErrorMessage(primary)
      if (id === fallbackId) {
        this.events.onError?.(reason)
        throw primary
      }
      // Preferred engine unavailable — try the platform fallback, but keep the
      // reason so the UI can tell the user why their choice didn't load.
      try {
        const fallback = createTtsEngine(fallbackId)
        fallback.onNotice = (notice) => this.events.onNotice?.(notice)
        await fallback.init()
        this.engine = fallback
        return { id: fallback.id, reason }
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
