/*
 * Kokoro on-device TTS runtime: phonemize -> tokenize -> single ONNX graph
 * run -> waveform. Unlike Supertonic's 4-session iterative-denoising
 * pipeline (see ../supertonic/runtime.ts), Kokoro (StyleTextToSpeech2) is one
 * graph: `input_ids` (phoneme token ids, wrapped with the pad token),
 * `style` (a 256-dim vector picked from the voice's style bank by phoneme
 * length) and `speed` in, a 24kHz mono waveform out. There is no
 * steps/quality knob to adapt at runtime.
 */
import type * as Ort from 'onnxruntime-web'
import { createEnglishG2P, type LexiconDict } from './g2p'
import { phonemesToTokenIds } from './vocab'

export type OrtModule = typeof import('onnxruntime-web')

export const SAMPLE_RATE = 24000
/** Style bank layout: one 256-dim row per phoneme-count bucket, 0..509. */
const STYLE_DIM = 256
const MAX_STYLE_INDEX = 509

/** Thrown when a stop request interrupts an in-flight synthesis. */
export class SynthesisCancelledError extends Error {
  constructor() {
    super('Synthesis cancelled')
    this.name = 'SynthesisCancelledError'
  }
}

export function isSynthesisCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'SynthesisCancelledError'
}

export interface Lexicons {
  gold: LexiconDict
  silver: LexiconDict
}

interface InferResult {
  wav: Float32Array
  duration: number
}

/** Picks the style row matching this phoneme-token count, per the model's own convention. */
function styleFor(bank: Float32Array, tokenCount: number): Float32Array {
  const index = Math.min(Math.max(tokenCount - 2, 0), MAX_STYLE_INDEX)
  const offset = index * STYLE_DIM
  return bank.subarray(offset, offset + STYLE_DIM)
}

export class KokoroModel {
  readonly sampleRate = SAMPLE_RATE
  private readonly g2p: ReturnType<typeof createEnglishG2P>

  constructor(
    private readonly ort: OrtModule,
    private readonly session: Ort.InferenceSession,
    lexicons: Lexicons,
  ) {
    this.g2p = createEnglishG2P(lexicons.gold, lexicons.silver)
  }

  /** Phonemes for a chunk, for callers that only need the text-processing half (e.g. warm-up). */
  phonemize(text: string): string {
    return this.g2p.phonemize(text)
  }

  async call(
    text: string,
    styleBank: Float32Array,
    speed: number,
    shouldCancel?: () => boolean,
  ): Promise<InferResult> {
    const { Tensor } = this.ort
    const phonemes = this.g2p.phonemize(text)
    const tokenIds = phonemesToTokenIds(phonemes)
    if (tokenIds.length <= 2) {
      // Nothing phonemized (e.g. an all-symbols/emoji chunk): silence rather
      // than feeding the graph an empty sequence.
      return { wav: new Float32Array(0), duration: 0 }
    }

    const idsTensor = new Tensor(
      'int64',
      BigInt64Array.from(tokenIds.map((id) => BigInt(id))),
      [1, tokenIds.length],
    )
    const style = styleFor(styleBank, tokenIds.length)
    const styleTensor = new Tensor('float32', Float32Array.from(style), [1, STYLE_DIM])
    const speedTensor = new Tensor('float32', Float32Array.from([speed]), [1])

    if (shouldCancel?.()) throw new SynthesisCancelledError()
    const outputs = await this.session.run({
      input_ids: idsTensor,
      style: styleTensor,
      speed: speedTensor,
    })
    if (shouldCancel?.()) throw new SynthesisCancelledError()

    const wav = outputs.waveform.data as Float32Array
    return { wav, duration: wav.length / this.sampleRate }
  }
}
