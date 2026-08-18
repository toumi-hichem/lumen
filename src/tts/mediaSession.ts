interface MediaSessionConfig {
  title: string
  artist?: string
  artwork?: MediaImage[]
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onNext: () => void
  onPrev: () => void
}

/**
 * Wire the platform Media Session (lock-screen / notification / headset
 * controls) to the TTS controller. No-op where unsupported. Returns a cleanup
 * that clears the handlers. On web and Android WebViews this drives the OS
 * media UI; true background audio on iOS needs a separate native audio session.
 */
export function setupMediaSession(config: MediaSessionConfig): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return () => {}
  }
  const ms = navigator.mediaSession

  ms.metadata = new MediaMetadata({
    title: config.title,
    artist: config.artist ?? 'Lumen',
    artwork: config.artwork,
  })

  const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
    ['play', config.onPlay],
    ['pause', config.onPause],
    ['stop', config.onStop],
    ['nexttrack', config.onNext],
    ['previoustrack', config.onPrev],
  ]
  for (const [action, handler] of handlers) {
    try {
      ms.setActionHandler(action, handler)
    } catch {
      // Some actions are unsupported on certain platforms; ignore.
    }
  }

  return () => {
    for (const [action] of handlers) {
      try {
        ms.setActionHandler(action, null)
      } catch {
        // ignore
      }
    }
  }
}

/** Reflect playback state in the OS media UI. */
export function setMediaPlaybackState(
  state: 'none' | 'paused' | 'playing',
): void {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state
  }
}

/**
 * Publish playback progress so the OS notification draws a progress bar; with
 * no duration it draws none at all. Speech engines expose no timeline, so
 * callers pass an estimate. Passing null clears the bar.
 */
export function setMediaPositionState(
  state: { durationSeconds: number; positionSeconds: number } | null,
): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  if (typeof ms.setPositionState !== 'function') return
  try {
    if (!state || !Number.isFinite(state.durationSeconds) || state.durationSeconds <= 0) {
      ms.setPositionState()
      return
    }
    ms.setPositionState({
      duration: state.durationSeconds,
      // The spec rejects a position past the duration.
      position: Math.min(Math.max(0, state.positionSeconds), state.durationSeconds),
      playbackRate: 1,
    })
  } catch {
    // Unsupported or rejected values; progress is cosmetic, never fatal.
  }
}

/**
 * Update the subtitle shown in the OS notification with the currently-spoken
 * line without re-registering all action handlers.
 */
export function updateMediaSessionLine(line: string): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  if (!ms.metadata) return
  ms.metadata = new MediaMetadata({
    title: ms.metadata.title,
    artist: line || (ms.metadata.artist ?? 'Lumen'),
    artwork: Array.from(ms.metadata.artwork ?? []),
  })
}
