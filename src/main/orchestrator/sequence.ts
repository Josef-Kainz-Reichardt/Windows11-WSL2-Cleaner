import type { CheckEntry } from '@main/checks/types'

export interface Phases {
  /** WSL checks with no sudo requirement, safe to run in any order (build artifacts + caches). */
  wslNonSudo: CheckEntry[]
  wslDocker: CheckEntry[]
  /** sudo-requiring WSL checks except fstrim, which always runs last. */
  wslSudo: CheckEntry[]
  wslFstrim: CheckEntry[]
  /** All Windows-side checks except VHDX compaction. */
  windows: CheckEntry[]
  /** Needs WSL fully shut down first — always the final phase. */
  vhdx: CheckEntry[]
}

/** cleaner.sh script id, falling back to the app-level id when unset — several
 * CheckDefinitions (one per WSL distro) can share the same scriptId. */
function scriptIdOf(c: CheckEntry): string {
  return c.definition.scriptId ?? c.definition.id
}

export function planPhases(checks: CheckEntry[]): Phases {
  const wslNonSudo = checks.filter(
    (c) => c.definition.platform === 'wsl' && !c.definition.requiresSudo && c.definition.id !== 'wsl-docker-prune'
  )
  const wslDocker = checks.filter((c) => c.definition.id === 'wsl-docker-prune')
  const wslSudo = checks.filter(
    (c) => c.definition.platform === 'wsl' && c.definition.requiresSudo && scriptIdOf(c) !== 'wsl-fstrim'
  )
  const wslFstrim = checks.filter((c) => scriptIdOf(c) === 'wsl-fstrim')
  const windows = checks.filter((c) => c.definition.platform === 'windows' && c.definition.category !== 'vhdx-compaction')
  const vhdx = checks.filter((c) => c.definition.category === 'vhdx-compaction')
  return { wslNonSudo, wslDocker, wslSudo, wslFstrim, windows, vhdx }
}
