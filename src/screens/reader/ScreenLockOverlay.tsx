import { Lock, LockOpen } from 'lucide-react'
import { useRef, useState } from 'react'

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

const HOLD_MS = 800

export function ScreenLockOverlay({
  ttsActive,
  locked,
  onLock,
  onUnlock,
  sleepSecondsRemaining,
}: ScreenLockOverlayProps) {
  const [showHint, setShowHint] = useState(false)
  const holdRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hintRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const holdFiredRef = useRef(false)

  if (!ttsActive && !locked) return null

  const handlePointerDown = () => {
    holdFiredRef.current = false
    clearTimeout(holdRef.current)
    holdRef.current = setTimeout(() => {
      holdFiredRef.current = true
      setShowHint(false)
      onUnlock()
    }, HOLD_MS)
  }

  const handlePointerUp = () => {
    clearTimeout(holdRef.current)
    holdRef.current = undefined
    if (!holdFiredRef.current) {
      setShowHint(true)
      clearTimeout(hintRef.current)
      hintRef.current = setTimeout(() => setShowHint(false), 2000)
    }
  }

  const handlePointerCancel = () => {
    clearTimeout(holdRef.current)
    holdRef.current = undefined
  }

  return (
    <>
      {locked && (
        <div className="screen-lock-blocker">
          {sleepSecondsRemaining !== null && (
            <span className="screen-lock-timer">
              {formatTime(sleepSecondsRemaining)}
            </span>
          )}
        </div>
      )}

      <button
        className="screen-lock-btn"
        onClick={locked ? undefined : onLock}
        onPointerDown={locked ? handlePointerDown : undefined}
        onPointerUp={locked ? handlePointerUp : undefined}
        onPointerLeave={locked ? handlePointerCancel : undefined}
        onPointerCancel={locked ? handlePointerCancel : undefined}
        aria-label={locked ? 'Hold to unlock' : 'Lock screen'}
      >
        {locked ? <Lock size={16} /> : <LockOpen size={16} />}
      </button>

      {locked && showHint && (
        <div className="screen-lock-hint">Hold to unlock</div>
      )}
    </>
  )
}
