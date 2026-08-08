import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (data: unknown) => void

const listeners = new Map<string, Listener[]>()
const native = {
  isModelReady: vi.fn(async () => ({ ready: true })),
  speak: vi.fn(async () => undefined),
  stopPlayback: vi.fn(async () => undefined),
  addListener: vi.fn(async (event: string, listener: Listener) => {
    listeners.set(event, [...(listeners.get(event) ?? []), listener])
    return { remove: async () => undefined }
  }),
}

function emit(event: string, data: unknown = {}): void {
  for (const listener of listeners.get(event) ?? []) listener(data)
}

vi.mock('./kokoro/nativeBridge', () => ({
  hasNativeKokoro: () => true,
  KokoroNative: native,
}))

const { KokoroNativeEngine } = await import('./kokoroNativeEngine')

/** Resolves to true only if the promise settles within a macrotask. */
function settled(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 0)),
  ])
}

describe('KokoroNativeEngine.speak', () => {
  beforeEach(() => {
    listeners.clear()
    vi.clearAllMocks()
  })

  it('stays pending until the service reports completion', async () => {
    const engine = new KokoroNativeEngine()
    await engine.init()

    const speaking = engine.speak('hello', { rate: 1, pitch: 1, voiceId: 'af_bella' })
    expect(await settled(speaking)).toBe(false)

    emit('complete')
    expect(await settled(speaking)).toBe(true)
  })

  it('resolves an in-flight speak when stopped', async () => {
    const engine = new KokoroNativeEngine()
    await engine.init()

    const speaking = engine.speak('hello', { rate: 1, pitch: 1 })
    expect(await settled(speaking)).toBe(false)

    engine.stop()
    expect(await settled(speaking)).toBe(true)
    expect(native.stopPlayback).toHaveBeenCalled()
  })

  it('resolves an in-flight speak when the service errors', async () => {
    const engine = new KokoroNativeEngine()
    await engine.init()

    const speaking = engine.speak('hello', { rate: 1, pitch: 1 })
    emit('error', { message: 'boom' })

    expect(await settled(speaking)).toBe(true)
  })

  it('releases a preview when queue playback supersedes it', async () => {
    const engine = new KokoroNativeEngine()
    await engine.init()

    const speaking = engine.speak('preview', { rate: 1, pitch: 1 })
    await engine.playQueue(['a', 'b'], { rate: 1, pitch: 1 }, 0, {
      onChunk: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    })

    expect(await settled(speaking)).toBe(true)
  })
})

describe('KokoroNativeEngine notification sync', () => {
  beforeEach(() => {
    listeners.clear()
    vi.clearAllMocks()
  })

  it('forwards native state changes for the active queue', async () => {
    const engine = new KokoroNativeEngine()
    await engine.init()

    const onExternalStateChange = vi.fn()
    await engine.playQueue(['a'], { rate: 1, pitch: 1 }, 0, {
      onChunk: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
      onExternalStateChange,
    })

    emit('state', { playing: false })
    expect(onExternalStateChange).toHaveBeenCalledWith(false)

    emit('state', { playing: true })
    expect(onExternalStateChange).toHaveBeenCalledWith(true)
  })

  it('surfaces a notification skip as a notice instead of acting on it directly', async () => {
    const engine = new KokoroNativeEngine()
    await engine.init()
    const onNotice = vi.fn()
    engine.onNotice = onNotice

    emit('skip', { direction: 'next' })
    expect(onNotice).toHaveBeenCalledWith({ type: 'skip', direction: 'next' })

    emit('skip', { direction: 'prev' })
    expect(onNotice).toHaveBeenCalledWith({ type: 'skip', direction: 'prev' })
  })

  it('forwards title and cover art to the playback service', async () => {
    const engine = new KokoroNativeEngine()
    await engine.init()

    await engine.playQueue(
      ['a'],
      { rate: 1, pitch: 1, title: 'My Book', coverUrl: 'data:image/png;base64,AAA' },
      0,
      { onChunk: vi.fn(), onComplete: vi.fn(), onError: vi.fn() },
    )

    expect(native.speak).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Book', cover: 'data:image/png;base64,AAA' }),
    )
  })

  it('defaults the notification title when the reader gave none', async () => {
    const engine = new KokoroNativeEngine()
    await engine.init()

    await engine.playQueue(['a'], { rate: 1, pitch: 1 }, 0, {
      onChunk: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    })

    expect(native.speak).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Reading aloud', cover: undefined }),
    )
  })
})
