import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/store/settingsStore'
import { getErrorMessage } from '@/lib/result'
import { Icon } from '@/ui/Icon'
import { icons } from '@/ui/icons'

type State = 'checking' | 'idle' | 'downloading' | 'installed' | 'error'

interface DownloadProgress {
  done: number
  total: number
  unit?: 'bytes' | 'files'
}

interface CpuTopologySummary {
  clusters: { cores: number; maxFreqKhz: number }[]
  totalCores: number
  threads: number
  /** Only engines with a denoising-steps quality knob (e.g. Supertonic) have this. */
  initialSteps?: number
}

/** "182 / 400 MB" for the web byte stream, "3/16" for the native file counter. */
function describeProgress(p: DownloadProgress): string {
  if (p.unit !== 'bytes') return `${p.done}/${p.total}`
  const mb = (n: number) => Math.round(n / 1024 / 1024)
  return `${mb(p.done)} / ${mb(p.total)} MB`
}

/** "2 fast + 6 efficiency cores · 2 threads[ · quality starts at 6/8]" */
function describeTuning(t: CpuTopologySummary): string {
  const [fast, ...rest] = t.clusters
  const eff = rest.reduce((sum, c) => sum + c.cores, 0)
  const cores =
    eff > 0
      ? `${fast.cores} fast + ${eff} efficiency cores`
      : `${t.totalCores} cores`
  const base = `${cores} · ${t.threads} thread${t.threads === 1 ? '' : 's'}`
  return t.initialSteps == null ? base : `${base} · quality starts at ${t.initialSteps}/8`
}

/**
 * Download / manage an on-device neural voice's assets. Generalized from the
 * original Supertonic-only widget so a second on-device engine (Kokoro) gets
 * the identical download/install/remove UX without duplicating this
 * component. Assets are large and fetched on demand, then cached for offline
 * use; storage and network failures are surfaced with an actionable message.
 */
export interface AssetEngineDownloadProps {
  engineId: string
  label: string
  sizeMb: number
  isInstalled: () => Promise<boolean>
  install: (onProgress: (p: DownloadProgress) => void) => Promise<void>
  remove: () => Promise<void>
  hasNative: () => boolean
  getCpuTopology?: () => Promise<CpuTopologySummary>
  /** Engine to fall back to when the user removes the currently active engine. */
  fallbackEngineId: string
  /** Fired when the install state changes, so the engine picker can re-probe. */
  onInstallChange?: () => void
}

export function AssetEngineDownload({
  engineId,
  label,
  sizeMb,
  isInstalled,
  install,
  remove,
  hasNative,
  getCpuTopology,
  fallbackEngineId,
  onInstallChange,
}: AssetEngineDownloadProps) {
  const setTts = useSettingsStore((s) => s.setTts)
  const activeEngineId = useSettingsStore((s) => s.tts.engineId)
  const [state, setState] = useState<State>('checking')
  const [progress, setProgress] = useState<DownloadProgress>({ done: 0, total: 0 })
  const [error, setError] = useState<string>()
  const [tuning, setTuning] = useState<string>()

  useEffect(() => {
    let active = true
    void isInstalled().then((has) => {
      if (active) setState(has ? 'installed' : 'idle')
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineId])

  // Purely informational: how the native engine tuned itself to this CPU.
  useEffect(() => {
    if (state !== 'installed' || !hasNative() || !getCpuTopology) return
    let active = true
    getCpuTopology()
      .then((topology) => {
        if (active) setTuning(describeTuning(topology))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const download = async () => {
    setError(undefined)
    setState('downloading')
    setProgress({ done: 0, total: 0 })
    try {
      await install((p) => setProgress(p))
      setState('installed')
      onInstallChange?.()
      // The user opted in: make this the active, remembered engine.
      setTts({ engineId, engineChosen: true })
    } catch (e) {
      setError(getErrorMessage(e))
      setState('error')
    }
  }

  const removeAssets = async () => {
    await remove()
    setState('idle')
    onInstallChange?.()
    if (activeEngineId === engineId) setTts({ engineId: fallbackEngineId, engineChosen: true })
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="supertonic-box">
      <div className="setting-row">
        <span>
          On-device voice ({label})
          <br />
          <small className="muted">
            ~{sizeMb} MB download, stored on your device for fully offline
            read-aloud.
          </small>
        </span>

        {state === 'checking' && <span className="muted">Checking…</span>}

        {state === 'idle' && (
          <button className="btn btn-primary" onClick={() => void download()}>
            <Icon path={icons.download} size={16} />
            Download (~{sizeMb} MB)
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
            <button className="btn" onClick={() => void removeAssets()}>
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
