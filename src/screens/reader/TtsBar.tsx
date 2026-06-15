import type { TtsStatus } from '@/tts/controller'

interface TtsBarProps {
  status: TtsStatus
  engineId: string
  error?: string
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

/** Read-aloud transport controls shown at the bottom of the reader. */
export function TtsBar({
  status,
  engineId,
  error,
  onPlay,
  onPause,
  onResume,
  onStop,
}: TtsBarProps) {
  const label =
    error ??
    {
      idle: 'Read aloud',
      loading: 'Loading voice…',
      playing: `Reading (${engineId})`,
      paused: 'Paused',
    }[status]

  return (
    <div className="tts-bar">
      <span className="tts-label">{label}</span>

      {status === 'idle' && (
        <button className="btn btn-primary" onClick={onPlay}>
          ▶ Listen
        </button>
      )}
      {status === 'loading' && (
        <button className="btn" disabled>
          …
        </button>
      )}
      {status === 'playing' && (
        <button className="btn" onClick={onPause}>
          ⏸ Pause
        </button>
      )}
      {status === 'paused' && (
        <button className="btn btn-primary" onClick={onResume}>
          ▶ Resume
        </button>
      )}
      {status !== 'idle' && status !== 'loading' && (
        <button className="btn" onClick={onStop}>
          ⏹ Stop
        </button>
      )}
    </div>
  )
}
