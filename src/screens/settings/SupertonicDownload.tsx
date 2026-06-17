import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { getErrorMessage } from '@/lib/result'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import {
  clearSupertonic,
  downloadSupertonic,
  isSupertonicDownloaded,
  SUPERTONIC_MANIFEST,
  SUPERTONIC_SIZE_MB,
} from '@/tts/supertonic/assets'

type State = 'checking' | 'idle' | 'downloading' | 'installed' | 'error'

/**
 * Download / manage the on-device Supertonic voice. Assets are large
 * (~100 MB) and fetched on demand, then cached for offline use. Storage and
 * network failures are surfaced with a clear, actionable message.
 */
export function SupertonicDownload() {
  const setTts = useSettingsStore((s) => s.setTts)
  const engineId = useSettingsStore((s) => s.tts.engineId)
  const [state, setState] = useState<State>('checking')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string>()

  useEffect(() => {
    let active = true
    void isSupertonicDownloaded().then((has) => {
      if (active) setState(has ? 'installed' : 'idle')
    })
    return () => {
      active = false
    }
  }, [])

  const download = async () => {
    setError(undefined)
    setState('downloading')
    setProgress({ done: 0, total: SUPERTONIC_MANIFEST.length })
    try {
      await downloadSupertonic((p) => setProgress(p))
      setState('installed')
      // The user opted in: make Supertonic the active, remembered engine.
      setTts({ engineId: 'supertonic', engineChosen: true })
    } catch (e) {
      setError(getErrorMessage(e))
      setState('error')
    }
  }

  const remove = async () => {
    await clearSupertonic()
    setState('idle')
    if (engineId === 'supertonic') setTts({ engineId: 'web-speech', engineChosen: true })
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="supertonic-box">
      <div className="setting-row">
        <span>
          On-device voice (Supertonic)
          <br />
          <small className="muted">
            ~{SUPERTONIC_SIZE_MB} MB download, stored on your device for fully
            offline read-aloud.
          </small>
        </span>

        {state === 'checking' && <span className="muted">Checking…</span>}

        {state === 'idle' && (
          <button className="btn btn-primary" onClick={() => void download()}>
            <Icon path={icons.download} size={16} />
            Download (~{SUPERTONIC_SIZE_MB} MB)
          </button>
        )}

        {state === 'downloading' && (
          <span className="muted">
            {pct}% ({progress.done}/{progress.total})
          </span>
        )}

        {state === 'installed' && (
          <div className="supertonic-installed">
            <span className="installed-tag">
              <Icon path={icons.check} size={14} /> Installed
            </span>
            <button className="btn" onClick={() => void remove()}>
              Remove
            </button>
          </div>
        )}

        {state === 'error' && (
          <button className="btn btn-primary" onClick={() => void download()}>
            Retry
          </button>
        )}
      </div>

      {state === 'downloading' && (
        <div className="progress-track" aria-label="Download progress">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
