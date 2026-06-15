import type * as Ort from 'onnxruntime-web'
import {
  type OrtModule,
  type SupertonicConfig,
  Style,
  TextToSpeech,
  UnicodeProcessor,
} from './runtime'

interface VoiceStyleJson {
  style_ttl: { dims: number[]; data: number[] }
  style_dp: { dims: number[]; data: number[] }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`)
  return (await response.json()) as T
}

export async function loadCfgs(onnxDir: string): Promise<SupertonicConfig> {
  return fetchJson<SupertonicConfig>(`${onnxDir}/tts.json`)
}

export async function loadTextProcessor(
  onnxDir: string,
): Promise<UnicodeProcessor> {
  const indexer = await fetchJson<number[]>(`${onnxDir}/unicode_indexer.json`)
  return new UnicodeProcessor(indexer)
}

/** Load a single voice style JSON into TTL/DP tensors. */
export async function loadVoiceStyle(
  ort: OrtModule,
  voiceStylePath: string,
): Promise<Style> {
  const style = await fetchJson<VoiceStyleJson>(voiceStylePath)
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
  onnxDir: string,
  sessionOptions: Ort.InferenceSession.SessionOptions,
): Promise<{ tts: TextToSpeech; cfgs: SupertonicConfig }> {
  const cfgs = await loadCfgs(onnxDir)
  const create = (file: string) =>
    ort.InferenceSession.create(`${onnxDir}/${file}`, sessionOptions)

  const [dp, textEnc, vectorEst, vocoder] = await Promise.all([
    create('duration_predictor.onnx'),
    create('text_encoder.onnx'),
    create('vector_estimator.onnx'),
    create('vocoder.onnx'),
  ])
  const textProcessor = await loadTextProcessor(onnxDir)
  const tts = new TextToSpeech(ort, cfgs, textProcessor, dp, textEnc, vectorEst, vocoder)
  return { tts, cfgs }
}
