import type * as Ort from 'onnxruntime-web'
import { KOKORO_MODEL_REL, type AssetSource } from './assets'
import type { LexiconDict } from './g2p'
import { type Lexicons, type OrtModule } from './runtime'

export async function loadLexicons(source: AssetSource): Promise<Lexicons> {
  const [gold, silver] = await Promise.all([
    source.readJson<LexiconDict>('lexicon/us_gold.json'),
    source.readJson<LexiconDict>('lexicon/us_silver.json'),
  ])
  return { gold, silver }
}

/** Per-voice style bank: 510 rows of 256 float32s, indexed by phoneme-token count. */
export async function loadVoiceBank(
  source: AssetSource,
  voiceId: string,
): Promise<Float32Array> {
  const bytes = await source.readBytes(`voices/${voiceId}.bin`)
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
}

export async function loadKokoroSession(
  ort: OrtModule,
  source: AssetSource,
  sessionOptions: Ort.InferenceSession.SessionOptions,
): Promise<Ort.InferenceSession> {
  const bytes = await source.readBytes(KOKORO_MODEL_REL)
  return ort.InferenceSession.create(bytes, sessionOptions)
}
