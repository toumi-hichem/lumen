import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./persist', () => ({
  loadJson: vi.fn(async (_key: string, fallback: unknown) => fallback),
  saveJson: vi.fn(async () => undefined),
}))

import { defaultSettings, useSettingsStore } from './settingsStore'

describe('settingsStore TTS voice memory', () => {
  beforeEach(() => {
    useSettingsStore.setState({ ...defaultSettings, hydrated: false })
  })

  it('records the picked voice under the active engine', () => {
    const { setTts } = useSettingsStore.getState()
    setTts({ engineId: 'supertonic' })
    setTts({ voiceId: 'F2' })

    const tts = useSettingsStore.getState().tts
    expect(tts.voiceId).toBe('F2')
    expect(tts.voiceByEngine.supertonic).toBe('F2')
  })

  it('restores the last voice when switching back to an engine', () => {
    const { setTts } = useSettingsStore.getState()
    setTts({ engineId: 'supertonic' })
    setTts({ voiceId: 'M3' })
    setTts({ engineId: 'native-tts' })
    setTts({ voiceId: '7' })

    setTts({ engineId: 'supertonic' })
    expect(useSettingsStore.getState().tts.voiceId).toBe('M3')

    setTts({ engineId: 'native-tts' })
    expect(useSettingsStore.getState().tts.voiceId).toBe('7')
  })

  it('falls back to the default voice for an engine never used before', () => {
    const { setTts } = useSettingsStore.getState()
    setTts({ voiceId: 'some-web-voice' })
    setTts({ engineId: 'supertonic' })

    expect(useSettingsStore.getState().tts.voiceId).toBe('')
  })

  it('keeps an explicit voice passed together with the engine', () => {
    const { setTts } = useSettingsStore.getState()
    setTts({ engineId: 'supertonic', voiceId: 'F5' })

    const tts = useSettingsStore.getState().tts
    expect(tts.voiceId).toBe('F5')
    expect(tts.voiceByEngine.supertonic).toBe('F5')
  })
})
