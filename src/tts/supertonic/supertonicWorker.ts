/**
 * Dedicated TTS worker hosting the Supertonic synthesizer, so ORT inference
 * never blocks the UI thread. This is OUR worker (a Vite-bundled same-origin
 * module worker), not ORT's internal proxy worker, which the Android WebView
 * failed to spawn. Messages are processed strictly in order; syntheses are
 * serialized through a promise chain because ORT sessions cannot run two
 * inferences concurrently.
 */
import { getErrorMessage } from '@/lib/result'
import { isSynthesisCancelled } from './runtime'
import { SupertonicSynthesizer, type SynthesizerOptions } from './synthesizer'

export interface WorkerInitMessage extends SynthesizerOptions {
  type: 'init'
}
export interface WorkerSynthesizeMessage {
  type: 'synthesize'
  id: number
  text: string
  voiceId: string
  rate: number
}
export interface WorkerCancelMessage {
  type: 'cancel'
}
export interface WorkerDisposeMessage {
  type: 'dispose'
}
export type WorkerRequest =
  | WorkerInitMessage
  | WorkerSynthesizeMessage
  | WorkerCancelMessage
  | WorkerDisposeMessage

export interface WorkerReadyMessage {
  type: 'ready'
  rtf: number
  steps: number
  sampleRate: number
  threads: number
}
export interface WorkerInitErrorMessage {
  type: 'init-error'
  message: string
}
export interface WorkerResultMessage {
  type: 'result'
  id: number
  samples: Float32Array
  sampleRate: number
}
export interface WorkerSynthErrorMessage {
  type: 'synth-error'
  id: number
  message: string
  cancelled: boolean
}
export type WorkerResponse =
  | WorkerReadyMessage
  | WorkerInitErrorMessage
  | WorkerResultMessage
  | WorkerSynthErrorMessage

const scope = self as unknown as Worker
const synthesizer = new SupertonicSynthesizer()
let queue: Promise<unknown> = Promise.resolve()

function post(message: WorkerResponse, transfer?: Transferable[]): void {
  if (transfer) scope.postMessage(message, transfer)
  else scope.postMessage(message)
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  switch (msg.type) {
    case 'init':
      void synthesizer
        .init({ steps: msg.steps, lang: msg.lang, wasmPaths: msg.wasmPaths })
        .then(
          (info) => post({ type: 'ready', ...info }),
          (error: unknown) =>
            post({ type: 'init-error', message: getErrorMessage(error) }),
        )
      break
    case 'synthesize':
      queue = queue.then(async () => {
        try {
          const { samples, sampleRate } = await synthesizer.synthesize(
            msg.text,
            msg.voiceId,
            msg.rate,
          )
          post({ type: 'result', id: msg.id, samples, sampleRate }, [
            samples.buffer,
          ])
        } catch (error) {
          post({
            type: 'synth-error',
            id: msg.id,
            message: getErrorMessage(error),
            cancelled: isSynthesisCancelled(error),
          })
        }
      })
      break
    case 'cancel':
      synthesizer.cancelPending()
      break
    case 'dispose':
      synthesizer.dispose()
      self.close()
      break
  }
}
