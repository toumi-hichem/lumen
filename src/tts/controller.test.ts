import { describe, expect, it, vi } from 'vitest'
import { TtsController } from './controller'
import { registerTtsEngine } from './registry'
import type { SpeakOptions, TtsEngine, TtsQueueEvents } from './types'

/** Records spoken chunks and resolves immediately, for deterministic tests. */
class FakeEngine implements TtsEngine {
  readonly id = 'fake-ok'
  readonly name = 'Fake'
  readonly requiresAssets = false
  spoken: string[] = []
  private ready = false
  async init(): Promise<void> {
    this.ready = true
  }
  isReady(): boolean {
    return this.ready
  }
  async listVoices() {
    return []
  }
  prefetched: string[] = []
  async speak(text: string, _options: SpeakOptions): Promise<void> {
    this.spoken.push(text)
  }
  prefetch(text: string, _options: SpeakOptions): void {
    this.prefetched.push(text)
  }
  stop(): void {}
  dispose(): void {}
}

let lastEngine: FakeEngine | null = null
registerTtsEngine({
  id: 'fake-ok',
  name: 'Fake',
  requiresAssets: false,
  factory: () => {
    lastEngine = new FakeEngine()
    return lastEngine
  },
  available: () => true,
})

/** Engine whose speak() stays pending until resolved, to test mid-playback
 *  behaviour (voice changes, interrupts). stop() resolves in-flight speech
 *  like the real engines do. */
class ManualEngine implements TtsEngine {
  readonly id = 'fake-manual'
  readonly name = 'Manual'
  readonly requiresAssets = false
  spoken: Array<{ text: string; voiceId?: string }> = []
  private resolvers: Array<() => void> = []
  private ready = false
  async init(): Promise<void> {
    this.ready = true
  }
  isReady(): boolean {
    return this.ready
  }
  async listVoices() {
    return []
  }
  speak(text: string, options: SpeakOptions): Promise<void> {
    this.spoken.push({ text, voiceId: options.voiceId })
    return new Promise<void>((resolve) => this.resolvers.push(resolve))
  }
  finishCurrent(): void {
    this.resolvers.shift()?.()
  }
  stop(): void {
    for (const resolve of this.resolvers.splice(0)) resolve()
  }
  dispose(): void {}
}

let lastManualEngine: ManualEngine | null = null
registerTtsEngine({
  id: 'fake-manual',
  name: 'Manual',
  requiresAssets: false,
  factory: () => {
    lastManualEngine = new ManualEngine()
    return lastManualEngine
  },
  available: () => true,
})

/** Engine whose playback the controller hands over wholesale, like the
 *  native Supertonic queue path — for testing queueMode-specific behaviour. */
class QueueEngine implements TtsEngine {
  readonly id = 'fake-queue'
  readonly name = 'Queue'
  readonly requiresAssets = false
  events: TtsQueueEvents | null = null
  private ready = false
  async init(): Promise<void> {
    this.ready = true
  }
  isReady(): boolean {
    return this.ready
  }
  async listVoices() {
    return []
  }
  async speak(): Promise<void> {}
  stop(): void {}
  async playQueue(
    _chunks: string[],
    _options: SpeakOptions,
    _startIndex: number,
    events: TtsQueueEvents,
  ): Promise<void> {
    this.events = events
  }
  pauseQueue(): void {}
  resumeQueue(): void {}
  dispose(): void {}
}

