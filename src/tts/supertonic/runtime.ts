/*
 * Supertonic on-device TTS runtime.
 *
 * Ported to TypeScript from the official Supertonic web example (helper.js),
 * which is MIT-licensed:
 *   https://github.com/supertone-inc/supertonic/blob/main/web/helper.js
 *
 * The model files (duration_predictor / text_encoder / vector_estimator /
 * vocoder .onnx, plus tts.json, unicode_indexer.json and voice_styles/*.json)
 * are downloaded from a configurable base path and run via onnxruntime-web.
 * The `ort` module is injected (dynamically imported by the engine) so this
 * file adds nothing to the main bundle until Supertonic is actually selected.
 */
import type * as Ort from 'onnxruntime-web'

export type OrtModule = typeof import('onnxruntime-web')

export const AVAILABLE_LANGS = [
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi',
  'fr', 'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro',
  'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na',
] as const

export type SupportedLang = (typeof AVAILABLE_LANGS)[number]

export function isValidLang(lang: string): lang is SupportedLang {
  return (AVAILABLE_LANGS as readonly string[]).includes(lang)
}

export interface SupertonicConfig {
  ae: { sample_rate: number; base_chunk_size: number }
  ttl: { chunk_compress_factor: number; latent_dim: number }
}

interface ProcessedText {
  textIds: number[][]
  textMask: number[][][]
}

/** Unicode text processor: normalize text and map code points to model ids. */
export class UnicodeProcessor {
  constructor(private readonly indexer: number[]) {}

  call(textList: string[], langList: string[]): ProcessedText {
    const processed = textList.map((t, i) => this.preprocessText(t, langList[i]))
    const lengths = processed.map((t) => t.length)
    const maxLen = Math.max(...lengths)

    const textIds = processed.map((text) => {
      const row = new Array<number>(maxLen).fill(0)
      for (let j = 0; j < text.length; j++) {
        const codePoint = text.codePointAt(j) ?? 0
        row[j] = codePoint < this.indexer.length ? this.indexer[codePoint] : -1
      }
      return row
    })

    return { textIds, textMask: this.lengthToMask(lengths, maxLen) }
  }

  preprocessText(input: string, lang: string): string {
    let text = input.normalize('NFKD')

    const emojiPattern =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu
    text = text.replace(emojiPattern, '')

    const replacements: Record<string, string> = {
      '–': '-', '‑': '-', '—': '-', '_': ' ',
      '“': '"', '”': '"', '‘': "'", '’': "'",
      '´': "'", '`': "'", '[': ' ', ']': ' ', '|': ' ', '/': ' ',
      '#': ' ', '→': ' ', '←': ' ',
    }
    for (const [k, v] of Object.entries(replacements)) text = text.replaceAll(k, v)

    text = text.replace(/[♥☆♡©\\]/g, '')

    const exprReplacements: Record<string, string> = {
      '@': ' at ', 'e.g.,': 'for example, ', 'i.e.,': 'that is, ',
    }
    for (const [k, v] of Object.entries(exprReplacements)) text = text.replaceAll(k, v)

    text = text
      .replace(/ ,/g, ',').replace(/ \./g, '.').replace(/ !/g, '!')
      .replace(/ \?/g, '?').replace(/ ;/g, ';').replace(/ :/g, ':')
      .replace(/ '/g, "'")

    while (text.includes('""')) text = text.replace('""', '"')
    while (text.includes("''")) text = text.replace("''", "'")
    while (text.includes('``')) text = text.replace('``', '`')

    text = text.replace(/\s+/g, ' ').trim()

    if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(text)) text += '.'

    if (!isValidLang(lang)) {
      throw new Error(
        `Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(', ')}`,
      )
    }
    return `<${lang}>${text}</${lang}>`
  }

  private lengthToMask(lengths: number[], maxLen: number): number[][][] {
    return lengths.map((len) => {
      const row = new Array<number>(maxLen).fill(0)
      for (let j = 0; j < Math.min(len, maxLen); j++) row[j] = 1
      return [row]
    })
  }
}

/** Holds the per-voice TTL and DP style tensors. */
export class Style {
  constructor(
    readonly ttl: Ort.Tensor,
    readonly dp: Ort.Tensor,
  ) {}
}

interface InferResult {
  wav: number[]
  duration: number[]
}

export class TextToSpeech {
  readonly sampleRate: number

  constructor(
    private readonly ort: OrtModule,
    private readonly cfgs: SupertonicConfig,
    private readonly textProcessor: UnicodeProcessor,
    private readonly dpOrt: Ort.InferenceSession,
    private readonly textEncOrt: Ort.InferenceSession,
    private readonly vectorEstOrt: Ort.InferenceSession,
    private readonly vocoderOrt: Ort.InferenceSession,
  ) {
    this.sampleRate = cfgs.ae.sample_rate
  }

  /** Synthesize one (already-chunked) utterance into mono float32 PCM. */
  async call(
    text: string,
    lang: string,
    style: Style,
    totalStep: number,
    speed = 1.05,
  ): Promise<InferResult> {
    if (style.ttl.dims[0] !== 1) {
      throw new Error('Single-speaker TTS only supports a single style')
    }
    return this.infer([text], [lang], style, totalStep, speed)
  }

