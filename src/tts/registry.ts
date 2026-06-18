import { Capacitor } from '@capacitor/core'
import { platform } from '@/lib/platform'
import { WebSpeechEngine } from './webSpeechEngine'
import { SupertonicEngine } from './supertonicEngine'
import { NativeTtsEngine } from './nativeTtsEngine'
import type { TtsEngine, TtsEngineDescriptor } from './types'

type EngineFactory = () => TtsEngine

interface RegisteredEngine {
  id: string
  name: string
  requiresAssets: boolean
  factory: EngineFactory
  /** Runtime availability check (feature detection). */
  available: () => boolean
}

/**
 * Registry of TTS engines. The Supertonic engine is the requested on-device
 * neural option; Web Speech is the always-available fallback. Adding a new
 * engine (cloud, native platform TTS, another model) is one entry here.
 */
const engines = new Map<string, RegisteredEngine>()

export function registerTtsEngine(entry: RegisteredEngine): void {
  engines.set(entry.id, entry)
}

registerTtsEngine({
  id: 'native-tts',
  name: 'Device Voice',
  requiresAssets: false,
  factory: () => new NativeTtsEngine(),
  available: () => Capacitor.isNativePlatform(),
})

registerTtsEngine({
  id: 'web-speech',
  name: 'System Voice',
  requiresAssets: false,
  factory: () => new WebSpeechEngine(),
  available: () => platform.hasSpeechSynthesis(),
})

registerTtsEngine({
  id: 'supertonic',
  name: 'Supertonic (on-device)',
  requiresAssets: true,
  factory: () => new SupertonicEngine(),
  // Needs WebAssembly at minimum; WebGPU is used when present.
  available: () => typeof WebAssembly !== 'undefined',
})

export const DEFAULT_ENGINE_ID = 'web-speech'

export function createTtsEngine(id: string): TtsEngine {
  const entry = engines.get(id) ?? engines.get(DEFAULT_ENGINE_ID)
  if (!entry) throw new Error('No TTS engine registered')
  return entry.factory()
}

export function listTtsEngines(): TtsEngineDescriptor[] {
  return [...engines.values()].map((e) => ({
    id: e.id,
    name: e.name,
    requiresAssets: e.requiresAssets,
    available: e.available(),
  }))
}
