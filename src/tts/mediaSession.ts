interface MediaSessionConfig {
  title: string
  artist?: string
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
