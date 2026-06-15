import { downloadBlob, exportBackup, importBackup } from '@/services/backup'
import type { SyncProvider, SyncSnapshot } from './types'

/**
 * Manual, file-based sync: "push" downloads a backup archive the user can move
 * anywhere (USB, cloud drive, AirDrop); "pull" prompts for an archive to
 * restore. This is the always-available baseline a networked provider can
 * later replace, implementing the same SyncProvider interface.
 */
export class FileSyncProvider implements SyncProvider {
  readonly id = 'file'
  readonly name = 'File (manual)'

  isAvailable(): boolean {
    return typeof document !== 'undefined'
  }

  async push(snapshot: SyncSnapshot): Promise<void> {
    downloadBlob(`lumen-backup-${snapshot.updatedAt}.zip`, snapshot.blob)
  }

  async pull(): Promise<SyncSnapshot | null> {
    const file = await pickFile('.zip,application/zip')
    if (!file) return null
    await importBackup(await file.arrayBuffer())
    return { blob: file, updatedAt: Date.now() }
  }
}

/** Convenience to produce a snapshot from the current library. */
export async function currentSnapshot(): Promise<SyncSnapshot> {
  return { blob: await exportBackup(), updatedAt: Date.now() }
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}
