import { execFile, spawn } from 'node:child_process'
import { execWslDistro } from '@main/util/wslExec'
import { closeMainWindow } from './closeMainWindow'
import { confirmRancherAction } from './confirm'
import { emitRancherStatus } from '@main/events/bus'
import type { MachineProfile } from '@shared/types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function dockerReachable(distro: string, user: string): Promise<boolean> {
  const res = await execWslDistro(distro, user, ['docker', 'info'], 15_000)
  return res.code === 0
}

export async function startRancherDesktop(
  profile: MachineProfile,
  distro: string,
  user: string,
  timeoutMs = 180_000
): Promise<boolean> {
  const rdctlPath = profile.rancherDesktop.rdctlPath
  if (!rdctlPath) {
    emitRancherStatus({ state: 'error', message: 'rdctl.exe not found — is Rancher Desktop installed?' })
    return false
  }

  if (await dockerReachable(distro, user)) {
    emitRancherStatus({ state: 'running', message: 'already running' })
    return true
  }

  const proceed = await confirmRancherAction('start', 'Docker wird für den nächsten Schritt benötigt. Rancher Desktop jetzt starten?')
  if (!proceed) {
    emitRancherStatus({ state: 'error', message: 'Start durch Nutzer abgelehnt' })
    return false
  }

  emitRancherStatus({ state: 'starting' })
  spawn(rdctlPath, ['start'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref()

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await sleep(5_000)
    if (await dockerReachable(distro, user)) {
      emitRancherStatus({ state: 'running', message: `ready after ${Math.round((Date.now() - start) / 1000)}s` })
      return true
    }
    emitRancherStatus({ state: 'starting', message: `waiting… ${Math.round((Date.now() - start) / 1000)}s` })
  }

  emitRancherStatus({ state: 'error', message: `did not become ready within ${timeoutMs / 1000}s` })
  return false
}

/**
 * Stops Rancher Desktop. Success is judged by the Windows-side process actually
 * exiting (via close-main-window.ps1's graceful-close-then-force-kill), NOT by
 * docker becoming unreachable: Rancher's docker daemon runs inside the
 * rancher-desktop WSL distro, so closing (or hiding-to-tray, which is the app's
 * default and *not* an exit) the Windows GUI doesn't stop it — only the
 * `wsl --shutdown` that cleanAll runs right after this does. Waiting on
 * dockerReachable here previously ran out the full timeout on every single run,
 * left the app alive in the tray (red icon), and then blocked the later
 * VHDX compaction (diskpart "file in use") because the process never actually quit.
 */
export async function stopRancherDesktop(distro: string, user: string, settleTimeoutMs = 30_000): Promise<boolean> {
  if (!(await dockerReachable(distro, user))) {
    emitRancherStatus({ state: 'stopped', message: 'already stopped' })
    return true
  }

  const proceed = await confirmRancherAction(
    'stop',
    'Für die VHDX-Kompaktierung muss Rancher Desktop beendet werden. Jetzt stoppen?'
  )
  if (!proceed) {
    emitRancherStatus({ state: 'error', message: 'Stopp durch Nutzer abgelehnt' })
    return false
  }

  emitRancherStatus({ state: 'stopping' })
  const result = await closeMainWindow('Rancher Desktop')

  if (result === 'NOT_FOUND') {
    emitRancherStatus({ state: 'stopped', message: 'no Rancher Desktop process found' })
    return true
  }
  if (result === 'FORCE_KILL_FAILED') {
    emitRancherStatus({ state: 'error', message: 'Rancher Desktop process could not be terminated' })
    return false
  }

  // Process is confirmed gone (CLOSED_GRACEFULLY or FORCE_KILLED). Give the docker
  // backend a short window to settle for accurate status reporting, but don't block
  // on it — the process being gone is what matters for the shutdown/compact that follows.
  const start = Date.now()
  while (Date.now() - start < settleTimeoutMs) {
    if (!(await dockerReachable(distro, user))) {
      emitRancherStatus({ state: 'stopped', message: `${result} after ${Math.round((Date.now() - start) / 1000)}s` })
      return true
    }
    await sleep(5_000)
  }

  emitRancherStatus({ state: 'stopped', message: `${result}; docker backend still settling` })
  return true
}

export function rdctlStatus(rdctlPath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(rdctlPath, ['status'], { windowsHide: true }, (_error, stdout) => resolve(stdout.toString()))
  })
}
