import type * as Ort from 'onnxruntime-web'
import {
  type OrtModule,
  type SupertonicConfig,
  Style,
  TextToSpeech,
  UnicodeProcessor,
} from './runtime'
import type { AssetSource } from './assets'

interface VoiceStyleJson {
  style_ttl: { dims: number[]; data: number[] }
  style_dp: { dims: number[]; data: number[] }
}

export async function loadCfgs(source: AssetSource): Promise<SupertonicConfig> {
  return source.readJson<SupertonicConfig>('onnx/tts.json')
}

export async function loadTextProcessor(
  source: AssetSource,
): Promise<UnicodeProcessor> {
  const indexer = await source.readJson<number[]>('onnx/unicode_indexer.json')
  return new UnicodeProcessor(indexer)
}

/** Load a single voice style into TTL/DP tensors. */
export async function loadVoiceStyle(
  ort: OrtModule,
  source: AssetSource,
  voiceId: string,
): Promise<Style> {
  const style = await source.readJson<VoiceStyleJson>(`voice_styles/${voiceId}.json`)
  const ttl = new ort.Tensor(
    'float32',
    Float32Array.from(style.style_ttl.data.flat(Infinity) as number[]),
    style.style_ttl.dims,
  )
  const dp = new ort.Tensor(
    'float32',
    Float32Array.from(style.style_dp.data.flat(Infinity) as number[]),
    style.style_dp.dims,
  )
  return new Style(ttl, dp)
}

/** Load all four ONNX sessions plus config and build the TextToSpeech engine. */
export async function loadTextToSpeech(
  ort: OrtModule,
  source: AssetSource,
  sessionOptions: Ort.InferenceSession.SessionOptions,
): Promise<{ tts: TextToSpeech; cfgs: SupertonicConfig }> {
  const cfgs = await loadCfgs(source)
  const create = async (file: string) => {
    const bytes = await source.readBytes(`onnx/${file}`)
    return ort.InferenceSession.create(bytes, sessionOptions)
  }

  const [dp, textEnc, vectorEst, vocoder] = await Promise.all([
    create('duration_predictor.onnx'),
    create('text_encoder.onnx'),
    create('vector_estimator.onnx'),
    create('vocoder.onnx'),
  ])
  const textProcessor = await loadTextProcessor(source)
  const tts = new TextToSpeech(ort, cfgs, textProcessor, dp, textEnc, vectorEst, vocoder)
  return { tts, cfgs }
}
