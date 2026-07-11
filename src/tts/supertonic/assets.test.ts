// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  SUPERTONIC_MANIFEST,
  SUPERTONIC_REMOTE_BASE,
  supertonicRemoteUrl,
} from './assets'

describe('supertonic assets manifest', () => {
  it('lists all runtime files (6 onnx/config + 10 voice styles)', () => {
    expect(SUPERTONIC_MANIFEST).toHaveLength(16)
  })

  it('includes the four ONNX models and both config files', () => {
    for (const f of [
      'onnx/duration_predictor.onnx',
      'onnx/text_encoder.onnx',
      'onnx/vector_estimator.onnx',
      'onnx/vocoder.onnx',
      'onnx/tts.json',
      'onnx/unicode_indexer.json',
    ]) {
      expect(SUPERTONIC_MANIFEST).toContain(f)
    }
  })

  it('includes all ten voice styles', () => {
    const voices = SUPERTONIC_MANIFEST.filter((p) => p.startsWith('voice_styles/'))
    expect(voices).toHaveLength(10)
    expect(voices).toContain('voice_styles/M1.json')
    expect(voices).toContain('voice_styles/F5.json')
  })

  it('builds remote URLs under the configured base', () => {
    expect(supertonicRemoteUrl('onnx/tts.json')).toBe(
      `${SUPERTONIC_REMOTE_BASE}/onnx/tts.json`,
    )
  })

  it('points at the repo root, not a nonexistent assets/ subfolder', () => {
    // The HuggingFace repo serves onnx/ and voice_styles/ at its root; an
    // /assets segment 404s (regression guard).
    expect(SUPERTONIC_REMOTE_BASE).not.toMatch(/\/assets$/)
    expect(supertonicRemoteUrl('onnx/vocoder.onnx')).toBe(
      'https://huggingface.co/Supertone/supertonic-3/resolve/main/onnx/vocoder.onnx',
    )
  })

  it('uses Supertonic 3 weights (v1/v2 skip short inputs)', () => {
    expect(SUPERTONIC_REMOTE_BASE).toContain('/supertonic-3/')
  })
})