  private async infer(
    textList: string[],
    langList: string[],
    style: Style,
    totalStep: number,
    speed: number,
  ): Promise<InferResult> {
    const { Tensor } = this.ort
    const bsz = textList.length
    const { textIds, textMask } = this.textProcessor.call(textList, langList)

    const textIdsTensor = new Tensor(
      'int64',
      BigInt64Array.from(textIds.flat().map((x) => BigInt(x))),
      [bsz, textIds[0].length],
    )
    const textMaskTensor = new Tensor(
      'float32',
      Float32Array.from(textMask.flat(2)),
      [bsz, 1, textMask[0][0].length],
    )

    const dpOutputs = await this.dpOrt.run({
      text_ids: textIdsTensor,
      style_dp: style.dp,
      text_mask: textMaskTensor,
    })
    const duration = Array.from(dpOutputs.duration.data as Float32Array).map(
      (d) => d / speed,
    )

    const textEncOutputs = await this.textEncOrt.run({
      text_ids: textIdsTensor,
      style_ttl: style.ttl,
      text_mask: textMaskTensor,
    })
    const textEmb = textEncOutputs.text_emb

    const sampled = this.sampleNoisyLatent(
      duration,
      this.sampleRate,
      this.cfgs.ae.base_chunk_size,
      this.cfgs.ttl.chunk_compress_factor,
      this.cfgs.ttl.latent_dim,
    )
    let xt = sampled.xt
    const latentMask = sampled.latentMask

    const latentMaskTensor = new Tensor(
      'float32',
      Float32Array.from(latentMask.flat(2)),
      [bsz, 1, latentMask[0][0].length],
    )
    const totalStepTensor = new Tensor(
      'float32',
      new Float32Array(bsz).fill(totalStep),
      [bsz],
    )

    for (let step = 0; step < totalStep; step++) {
      const currentStepTensor = new Tensor(
        'float32',
        new Float32Array(bsz).fill(step),
        [bsz],
      )
      const xtTensor = new Tensor(
        'float32',
        Float32Array.from(xt.flat(2)),
        [bsz, xt[0].length, xt[0][0].length],
      )

      const out = await this.vectorEstOrt.run({
        noisy_latent: xtTensor,
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMaskTensor,
        text_mask: textMaskTensor,
        current_step: currentStepTensor,
        total_step: totalStepTensor,
      })

      const denoised = Array.from(out.denoised_latent.data as Float32Array)
      const latentDim = xt[0].length
      const latentLen = xt[0][0].length
      xt = reshape3d(denoised, bsz, latentDim, latentLen)
    }

    const finalXtTensor = new Tensor(
      'float32',
      Float32Array.from(xt.flat(2)),
      [bsz, xt[0].length, xt[0][0].length],
    )
    const vocoderOutputs = await this.vocoderOrt.run({ latent: finalXtTensor })
    const wav = Array.from(vocoderOutputs.wav_tts.data as Float32Array)

    return { wav, duration }
  }

  private sampleNoisyLatent(
    duration: number[],
    sampleRate: number,
    baseChunkSize: number,
    chunkCompress: number,
    latentDim: number,
  ): { xt: number[][][]; latentMask: number[][][] } {
    const bsz = duration.length
    const maxDur = Math.max(...duration)
    const wavLenMax = Math.floor(maxDur * sampleRate)
    const wavLengths = duration.map((d) => Math.floor(d * sampleRate))

    const chunkSize = baseChunkSize * chunkCompress
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize)
    const latentDimVal = latentDim * chunkCompress

    const xt: number[][][] = []
    for (let b = 0; b < bsz; b++) {
      const batch: number[][] = []
      for (let d = 0; d < latentDimVal; d++) {
        const row: number[] = []
        for (let t = 0; t < latentLen; t++) {
          // Box-Muller transform for standard-normal noise.
          const u1 = Math.max(0.0001, Math.random())
          const u2 = Math.random()
          row.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2))
        }
        batch.push(row)
      }
      xt.push(batch)
    }

    const latentLengths = wavLengths.map((len) =>
      Math.floor((len + chunkSize - 1) / chunkSize),
    )
    const latentMask = this.lengthToMask(latentLengths, latentLen)

    for (let b = 0; b < bsz; b++) {
      for (let d = 0; d < latentDimVal; d++) {
        for (let t = 0; t < latentLen; t++) xt[b][d][t] *= latentMask[b][0][t]
      }
    }
    return { xt, latentMask }
  }

  private lengthToMask(lengths: number[], maxLen: number): number[][][] {
    return lengths.map((len) => {
      const row = new Array<number>(maxLen).fill(0)
      for (let j = 0; j < Math.min(len, maxLen); j++) row[j] = 1
      return [row]
    })
  }
}

function reshape3d(
  flat: number[],
  bsz: number,
  dim: number,
  len: number,
): number[][][] {
  const out: number[][][] = []
  let idx = 0
  for (let b = 0; b < bsz; b++) {
    const batch: number[][] = []
    for (let d = 0; d < dim; d++) {
      const row: number[] = []
      for (let t = 0; t < len; t++) row.push(flat[idx++])
      batch.push(row)
    }
    out.push(batch)
  }
  return out
}
