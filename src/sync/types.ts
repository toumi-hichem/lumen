/**
 * Sync provider contract. The app talks to this interface only, so a cloud
 * backend (WebDAV, S3, a hosted endpoint) can be added later without touching
 * callers. The shipped implementation is file-based (manual export/import);
 * a network provider would implement the same three methods.
 *
 * Secrets (tokens, keys) must come from configuration/secret storage, never be
 * hardcoded — see the security guidelines.
 */
export interface SyncSnapshot {
  blob: Blob
  updatedAt: number
}

export interface SyncProvider {
  readonly id: string
  readonly name: string
  /** Push the current library snapshot to the remote/destination. */
  push(snapshot: SyncSnapshot): Promise<void>
  /** Pull the latest snapshot, or null if none exists. */
  pull(): Promise<SyncSnapshot | null>
  /** Whether this provider can run in the current environment. */
  isAvailable(): boolean
}