let lastQueueEngine: QueueEngine | null = null
registerTtsEngine({
  id: 'fake-queue',
  name: 'Queue',
  requiresAssets: false,
  factory: () => {
    lastQueueEngine = new QueueEngine()
    return lastQueueEngine
  },
  available: () => true,
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const opts: SpeakOptions = { rate: 1, pitch: 1 }

describe('TtsController', () => {
  it('speaks every chunk in order and returns to idle', async () => {
    const onChunk = vi.fn()
    const controller = new TtsController({ onChunk })
    await controller.useEngine('fake-ok')
    await controller.play(['one', 'two', 'three'], opts)

    expect(lastEngine?.spoken).toEqual(['one', 'two', 'three'])
    expect(onChunk).toHaveBeenCalledTimes(3)
    expect(controller.getStatus()).toBe('idle')
  })

  it('prefetches upcoming chunks (depth 2) to pipeline synthesis', async () => {
    const controller = new TtsController({})
    await controller.useEngine('fake-ok')
    await controller.play(['one', 'two', 'three'], opts)

    // Every chunk after the first is prefetched while a prior one plays.
    // Depth-2 lookahead may request the same chunk more than once; the
    // engine's cache dedupes, so only coverage and order matter here.
    expect(lastEngine?.prefetched[0]).toBe('two')
    expect(new Set(lastEngine?.prefetched)).toEqual(new Set(['two', 'three']))
  })

  it('resolves the active engine id after loading', async () => {
    const onEngineResolved = vi.fn()
    const controller = new TtsController({ onEngineResolved })
    const resolved = await controller.useEngine('fake-ok')
    expect(resolved).toBe('fake-ok')
    // No fallback occurred, so the second (info) argument is undefined.
    expect(onEngineResolved).toHaveBeenCalledWith('fake-ok', undefined)
  })

  it('reports playing status while reading', async () => {
    const statuses: string[] = []
    const controller = new TtsController({ onStatus: (s) => statuses.push(s) })
    await controller.useEngine('fake-ok')
    await controller.play(['a'], opts)
    expect(statuses).toContain('playing')
    expect(statuses.at(-1)).toBe('idle')
  })

  it('restarts the current chunk immediately on a voice change', async () => {
    const controller = new TtsController({})
    await controller.useEngine('fake-manual')
    const engine = lastManualEngine as ManualEngine

    const playing = controller.play(['one', 'two'], opts)
    await tick()
    expect(engine.spoken).toEqual([{ text: 'one', voiceId: undefined }])

    // Change the voice mid-sentence: the current chunk restarts with the new
    // voice, and the superseded run loop must not double-speak or skip.
    controller.setOptions({ rate: 1, pitch: 1, voiceId: 'B' })
    await tick()
    expect(engine.spoken).toEqual([
      { text: 'one', voiceId: undefined },
      { text: 'one', voiceId: 'B' },
    ])

    engine.finishCurrent()
    await tick()
    engine.finishCurrent()
    await tick()
    await playing

    expect(engine.spoken).toEqual([
      { text: 'one', voiceId: undefined },
      { text: 'one', voiceId: 'B' },
      { text: 'two', voiceId: 'B' },
    ])
    expect(controller.getStatus()).toBe('idle')
  })

  it('does not restart when options are unchanged', async () => {
    const controller = new TtsController({})
    await controller.useEngine('fake-manual')
    const engine = lastManualEngine as ManualEngine

    void controller.play(['one'], opts)
    await tick()
    controller.setOptions({ ...opts })
    await tick()
    expect(engine.spoken).toEqual([{ text: 'one', voiceId: undefined }])
    engine.finishCurrent()
  })
})

describe('TtsController queue-mode external state sync', () => {
  // The bug this covers: a tap on the native notification's own Play/Pause
  // button (or an audio-focus loss) changes playback directly in the engine,
  // bypassing pause()/resume(). Without this reconciliation the in-app
  // button and the notification would show contradictory states.
  it('reconciles status when the engine reports an external pause/resume', async () => {
    const statuses: string[] = []
    const controller = new TtsController({ onStatus: (s) => statuses.push(s) })
    await controller.useEngine('fake-queue')
    void controller.play(['one'], opts)
    await tick()
    const engine = lastQueueEngine as QueueEngine

    engine.events?.onExternalStateChange?.(false)
    expect(controller.getStatus()).toBe('paused')

    engine.events?.onExternalStateChange?.(true)
    expect(controller.getStatus()).toBe('playing')
  })

  it('ignores an external state change once the queue has already ended', async () => {
    const controller = new TtsController({})
    await controller.useEngine('fake-queue')
    void controller.play(['one'], opts)
    await tick()
    const engine = lastQueueEngine as QueueEngine

    engine.events?.onComplete()
    expect(controller.getStatus()).toBe('idle')

    engine.events?.onExternalStateChange?.(false)
    expect(controller.getStatus()).toBe('idle')
  })
})
