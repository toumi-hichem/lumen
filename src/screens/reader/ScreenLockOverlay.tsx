import { Lock, LockOpen } from 'lucide-react'

interface ScreenLockOverlayProps {
  ttsActive: boolean
  locked: boolean
  onLock: () => void
  onUnlock: () => void
  sleepSecondsRemaining: number | null
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function ScreenLockOverlay({
  ttsActive,
  locked,
  onLock,
  onUnlock,
  sleepSecondsRemaining,
}: ScreenLockOverlayProps) {
  if (!ttsActive && !locked) return null

  return (
    <>
      {!locked && (
        <button
          className="screen-lock-btn"
          onClick={onLock}
          aria-label="Lock screen"
        >
          <LockOpen size={16} />
        </button>
      )}
      {locked && (
        <div
          className="screen-lock-overlay"
          onClick={onUnlock}
          role="button"
          aria-label="Tap to unlock"
        >
          <div className="screen-lock-center">
            <Lock size={52} color="rgba(255,255,255,0.75)" strokeWidth={1.5} />
            {sleepSecondsRemaining !== null && (
              <span className="screen-lock-timer">
                {formatTime(sleepSecondsRemaining)}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
