import { describe, expect, it, vi } from 'vitest'
import { TtsController } from './controller'
import { registerTtsEngine } from './registry'
import type { SpeakOptions, TtsEngine } from './types'

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

  it('prefetches each upcoming chunk to pipeline synthesis', async () => {
    const controller = new TtsController({})
    await controller.useEngine('fake-ok')
    await controller.play(['one', 'two', 'three'], opts)

    // Every chunk after the first is prefetched while the prior one plays.
    expect(lastEngine?.prefetched).toEqual(['two', 'three'])
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
})
