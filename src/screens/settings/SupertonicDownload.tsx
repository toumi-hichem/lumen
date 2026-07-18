import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { getErrorMessage } from '@/lib/result'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'
import { SUPERTONIC_SIZE_MB } from '@/tts/supertonic/assets'
import {
  installSupertonic,
  isSupertonicInstalled,
  removeSupertonic,
  type DownloadProgress,
} from '@/tts/supertonic/install'
import {
  hasNativeSupertonic,
  SupertonicNative,
  type NativeCpuTopology,
} from '@/tts/supertonic/nativeBridge'

type State = 'checking' | 'idle' | 'downloading' | 'installed' | 'error'

/** "182 / 400 MB" for the web byte stream, "3/16" for the native file counter. */
function describeProgress(p: DownloadProgress): string {
  if (p.unit !== 'bytes') return `${p.done}/${p.total}`
  const mb = (n: number) => Math.round(n / 1024 / 1024)
  return `${mb(p.done)} / ${mb(p.total)} MB`
}

/** "2 fast + 6 efficiency cores · 2 threads · quality starts at 6/8" */
function describeTuning(t: NativeCpuTopology): string {
  const [fast, ...rest] = t.clusters
  const eff = rest.reduce((sum, c) => sum + c.cores, 0)
  const cores =
    eff > 0
      ? `${fast.cores} fast + ${eff} efficiency cores`
      : `${t.totalCores} cores`
  return `${cores} · ${t.threads} thread${t.threads === 1 ? '' : 's'} · quality starts at ${t.initialSteps}/8`
}

/**
 * Download / manage the on-device Supertonic voice. Assets are large
 * (~400 MB) and fetched on demand, then cached for offline use. Storage and
 * network failures are surfaced with a clear, actionable message.
 */
interface SupertonicDownloadProps {
  /** Fired when the install state changes, so the engine picker can re-probe. */
  onInstallChange?: () => void
}

export function SupertonicDownload({ onInstallChange }: SupertonicDownloadProps) {
  const setTts = useSettingsStore((s) => s.setTts)
  const engineId = useSettingsStore((s) => s.tts.engineId)
  const [state, setState] = useState<State>('checking')
  const [progress, setProgress] = useState<DownloadProgress>({ done: 0, total: 0 })
  const [error, setError] = useState<string>()
  const [tuning, setTuning] = useState<string>()

  useEffect(() => {
    let active = true
    void isSupertonicInstalled().then((has) => {
      if (active) setState(has ? 'installed' : 'idle')
    })
    return () => {
      active = false
    }
  }, [])

  // Purely informational: how the native engine tuned itself to this CPU.
  useEffect(() => {
    if (state !== 'installed' || !hasNativeSupertonic()) return
    let active = true
    SupertonicNative.getCpuTopology()
      .then((topology) => {
        if (active) setTuning(describeTuning(topology))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [state])

  const download = async () => {
    setError(undefined)
    setState('downloading')
    setProgress({ done: 0, total: 0 })
    try {
      await installSupertonic((p) => setProgress(p))
      setState('installed')
      onInstallChange?.()
      // The user opted in: make Supertonic the active, remembered engine.
      setTts({ engineId: 'supertonic', engineChosen: true })
    } catch (e) {
      setError(getErrorMessage(e))
      setState('error')
    }
  }

  const remove = async () => {
    await removeSupertonic()
    setState('idle')
    onInstallChange?.()
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
            {progress.total ? `${pct}% (${describeProgress(progress)})` : 'Starting…'}
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

      {state === 'installed' && tuning && (
        <small className="muted">Tuned for this device: {tuning}</small>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
