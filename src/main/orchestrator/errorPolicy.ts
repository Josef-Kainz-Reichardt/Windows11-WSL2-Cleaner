/** Conservative rule from the design: if Rancher never came up, also skip VHDX
 * compaction for Rancher-managed distros (not just docker-prune), since a
 * shutdown/compact cycle against a backend that failed to start is unreliable. */
export function isRancherDependentCheckId(id: string): boolean {
  return id === 'wsl-docker-prune' || id.startsWith('vhdx-rancher')
}

/** win-installer-quarantine-purge deletes already-quarantined ZIPs — safe in itself,
 * but should only run unattended as part of "Alles bereinigen" if the user opted
 * into that via settings; otherwise it's meant to be triggered individually. */
export function isAutoDeleteGatedCheckId(id: string): boolean {
  return id === 'win-installer-quarantine-purge'
}

/** A sudo-auth failure is treated as fatal for ALL remaining sudo checks in the
 * same run — retrying with the same (wrong) password would just prompt-loop. */
export function looksLikeSudoAuthFailure(errorMessage: string | undefined): boolean {
  if (!errorMessage) return false
  return /sudo/i.test(errorMessage) && /(authentication|password)/i.test(errorMessage)
}
