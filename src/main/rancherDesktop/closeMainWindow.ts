import { execFile } from 'node:child_process'
import { getPsDir } from '@main/util/resourcePaths'
import path from 'node:path'

export type CloseMainWindowResult = 'NOT_FOUND' | 'CLOSED_GRACEFULLY' | 'FORCE_KILLED' | 'FORCE_KILL_FAILED'

/**
 * Wraps the one unavoidable PowerShell dependency: CloseMainWindow() has no Node equivalent.
 * Blocks for up to graceSeconds + a few seconds — the script itself waits out the graceful-close
 * window and force-kills the process if it's still around afterwards (see close-main-window.ps1).
 */
export function closeMainWindow(processName: string, graceSeconds = 20): Promise<CloseMainWindowResult> {
  const scriptPath = path.join(getPsDir(), 'close-main-window.ps1')
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-ProcessName',
        processName,
        '-GraceSeconds',
        String(graceSeconds)
      ],
      { windowsHide: true, timeout: (graceSeconds + 30) * 1000 },
      (_error, stdout) => resolve(stdout.toString().trim() as CloseMainWindowResult)
    )
  })
}
