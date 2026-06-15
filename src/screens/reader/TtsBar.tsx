import type { TtsStatus } from '@/tts/controller'

interface TtsBarProps {
  status: TtsStatus
  engineId: string
  error?: string
  sleepMinutes: number | null
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onSetSleep: (minutes: number | null) => void
}

const SLEEP_OPTIONS = [0, 5, 15, 30, 45, 60]

/** Read-aloud transport controls shown at the bottom of the reader. */
export function TtsBar({
  status,
  engineId,
  error,
  sleepMinutes,
  onPlay,
  onPause,
  onResume,
  onStop,
  onSetSleep,
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

      {status !== 'idle' && (
        <select
          className="select"
          aria-label="Sleep timer"
          value={sleepMinutes ?? 0}
          onChange={(e) => onSetSleep(Number(e.target.value) || null)}
        >
          {SLEEP_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? 'No timer' : `${m} min`}
            </option>
          ))}
        </select>
      )}

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
