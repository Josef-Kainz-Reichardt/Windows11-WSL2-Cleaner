import type { CheckEntry, LogSink } from '@main/checks/types'
import type { CheckStatus, CleanResult, RunOptions } from '@shared/types'
import { safeClean } from '@main/checks/safeRun'
import { getChecks, buildCheckContext, isCheckDisabled, getSettings } from '@main/state/appState'
import { planPhases } from './sequence'
import { isRancherDependentCheckId, isAutoDeleteGatedCheckId, looksLikeSudoAuthFailure } from './errorPolicy'
import { startRancherDesktop, stopRancherDesktop } from '@main/rancherDesktop/rdctl'
import { shutdownWsl } from '@main/util/wslShutdown'

export type ProgressCallback = (checkId: string, status: CheckStatus) => void
export type MultiLogSink = (checkId: string, level: 'info' | 'warn' | 'error', message: string) => void

function skipped(checkId: string, dryRun: boolean, reason: string): CleanResult {
  return { checkId, bytesFreed: 0, dryRun, log: [], error: reason }
}

async function runOne(
  entry: CheckEntry,
  opts: RunOptions,
  onLogAll: MultiLogSink,
  onProgress: ProgressCallback
): Promise<CleanResult> {
  onProgress(entry.definition.id, 'running')
  const ctx = buildCheckContext()
  const onLog: LogSink = (level, message) => onLogAll(entry.definition.id, level, message)
  const result = await safeClean(entry, ctx, opts, onLog)
  onProgress(entry.definition.id, result.error ? 'error' : 'done')
  return result
}

/**
 * Runs every check in the correct dependency order (see docs/plan): WSL
 * build-artifacts/caches, then docker-prune, then sudo batch, then fstrim —
 * concurrently with all Windows-side checks — followed by Rancher/WSL
 * shutdown and, finally, VHDX compaction. Continues past individual check
 * failures except for the two documented cutoffs (sudo auth failure, Rancher
 * failing to start).
 */
export async function runCleanAll(opts: RunOptions, onLog: MultiLogSink, onProgress: ProgressCallback): Promise<CleanResult[]> {
  const allChecks = getChecks()
  const autoDeleteOptedOut = (id: string): boolean => isAutoDeleteGatedCheckId(id) && !getSettings().installerQuarantineAutoDelete
  const checks = allChecks.filter((c) => !isCheckDisabled(c.definition.id) && !autoDeleteOptedOut(c.definition.id))
  const results: CleanResult[] = []

  for (const entry of allChecks) {
    const id = entry.definition.id
    if (!isCheckDisabled(id) && !autoDeleteOptedOut(id)) continue
    onProgress(id, 'skipped')
    results.push(
      skipped(id, opts.dryRun, autoDeleteOptedOut(id) ? 'Auto-Löschen der Quarantäne deaktiviert (Einstellungen)' : 'Check deaktiviert')
    )
  }

  const { wslNonSudo, wslDocker, wslSudo, wslFstrim, windows, vhdx } = planPhases(checks)
  const ctx0 = buildCheckContext()

  const needsRancher = wslDocker.length > 0
  let rancherOk = true

  if (needsRancher && !opts.dryRun) {
    if (ctx0.wslDistro && ctx0.wslUser) {
      rancherOk = await startRancherDesktop(ctx0.profile, ctx0.wslDistro, ctx0.wslUser, 180_000)
    } else {
      rancherOk = false
    }
  }

  const phaseA = (async (): Promise<void> => {
    for (const entry of wslNonSudo) {
      results.push(await runOne(entry, opts, onLog, onProgress))
    }

    for (const entry of wslDocker) {
      if (rancherOk) {
        results.push(await runOne(entry, opts, onLog, onProgress))
      } else {
        onProgress(entry.definition.id, 'skipped')
        results.push(skipped(entry.definition.id, opts.dryRun, 'Rancher/Docker nicht erreichbar'))
      }
    }

    let sudoFailed = false
    for (const entry of wslSudo) {
      if (sudoFailed) {
        onProgress(entry.definition.id, 'skipped')
        results.push(skipped(entry.definition.id, opts.dryRun, 'sudo-Authentifizierung fehlgeschlagen'))
        continue
      }
      const r = await runOne(entry, opts, onLog, onProgress)
      results.push(r)
      if (looksLikeSudoAuthFailure(r.error)) sudoFailed = true
    }

    for (const entry of wslFstrim) {
      if (sudoFailed) {
        onProgress(entry.definition.id, 'skipped')
        results.push(skipped(entry.definition.id, opts.dryRun, 'sudo-Authentifizierung fehlgeschlagen'))
        continue
      }
      const r = await runOne(entry, opts, onLog, onProgress)
      results.push(r)
    }
  })()

  const phaseB = Promise.all(
    windows.map(async (entry) => {
      results.push(await runOne(entry, opts, onLog, onProgress))
    })
  )

  await Promise.all([phaseA, phaseB])

  let rancherStopOk = true
  if (!opts.dryRun && vhdx.length > 0 && ctx0.wslDistro && ctx0.wslUser) {
    if (needsRancher) rancherStopOk = await stopRancherDesktop(ctx0.wslDistro, ctx0.wslUser, 30_000)
    await shutdownWsl(60_000)
  }

  for (const entry of vhdx) {
    if ((!rancherOk || !rancherStopOk) && isRancherDependentCheckId(entry.definition.id)) {
      onProgress(entry.definition.id, 'skipped')
      results.push(skipped(entry.definition.id, opts.dryRun, 'Rancher nicht erreichbar, VHDX-Kompaktierung übersprungen'))
      continue
    }
    results.push(await runOne(entry, opts, onLog, onProgress))
  }

  return results
}
